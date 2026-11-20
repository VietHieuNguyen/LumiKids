import {
  MAIL_LOGO_CID,
  MAIL_LOGO_HEIGHT,
  MAIL_LOGO_PNG_BASE64,
  MAIL_LOGO_WIDTH,
} from '../../common/mail/mail-logo.js';

/**
 * The guardian verification email. Table layout with inline styles so it renders the same in Gmail,
 * Outlook and phone mail apps. The logo travels inline (CID) so it shows without loading remote images.
 * Colours follow the web theme: cream #f8f7f0, paper #fffdf8, ink #20382b, leaf #527b55, line #dfe2d9.
 */
export interface VerificationMailInput {
  to: string;
  code: string;
  ttlMinutes: number;
  fullName?: string;
  /** Web origin for the "open the verification page" button; omitted when unknown. */
  webUrl?: string;
}

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);

/** "Nguyễn Thị Lan" → "Lan": Vietnamese greet by the given name (last word). */
function givenName(fullName?: string): string {
  return fullName?.trim().split(/\s+/).pop() ?? '';
}

export function verificationMail({ to, code, ttlMinutes, fullName, webUrl }: VerificationMailInput) {
  const name = givenName(fullName);
  const greeting = name ? `Xin chào ${name},` : 'Xin chào,';
  const link = webUrl ? `${webUrl.replace(/\/$/, '')}/verify-email?email=${encodeURIComponent(to)}` : '';
  const font = "'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

  const text = [
    greeting,
    '',
    'Cảm ơn bạn đã đăng ký tài khoản phụ huynh LumiKids.',
    `Mã xác minh của bạn: ${code}`,
    `Mã có hiệu lực trong ${ttlMinutes} phút và chỉ dùng được một lần.`,
    ...(link ? ['', `Nhập mã tại: ${link}`] : []),
    '',
    'Không chia sẻ mã này với bất kỳ ai. LumiKids không bao giờ hỏi mã qua điện thoại hay tin nhắn.',
    'Nếu bạn không đăng ký LumiKids, hãy bỏ qua email này: tài khoản sẽ không được kích hoạt.',
    '',
    '— LumiKids · Học mà chơi, chơi mà học',
  ].join('\n');

  const button = link
    ? `<tr><td align="center" style="padding:8px 40px 28px">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td align="center" bgcolor="#20382b" style="border-radius:999px">
      <a href="${escape(link)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${font};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px">Mở trang xác minh</a>
    </td>
  </tr></table>
</td></tr>`
    : '';

  const html = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Mã xác minh LumiKids</title>
</head>
<body style="margin:0;padding:0;background:#f8f7f0;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f8f7f0">Mã xác minh của bạn là ${code}, hiệu lực ${ttlMinutes} phút.&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f8f7f0" style="background:#f8f7f0">
<tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
    <tr><td style="padding:0 8px 20px;font-family:${font}">
      <img src="cid:${MAIL_LOGO_CID}" width="${Math.round(MAIL_LOGO_WIDTH * 0.42)}" height="${Math.round(MAIL_LOGO_HEIGHT * 0.42)}" alt="LumiKids" style="display:inline-block;border:0;outline:none;vertical-align:middle">
      <span style="font-size:22px;font-weight:800;color:#20382b;vertical-align:middle;padding-left:10px">Lumi<span style="color:#036e66">Kids</span></span>
    </td></tr>
    <tr><td bgcolor="#fffdf8" style="background:#fffdf8;border:1px solid #dfe2d9;border-radius:20px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="height:6px;background:#527b55;border-radius:20px 20px 0 0;font-size:0;line-height:0">&nbsp;</td></tr>
        <tr><td style="padding:32px 40px 8px;font-family:${font};color:#20382b">
          <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#527b55">Xác minh email</p>
          <h1 style="margin:0 0 18px;font-size:24px;line-height:1.3;font-weight:800;color:#20382b">Một bước nữa để cùng con vào LumiKids</h1>
          <p style="margin:0 0 10px;font-size:15px;line-height:1.6">${escape(greeting)}</p>
          <p style="margin:0;font-size:15px;line-height:1.6;color:#3d5446">Cảm ơn bạn đã đăng ký tài khoản phụ huynh. Nhập mã dưới đây vào trang xác minh để kích hoạt tài khoản.</p>
        </td></tr>
        <tr><td align="center" style="padding:24px 40px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td align="center" bgcolor="#eef4ec" style="background:#eef4ec;border:1px dashed #9bb89c;border-radius:16px;padding:20px 12px">
              <p style="margin:0 0 6px;font-family:${font};font-size:12px;font-weight:600;color:#527b55">Mã xác minh của bạn</p>
              <p style="margin:0;font-family:'SFMono-Regular',Consolas,'Courier New',monospace;font-size:26px;line-height:1.2;font-weight:700;letter-spacing:4px;white-space:nowrap;color:#20382b">${code}</p>
              <p style="margin:10px 0 0;font-family:${font};font-size:13px;color:#5f6f64">Hiệu lực trong <strong style="color:#20382b">${ttlMinutes} phút</strong> · chỉ dùng một lần</p>
            </td>
          </tr></table>
        </td></tr>
        ${button}
        <tr><td style="padding:0 40px 32px;font-family:${font}">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td bgcolor="#fdf3d6" style="background:#fdf3d6;border-radius:12px;padding:14px 16px;font-size:13px;line-height:1.6;color:#805b13">
              <strong>Giữ an toàn cho tài khoản:</strong> không chia sẻ mã này với bất kỳ ai. LumiKids không bao giờ hỏi mã qua điện thoại hay tin nhắn.
            </td>
          </tr></table>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:20px 16px 0;font-family:${font};font-size:12px;line-height:1.6;color:#7b8a80;text-align:center">
      Bạn nhận email này vì địa chỉ ${escape(to)} vừa được dùng để đăng ký LumiKids.<br>
      Nếu không phải bạn, hãy bỏ qua email này: tài khoản sẽ không được kích hoạt.<br>
      <span style="color:#527b55;font-weight:600">LumiKids</span> · Học mà chơi, chơi mà học
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;

  return {
    to,
    subject: `${code} là mã xác minh LumiKids của bạn`,
    text,
    html,
    inlineImages: [{ cid: MAIL_LOGO_CID, filename: 'lumikids-logo.png', contentBase64: MAIL_LOGO_PNG_BASE64 }],
  };
}
