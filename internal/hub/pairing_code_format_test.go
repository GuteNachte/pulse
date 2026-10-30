package hub

import "testing"

func TestSixDigitPairingCodeFormat(t *testing.T) {
	tests := []struct {
		input      string
		normalized string
		valid      bool
	}{
		{input: "123456", normalized: "123456", valid: true},
		{input: " 123-456 ", normalized: "123456", valid: true},
		{input: "123 456", normalized: "123456", valid: true},
		{input: "ABCDEF", normalized: "ABCDEF", valid: false},
		{input: "12A456", normalized: "12A456", valid: false},
		{input: "12_456", normalized: "12_456", valid: false},
		{input: "12345", normalized: "12345", valid: false},
	}

	for _, test := range tests {
		t.Run(test.input, func(t *testing.T) {
			normalized := normalizePairingCode(test.input)
			if normalized != test.normalized {
				t.Fatalf("normalizePairingCode(%q) = %q, want %q", test.input, normalized, test.normalized)
			}
			if valid := isSixDigitPairingCode(normalized); valid != test.valid {
				t.Fatalf("isSixDigitPairingCode(%q) = %v, want %v", normalized, valid, test.valid)
			}
		})
	}
}
