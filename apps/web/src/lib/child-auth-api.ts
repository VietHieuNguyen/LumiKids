export interface ChildAccount {
  childId: string;
  fullName: string;
  permissions: string[];
}

export interface ChildSession {
  accessToken: string;
  expiresIn: number;
  child: ChildAccount;
}

export class ChildAuthError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

const messages: Record<number, string> = {
  400: "Con kiểm tra lại mã nhé.",
  401: "Mã đăng nhập chưa đúng. Con nhờ cô kiểm tra lại mã nhé.",
  403: "Yêu cầu đăng nhập chưa được cho phép. Vui lòng kiểm tra cấu hình truy cập.",
  429: "Con đã thử nhiều lần quá. Đợi một chút rồi thử lại nhé.",
};

/** Child sign-in has its own refresh cookie (path /api/v1/auth/child), separate from the adult one. */
async function childAuthRequest(path: string, body?: object): Promise<unknown> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  if (!baseUrl) throw new ChildAuthError("Chưa cấu hình địa chỉ API cho giao diện.", 0);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/v1/auth/child/${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRF-Protection": "1" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ChildAuthError("Chưa kết nối được hệ thống. Nhờ người lớn kiểm tra mạng nhé.", 0);
  }
  if (!response.ok) throw new ChildAuthError(messages[response.status] ?? "Hệ thống đang bận. Con thử lại sau nhé.", response.status);
  try {
    const envelope: unknown = await response.json();
    if (typeof envelope !== "object" || envelope === null || !("data" in envelope)) throw new Error();
    return envelope.data;
  } catch {
    throw new ChildAuthError("Phản hồi từ hệ thống không hợp lệ.", 0);
  }
}

function parseChildSession(value: unknown): ChildSession {
  if (typeof value !== "object" || value === null) throw new ChildAuthError("Phiên đăng nhập không hợp lệ.", 0);
  const session = value as Partial<ChildSession>;
  const child = session.child;
  if (typeof session.accessToken !== "string" || !session.accessToken || typeof session.expiresIn !== "number" || session.expiresIn <= 0 || !child || typeof child.childId !== "string" || typeof child.fullName !== "string" || !Array.isArray(child.permissions) || !child.permissions.every((permission: unknown) => typeof permission === "string")) {
    throw new ChildAuthError("Phiên đăng nhập không hợp lệ.", 0);
  }
  return session as ChildSession;
}

async function withCookieLock<T>(request: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return await navigator.locks.request("lumikids-child-auth-cookie", request);
  }
  return request();
}

export async function childLogin(code: string): Promise<ChildSession> {
  return withCookieLock(async () => parseChildSession(await childAuthRequest("login", { code })));
}

let refreshInFlight: Promise<ChildSession> | null = null;

export function refreshChildSession(): Promise<ChildSession> {
  if (!refreshInFlight) {
    refreshInFlight = withCookieLock(async () => parseChildSession(await childAuthRequest("refresh-token"))).finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

export async function childLogout(): Promise<void> {
  if (refreshInFlight) await refreshInFlight.catch(() => undefined);
  await withCookieLock(() => childAuthRequest("logout"));
}
