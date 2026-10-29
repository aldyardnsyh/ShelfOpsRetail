package rbac

import "testing"

// TC-AUTH-01 (bagian otorisasi): matriks izin PRD §13.1 diuji per role.
func TestMatrixMatchesSpec(t *testing.T) {
	cases := []struct {
		role Role
		perm Permission
		want bool
	}{
		{RoleAdmin, PermWorkspaceManage, true},
		{RoleAdmin, PermProviderManage, true},
		{RoleAdmin, PermBenchmarkRun, true},
		{RoleAdmin, PermDataDelete, true},
		{RoleAdmin, PermEvalRun, true},

		{RoleAnalyst, PermWorkspaceManage, false},
		{RoleAnalyst, PermDocumentWrite, true},
		{RoleAnalyst, PermAuditWrite, true},
		{RoleAnalyst, PermAlertUpdate, true},
		{RoleAnalyst, PermTaskWrite, true},
		{RoleAnalyst, PermEvalRun, true},
		{RoleAnalyst, PermTraceRead, true},
		{RoleAnalyst, PermBenchmarkRun, false},
		{RoleAnalyst, PermDataDelete, false},

		{RoleAuditor, PermDocumentWrite, false},
		{RoleAuditor, PermDocumentRead, true},
		{RoleAuditor, PermChatUse, true},
		{RoleAuditor, PermAuditWrite, true},
		{RoleAuditor, PermAlertUpdate, true},
		{RoleAuditor, PermTaskWrite, true},
		{RoleAuditor, PermEvalRead, false},
		{RoleAuditor, PermTraceRead, false},
		{RoleAuditor, PermBenchmarkRun, false},

		{RoleViewer, PermDocumentRead, true},
		{RoleViewer, PermDashboardRead, true},
		{RoleViewer, PermChatUse, true},
		{RoleViewer, PermAuditRead, true},
		{RoleViewer, PermAuditWrite, false},
		{RoleViewer, PermAlertUpdate, false},
		{RoleViewer, PermTaskWrite, false},
		{RoleViewer, PermDocumentWrite, false},
		{RoleViewer, PermEvalRead, false},
	}

	for _, c := range cases {
		if got := Can(c.role, c.perm); got != c.want {
			t.Errorf("Can(%s, %s) = %v, mau %v", c.role, c.perm, got, c.want)
		}
	}
}

func TestUnknownRoleIsDenied(t *testing.T) {
	if Can(Role("superadmin"), PermDocumentRead) {
		t.Fatal("role tak dikenal tidak boleh punya izin apa pun")
	}
	if Permissions(Role("superadmin")) != nil {
		t.Fatal("Permissions role tak dikenal harus nil")
	}
}

func TestParseRole(t *testing.T) {
	if _, err := ParseRole("admin"); err != nil {
		t.Fatalf("admin harus valid: %v", err)
	}
	if _, err := ParseRole("root"); err == nil {
		t.Fatal("root harus ditolak")
	}
}

func TestAdminHasAllPermissions(t *testing.T) {
	for _, p := range AllPermissions() {
		if !Can(RoleAdmin, p) {
			t.Errorf("admin harus punya %s", p)
		}
	}
}

func TestPermissionsListIsComplete(t *testing.T) {
	got := Permissions(RoleViewer)
	if len(got) != 4 {
		t.Fatalf("viewer harus punya 4 izin, dapat %d: %v", len(got), got)
	}
}
