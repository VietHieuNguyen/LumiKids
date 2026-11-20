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
  constructor(message: string, public readonly status: number, public readonly code?: string) {
    super(message);
  }
}

/** API problem codes whose own Vietnamese message is shown as-is (registration and verification). */
const ownMessageCodes = new Set([
  "ACCOUNT_NOT_VERIFIED",
  "VERIFICATION_INVALID",
  "VERIFICATION_LOCKED",
  "VERIFICATION_TOO_SOON",
  "VERIFICATION_RATE_LIMITED",
]);

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
  if (!response.ok) {
    let code: string | undefined;
    let ownMessage: string | undefined;
    try {
      const envelope: unknown = await response.json();
      if (typeof envelope === "object" && envelope !== null) {
        const problem = envelope as { code?: unknown; message?: unknown };
        if (typeof problem.code === "string") code = problem.code;
        if (code && ownMessageCodes.has(code) && typeof problem.message === "string") ownMessage = problem.message;
      }
    } catch {
      // No JSON body: the status message below is enough.
    }
    throw new AuthError(ownMessage ?? messages[response.status] ?? "Hệ thống đang gặp lỗi. Vui lòng thử lại sau.", response.status, code);
  }
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

/** Change one's own password. The API ends every session of the account, so sign in again after. */
export async function changePassword(accessToken: string, currentPassword: string, newPassword: string): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  if (!baseUrl) throw new AuthError("Chưa cấu hình địa chỉ API cho giao diện.", 0);
  let response: Response;
  try {
    response = await withCookieLock(() =>
      fetch(`${baseUrl}/api/v1/auth/password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Protection": "1", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ currentPassword, newPassword }),
        cache: "no-store",
      }),
    );
  } catch {
    throw new AuthError("Không kết nối được hệ thống. Vui lòng thử lại.", 0);
  }
  if (response.ok) return;
  const byStatus: Record<number, string> = {
    400: "Mật khẩu mới cần 10–128 kí tự và khác mật khẩu cũ.",
    401: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.",
    422: "Mật khẩu hiện tại không đúng.",
    429: "Bạn đã thử quá nhiều lần. Vui lòng đợi một phút rồi thử lại.",
  };
  throw new AuthError(byStatus[response.status] ?? "Chưa đổi được mật khẩu. Vui lòng thử lại.", response.status);
}

export type GuardianRelationship = "MOTHER" | "FATHER" | "GRANDPARENT" | "OTHER";

export interface RegistrationAccepted {
  email: string;
  expiresInMinutes: number;
}

function parseAccepted(value: unknown): RegistrationAccepted {
  const data = value as Partial<RegistrationAccepted> | null;
  if (!data || typeof data.email !== "string" || typeof data.expiresInMinutes !== "number") throw new AuthError("Phản hồi từ hệ thống không hợp lệ.", 0);
  return { email: data.email, expiresInMinutes: data.expiresInMinutes };
}

/** A guardian signs up; the account stays PENDING_VERIFICATION until the emailed 6-digit code is entered. */
export async function registerGuardian(input: { fullName: string; email: string; phone: string; relationship: GuardianRelationship; password: string }): Promise<RegistrationAccepted> {
  return parseAccepted(await authRequest("register", { ...input, fullName: input.fullName.trim(), email: input.email.trim().toLowerCase(), phone: input.phone.trim() }));
}

export async function verifyEmail(email: string, code: string): Promise<void> {
  await authRequest("verify-email", { email: email.trim().toLowerCase(), code: code.trim() });
}

export async function resendVerification(email: string): Promise<RegistrationAccepted> {
  return parseAccepted(await authRequest("verify-email/resend", { email: email.trim().toLowerCase() }));
}
