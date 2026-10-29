package migrations

import (
	"io/fs"
	"regexp"
	"sort"
	"strconv"
)

// SeedFile mengembalikan nama berkas seed sample data (idempotent).
const SeedFile = "000004_seed_sample_data.up.sql"

// SeedSQL membaca berkas seed dari FS.
func SeedSQL(fsys fs.FS) (string, error) {
	b, err := fs.ReadFile(fsys, SeedFile)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

var versionOnly = regexp.MustCompile(`^(\d{4,})_`)

// VersionOf mengembalikan versi numerik dari nama berkas migrasi (0 bila bukan).
func VersionOf(name string) int {
	m := versionOnly.FindStringSubmatch(name)
	if m == nil {
		return 0
	}
	v, err := strconv.Atoi(m[1])
	if err != nil {
		return 0
	}
	return v
}

// SortedNames mengurutkan nama berkas migrasi naik (utilitas untuk tooling).
func SortedNames(names []string) []string {
	sort.Slice(names, func(i, j int) bool { return VersionOf(names[i]) < VersionOf(names[j]) })
	return names
}
