package migrate

import (
	"testing"
	"testing/fstest"
)

func TestLoadOrdersAndPairsFiles(t *testing.T) {
	fsys := fstest.MapFS{
		"000002_b.up.sql":   {Data: []byte("select 2")},
		"000002_b.down.sql": {Data: []byte("select -2")},
		"000001_a.up.sql":   {Data: []byte("select 1")},
		"000001_a.down.sql": {Data: []byte("select -1")},
		"notasql.txt":       {Data: []byte("abaikan")},
	}
	migs, err := Load(fsys)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if len(migs) != 2 {
		t.Fatalf("harus 2 migrasi, dapat %d", len(migs))
	}
	if migs[0].Version != 1 || migs[1].Version != 2 {
		t.Fatalf("urutan salah: %+v", migs)
	}
	if migs[0].UpSQL != "select 1" || migs[0].DownSQL != "select -1" {
		t.Fatalf("isi migrasi salah: %+v", migs[0])
	}
	if migs[1].Name != "b" {
		t.Fatalf("nama salah: %s", migs[1].Name)
	}
}

func TestLoadRejectsMigrationWithoutDown(t *testing.T) {
	fsys := fstest.MapFS{"000001_a.up.sql": {Data: []byte("select 1")}}
	if _, err := Load(fsys); err == nil {
		t.Fatal("migrasi tanpa file down harus ditolak (harus reversible)")
	}
}
