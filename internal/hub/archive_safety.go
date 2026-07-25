package hub

import (
	"archive/zip"
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
)

type archiveLimits struct {
	MaxEntries          int
	MaxEntryBytes       uint64
	MaxUncompressed     uint64
	MaxCompressionRatio float64
}

type archiveEntry struct {
	Path   string `json:"path"`
	Size   uint64 `json:"size"`
	SHA256 string `json:"sha256"`
}

type archiveInspection struct {
	Entries []archiveEntry
	byPath  map[string]archiveEntry
}

func defaultArchiveLimits() archiveLimits {
	return archiveLimits{
		MaxEntries:          10_000,
		MaxEntryBytes:       128 << 20,
		MaxUncompressed:     4 << 30,
		MaxCompressionRatio: 200,
	}
}

func inspectZip(filename string, limits archiveLimits) (*archiveInspection, error) {
	reader, err := zip.OpenReader(filename)
	if err != nil {
		return nil, fmt.Errorf("open archive: %w", err)
	}
	defer reader.Close()

	if limits.MaxEntries <= 0 || len(reader.File) > limits.MaxEntries {
		return nil, fmt.Errorf("archive has too many entries: %d", len(reader.File))
	}

	inspection := &archiveInspection{byPath: make(map[string]archiveEntry, len(reader.File))}
	var total uint64
	for _, file := range reader.File {
		cleaned, err := cleanArchivePath(file.Name)
		if err != nil {
			return nil, err
		}
		if file.FileInfo().Mode()&os.ModeSymlink != 0 {
			return nil, fmt.Errorf("archive symbolic links are not allowed: %s", cleaned)
		}
		if file.FileInfo().IsDir() {
			continue
		}
		if _, exists := inspection.byPath[cleaned]; exists {
			return nil, fmt.Errorf("archive contains duplicate entry: %s", cleaned)
		}
		if file.UncompressedSize64 > limits.MaxEntryBytes {
			return nil, fmt.Errorf("archive entry is too large: %s", cleaned)
		}
		if file.UncompressedSize64 > limits.MaxUncompressed || total > limits.MaxUncompressed-file.UncompressedSize64 {
			return nil, errors.New("archive uncompressed size exceeds limit")
		}
		total += file.UncompressedSize64
		if file.UncompressedSize64 > 0 {
			if file.CompressedSize64 == 0 || float64(file.UncompressedSize64)/float64(file.CompressedSize64) > limits.MaxCompressionRatio {
				return nil, fmt.Errorf("archive entry compression ratio exceeds limit: %s", cleaned)
			}
		}

		stream, err := file.Open()
		if err != nil {
			return nil, fmt.Errorf("open archive entry %s: %w", cleaned, err)
		}
		hash := sha256.New()
		read, copyErr := io.Copy(hash, io.LimitReader(stream, int64(limits.MaxEntryBytes)+1))
		closeErr := stream.Close()
		if copyErr != nil {
			return nil, fmt.Errorf("read archive entry %s: %w", cleaned, copyErr)
		}
		if closeErr != nil {
			return nil, fmt.Errorf("close archive entry %s: %w", cleaned, closeErr)
		}
		if uint64(read) != file.UncompressedSize64 {
			return nil, fmt.Errorf("archive entry size mismatch: %s", cleaned)
		}
		entry := archiveEntry{Path: cleaned, Size: uint64(read), SHA256: fmt.Sprintf("%x", hash.Sum(nil))}
		inspection.Entries = append(inspection.Entries, entry)
		inspection.byPath[cleaned] = entry
	}
	sort.Slice(inspection.Entries, func(i, j int) bool { return inspection.Entries[i].Path < inspection.Entries[j].Path })
	return inspection, nil
}

func extractInspectedZip(filename, destination string, inspection *archiveInspection) error {
	if inspection == nil {
		return errors.New("archive inspection is required")
	}
	root, err := filepath.Abs(destination)
	if err != nil {
		return fmt.Errorf("resolve extraction root: %w", err)
	}
	if err := os.MkdirAll(root, 0o755); err != nil {
		return fmt.Errorf("create extraction root: %w", err)
	}
	reader, err := zip.OpenReader(filename)
	if err != nil {
		return fmt.Errorf("open archive: %w", err)
	}
	defer reader.Close()

	for _, file := range reader.File {
		cleaned, err := cleanArchivePath(file.Name)
		if err != nil {
			return err
		}
		target := filepath.Join(root, filepath.FromSlash(cleaned))
		if err := ensurePathWithinRoot(root, target); err != nil {
			return err
		}
		if file.FileInfo().IsDir() {
			if err := os.MkdirAll(target, 0o755); err != nil {
				return fmt.Errorf("create archive directory %s: %w", cleaned, err)
			}
			continue
		}
		expected, exists := inspection.byPath[cleaned]
		if !exists {
			return fmt.Errorf("archive entry was not inspected: %s", cleaned)
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return fmt.Errorf("create archive parent %s: %w", cleaned, err)
		}
		source, err := file.Open()
		if err != nil {
			return fmt.Errorf("open archive entry %s: %w", cleaned, err)
		}
		destinationFile, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
		if err != nil {
			source.Close()
			return fmt.Errorf("create extracted file %s: %w", cleaned, err)
		}
		hash := sha256.New()
		written, copyErr := io.Copy(io.MultiWriter(destinationFile, hash), source)
		closeDestinationErr := destinationFile.Close()
		closeSourceErr := source.Close()
		if copyErr != nil {
			return fmt.Errorf("extract archive entry %s: %w", cleaned, copyErr)
		}
		if closeDestinationErr != nil || closeSourceErr != nil {
			return fmt.Errorf("close extracted archive entry %s", cleaned)
		}
		if uint64(written) != expected.Size || fmt.Sprintf("%x", hash.Sum(nil)) != expected.SHA256 {
			return fmt.Errorf("archive entry changed after inspection: %s", cleaned)
		}
	}
	return nil
}

func cleanArchivePath(name string) (string, error) {
	if name == "" || strings.ContainsRune(name, '\x00') || filepath.IsAbs(name) || filepath.VolumeName(name) != "" {
		return "", fmt.Errorf("unsafe archive path: %q", name)
	}
	normalized := strings.ReplaceAll(name, `\`, "/")
	if strings.HasPrefix(normalized, "/") || len(normalized) >= 2 && normalized[1] == ':' {
		return "", fmt.Errorf("unsafe archive path: %q", name)
	}
	for _, segment := range strings.Split(normalized, "/") {
		if segment == ".." {
			return "", fmt.Errorf("unsafe archive path: %q", name)
		}
	}
	cleaned := path.Clean(normalized)
	if cleaned == "." || cleaned == ".." || strings.HasPrefix(cleaned, "../") {
		return "", fmt.Errorf("unsafe archive path: %q", name)
	}
	return strings.TrimSuffix(cleaned, "/"), nil
}

func ensurePathWithinRoot(root, target string) error {
	relative, err := filepath.Rel(root, target)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) || filepath.IsAbs(relative) {
		return fmt.Errorf("unsafe archive extraction target: %s", target)
	}
	return nil
}

func (inspection *archiveInspection) entry(name string) archiveEntry {
	if inspection == nil {
		return archiveEntry{}
	}
	return inspection.byPath[name]
}
