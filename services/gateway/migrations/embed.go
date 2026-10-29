package migrations

import "embed"

// FS memuat seluruh migrasi SQL (expand/contract, selalu reversible).
//
//go:embed *.sql
var FS embed.FS
