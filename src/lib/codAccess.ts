const PRIVILEGED_ROLES = new Set(["super_admin", "admin", "owner"]);

type CODAccessInput = {
  operation?: { slug?: string | null; name?: string | null } | null;
  userRole?: string | null;
  roles?: readonly string[] | null;
  isAdmin?: boolean;
  /** True quando a página /dashboard/cod foi liberada nas permissões do usuário */
  hasPagePermission?: boolean;
};

export function canAccessCOD({ operation, userRole, roles, isAdmin, hasPagePermission }: CODAccessInput): boolean {
  if (isAdmin) return true;

  // Permissão explícita concedida pelo admin (user_page_permissions) sempre libera.
  if (hasPagePermission) return true;

  const roleCandidates = [userRole, ...(roles ?? [])]
    .filter(Boolean)
    .map((role) => String(role).toLowerCase());

  if (roleCandidates.some((role) => PRIVILEGED_ROLES.has(role))) return true;


  const slug = (operation?.slug ?? "").toLowerCase();
  const name = (operation?.name ?? "").toLowerCase();
  return slug.includes("gtx") || name.includes("gtx");
}