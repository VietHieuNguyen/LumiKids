/** Where an adult lands after signing in without a `?next=`: their main working screen. */
export function homeFor(permissions: readonly string[]): string {
  if (permissions.includes("MANAGE_CLASSROOMS")) return "/admin";
  if (permissions.includes("READ_OWN_CLASSROOMS")) return "/teacher/classrooms";
  if (permissions.includes("MANAGE_FAMILY")) return "/family";
  return "/account";
}
