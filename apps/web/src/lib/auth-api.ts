export interface Account {
  userId: string;
  fullName: string;
  email: string;
  roles: string[];
  permissions: string[];
}

export interface Session {
  accessToken: string;
  expiresIn: number;
  user: Account;
}

export class AuthError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

const messages: Record<number, string> = {
  400: "Vui lòng kiểm tra lại thông tin đã nhập.",
  401: "Email hoặc mật khẩu không đúng, hoặc tài khoản chưa được kích hoạt.",
  403: "Yêu cầu đăng nhập chưa được cho phép. Vui lòng kiểm tra cấu hình truy cập.",
  429: "Bạn đã thử quá nhiều lần. Vui lòng đợi một phút rồi thử lại.",
};

async function authRequest(path: string, body?: object): Promise<unknown> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  if (!baseUrl) throw new AuthError("Chưa cấu hình địa chỉ API cho giao diện.", 0);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/v1/auth/${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRF-Protection": "1" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new AuthError("Không kết nối được hệ thống. Vui lòng kiểm tra backend và thử lại.", 0);
  }
  if (!response.ok) throw new AuthError(messages[response.status] ?? "Hệ thống đang gặp lỗi. Vui lòng thử lại sau.", response.status);
  try {
    const envelope: unknown = await response.json();
    if (typeof envelope !== "object" || envelope === null || !("data" in envelope)) throw new Error();
    return envelope.data;
  } catch {
    throw new AuthError("Phản hồi từ hệ thống không hợp lệ.", 0);
  }
}

function parseSession(value: unknown): Session {
  if (typeof value !== "object" || value === null) throw new AuthError("Phiên đăng nhập không hợp lệ.", 0);
  const session = value as Partial<Session>;
  const user = session.user;
  if (typeof session.accessToken !== "string" || !session.accessToken || typeof session.expiresIn !== "number" || session.expiresIn <= 0 || !user || typeof user.userId !== "string" || typeof user.fullName !== "string" || typeof user.email !== "string" || !Array.isArray(user.roles) || !user.roles.every((role: unknown) => typeof role === "string") || !Array.isArray(user.permissions) || !user.permissions.every((permission: unknown) => typeof permission === "string")) {
    throw new AuthError("Phiên đăng nhập không hợp lệ.", 0);
  }
  return session as Session;
}

async function withCookieLock<T>(request: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return await navigator.locks.request("lumikids-auth-cookie", request);
  }
  return request();
}

export async function login(email: string, password: string): Promise<Session> {
  return withCookieLock(async () => parseSession(await authRequest("login", { email: email.trim().toLowerCase(), password })));
}

let refreshInFlight: Promise<Session> | null = null;

// Share one refresh request across React StrictMode effects and callers.
export function refreshSession(): Promise<Session> {
  if (!refreshInFlight) {
    refreshInFlight = withCookieLock(async () => parseSession(await authRequest("refresh-token"))).finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

export async function logout(): Promise<void> {
  if (refreshInFlight) await refreshInFlight.catch(() => undefined);
  await withCookieLock(() => authRequest("logout"));
}
