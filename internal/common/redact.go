package common

import (
	"regexp"
	"strings"
)

type sensitiveTextPattern struct {
	pattern     *regexp.Regexp
	replacement string
}

var sensitiveTextPatterns = []sensitiveTextPattern{
	{regexp.MustCompile(`(?i)([a-z][a-z0-9+.\-]*://)[^@\s/]+(@)`), "${1}***${2}"},
	{regexp.MustCompile(`(?i)(authorization\s*:\s*bearer\s+)[^\s,;]+`), "${1}***"},
	{regexp.MustCompile(`(?i)(bearer\s+)[A-Za-z0-9._~+/\-]+=*`), "${1}***"},
	{regexp.MustCompile(`(?i)((?:token|secret|password|passwd|api[_-]?key)\s*[:=]\s*)("[^"]+"|'[^']+'|[^\s,;]+)`), "${1}***"},
}

func RedactSensitiveText(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	for _, item := range sensitiveTextPatterns {
		value = item.pattern.ReplaceAllString(value, item.replacement)
	}
	return value
}
