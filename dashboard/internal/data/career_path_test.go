package data

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveTrackerLayout_dayFilesPreferred(t *testing.T) {
	root := t.TempDir()
	dayDir := filepath.Join(root, "data", "applications")
	if err := os.MkdirAll(dayDir, 0755); err != nil {
		t.Fatal(err)
	}
	// Create a day file
	dayFile := filepath.Join(dayDir, "2026-04-13.md")
	if err := os.WriteFile(dayFile, []byte("| # |\n"), 0644); err != nil {
		t.Fatal(err)
	}
	// Also create the legacy file
	dataFile := filepath.Join(root, "data", "applications.md")
	if err := os.WriteFile(dataFile, []byte("| # |\n"), 0644); err != nil {
		t.Fatal(err)
	}

	layout, dir, _ := resolveTrackerLayout(root)
	if layout != "day" {
		t.Fatalf("expected day layout, got %q", layout)
	}
	if dir != dayDir {
		t.Fatalf("expected day dir %q, got %q", dayDir, dir)
	}
}

func TestResolveTrackerLayout_singleFileFallback(t *testing.T) {
	root := t.TempDir()
	dataDir := filepath.Join(root, "data")
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		t.Fatal(err)
	}
	dataFile := filepath.Join(dataDir, "applications.md")
	if err := os.WriteFile(dataFile, []byte("| # |\n"), 0644); err != nil {
		t.Fatal(err)
	}

	layout, _, single := resolveTrackerLayout(root)
	if layout != "single" {
		t.Fatalf("expected single layout, got %q", layout)
	}
	if single != dataFile {
		t.Fatalf("expected %q, got %q", dataFile, single)
	}
}

func TestResolveTrackerLayout_noTracker(t *testing.T) {
	root := t.TempDir()
	layout, _, _ := resolveTrackerLayout(root)
	if layout != "none" {
		t.Fatalf("expected none layout, got %q", layout)
	}
}
