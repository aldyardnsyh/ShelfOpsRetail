// Package rbac memegang matriks hak akses (PRD §13.1) sebagai satu sumber
// kebenaran. Handler memanggil Can(role, perm) — tidak ada if-role bertebaran.
package rbac

import "fmt"

type Role string

const (
	RoleAdmin   Role = "admin"
	RoleAnalyst Role = "analyst"
	RoleAuditor Role = "auditor"
	RoleViewer  Role = "viewer"
)

type Permission string

const (
	PermWorkspaceManage Permission = "workspace.manage" // kelola workspace, anggota, provider, anggaran
	PermMemberManage    Permission = "member.manage"
	PermProviderManage  Permission = "provider.manage"
	PermDocumentWrite   Permission = "document.write" // upload/hapus dokumen KB
	PermDocumentRead    Permission = "document.read"
	PermChatUse         Permission = "chat.use"
	PermAuditWrite      Permission = "audit.write" // buat audit, upload foto, koreksi bbox
	PermAuditRead       Permission = "audit.read"
	PermDashboardRead   Permission = "dashboard.read"
	PermAlertUpdate     Permission = "alert.update"
	PermTaskWrite       Permission = "task.write" // tool aksi tulis (create task)
	PermEvalRead        Permission = "eval.read"
	PermEvalRun         Permission = "eval.run"
	PermTraceRead       Permission = "trace.read"
	PermBenchmarkRun    Permission = "benchmark.run"
	PermDataDelete      Permission = "data.delete" // hapus data permanen
)

var matrix = map[Role]map[Permission]bool{
	RoleAdmin: {},
	RoleAnalyst: {
		PermDocumentWrite: true,
		PermAuditWrite:    true,
		PermAlertUpdate:   true,
		PermTaskWrite:     true,
		PermEvalRead:      true,
		PermEvalRun:       true,
		PermTraceRead:     true,
	},
	RoleAuditor: {
		PermAuditWrite:  true,
		PermAlertUpdate: true,
		PermTaskWrite:   true,
	},
	RoleViewer: {},
}

// permSelaluAda berlaku untuk semua role yang valid.
var permSelaluAda = []Permission{
	PermDocumentRead, PermChatUse, PermAuditRead, PermDashboardRead,
}

var allPermissions = []Permission{
	PermWorkspaceManage, PermMemberManage, PermProviderManage, PermDocumentWrite,
	PermDocumentRead, PermChatUse, PermAuditWrite, PermAuditRead, PermDashboardRead,
	PermAlertUpdate, PermTaskWrite, PermEvalRead, PermEvalRun, PermTraceRead,
	PermBenchmarkRun, PermDataDelete,
}

func init() {
	// admin: semua izin
	for _, p := range allPermissions {
		matrix[RoleAdmin][p] = true
	}
}

func ValidRole(r Role) bool {
	_, ok := matrix[r]
	return ok
}

func ParseRole(s string) (Role, error) {
	r := Role(s)
	if !ValidRole(r) {
		return "", fmt.Errorf("role tidak dikenal: %q", s)
	}
	return r, nil
}

// Can menjawab apakah role punya izin. Role tak dikenal selalu tidak boleh.
func Can(role Role, perm Permission) bool {
	perms, ok := matrix[role]
	if !ok {
		return false
	}
	if perms[perm] {
		return true
	}
	for _, p := range permSelaluAda {
		if p == perm {
			return true
		}
	}
	return false
}

// Permissions mengembalikan daftar izin efektif (dipakai /me agar UI bisa
// menyembunyikan aksi yang tidak diizinkan — bukan sebagai pengganti cek server).
func Permissions(role Role) []string {
	if !ValidRole(role) {
		return nil
	}
	out := make([]string, 0, len(allPermissions))
	for _, p := range allPermissions {
		if Can(role, p) {
			out = append(out, string(p))
		}
	}
	return out
}

func AllPermissions() []Permission { return append([]Permission(nil), allPermissions...) }
