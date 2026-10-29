import "server-only";

import { ForbiddenBlock } from "@/components/forbidden-block";
import { getMe } from "@/lib/data";
import { can, type Capability } from "@/lib/permissions";

/**
 * Guard server-side untuk halaman terbatas peran.
 *
 * Mengembalikan ReactNode (blok 403) bila role tidak berhak, atau null bila boleh.
 * Dipakai di awal page: `const denied = await guard('integration.manage'); if (denied) return denied;`
 */
export async function guardCapability(
  capability: Capability,
): Promise<React.ReactNode | null> {
  const me = await getMe();
  if (!me.ok) return null; // layout (app) sudah menangani error/redirect
  if (can(me.data.role, capability)) return null;
  return <ForbiddenBlock need={capability === "lab.run" ? "lab" : "admin"} />;
}
