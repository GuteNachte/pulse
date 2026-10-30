package hub

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
)

// assetMediaStore manages the Hub-owned local object directory. Object keys are
// always slash-separated and never expose an operating-system path to callers.
type assetMediaStore struct {
	root string
}

func newAssetMediaStore(root string) *assetMediaStore {
	return &assetMediaStore{root: filepath.Clean(root)}
}

func (store *assetMediaStore) pathFor(key string) (string, error) {
	key = strings.TrimSpace(strings.ReplaceAll(key, "\\", "/"))
	if key == "" || strings.HasPrefix(key, "/") || strings.Contains(key, ":") {
		return "", errors.New("对象键无效")
	}
	path := filepath.Clean(filepath.Join(store.root, filepath.FromSlash(key)))
	rel, err := filepath.Rel(store.root, path)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", errors.New("对象键无效")
	}
	return path, nil
}

func (store *assetMediaStore) write(key string, content []byte) (string, error) {
	path, err := store.pathFor(key)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return "", err
	}
	temporary, err := os.CreateTemp(filepath.Dir(path), ".writing-*")
	if err != nil {
		return "", err
	}
	temporaryName := temporary.Name()
	defer os.Remove(temporaryName)
	if _, err := temporary.Write(content); err != nil {
		temporary.Close()
		return "", err
	}
	if err := temporary.Close(); err != nil {
		return "", err
	}
	if err := os.Rename(temporaryName, path); err != nil {
		return "", err
	}
	return filepath.ToSlash(filepath.Clean(key)), nil
}

func (store *assetMediaStore) remove(key string) error {
	path, err := store.pathFor(key)
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}
