const BASE = "http://lumikids.invalid";

/**
 * Validates where to send the user after login. Only same-site paths are accepted; absolute URLs,
 * protocol-relative ("//host"), backslash tricks, control characters and the login page itself are
 * rejected so `?next=` can never become an open redirect or a loop.
 */
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 512) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return null;
  }
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE || url.pathname === "/login") return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Login link that returns to `next` after a successful sign-in. */
export function loginHref(next: string): string {
  const path = safeReturnPath(next);
  return path ? `/login?next=${encodeURIComponent(path)}` : "/login";
}
