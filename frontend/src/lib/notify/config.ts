// 聯絡通知設定的「純」解析 / 整形函式。
// 不引入 server-only / crypto，方便單元測試（解析、遮罩、收件人清單）。

/** site_settings.contact_notify 的儲存形狀（value）。機密皆為加密字串。 */
export interface ContactNotifyValue {
  email_recipients?: string[];
  from_email?: string;
  // SMTP（email 管道）— 取代原 Resend。密碼加密存 smtp_pass_enc。
  smtp_host?: string;
  smtp_port?: number;
  /** true=465/SSL；false=587/STARTTLS。 */
  smtp_secure?: boolean;
  smtp_user?: string;
  smtp_pass_enc?: string;
  /** @deprecated 已改用 SMTP；保留欄位僅供向後相容，不再讀取。 */
  resend_key_enc?: string;
  line_token_enc?: string;
  line_target_id?: string;
}

/**
 * 回傳給 client 的公開設定（絕不含明文機密，只給 has* 布林）。
 * 與 getAiConfig 的 hasDbKey 遮罩模式一致。
 */
export interface ContactNotifyPublic {
  emailRecipients: string[];
  fromEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  hasSmtpPass: boolean;
  lineTargetId: string;
  hasLineToken: boolean;
}

/**
 * 解析使用者輸入的收件人字串（以逗號 / 分號 / 換行分隔）→ 去空白、去重、過濾空字串。
 * 純函式，供設定頁 server action 與測試共用。
 */
export function parseRecipients(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\n,;]+/)) {
    const v = part.trim();
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

/** 由儲存的 value 整形出公開設定（遮罩機密）。純函式。 */
export function toPublicConfig(value: ContactNotifyValue): ContactNotifyPublic {
  return {
    emailRecipients: Array.isArray(value.email_recipients)
      ? value.email_recipients
      : [],
    fromEmail: value.from_email ?? "",
    smtpHost: value.smtp_host ?? "",
    smtpPort: typeof value.smtp_port === "number" ? value.smtp_port : 587,
    smtpSecure: Boolean(value.smtp_secure),
    smtpUser: value.smtp_user ?? "",
    hasSmtpPass: Boolean(value.smtp_pass_enc),
    lineTargetId: value.line_target_id ?? "",
    hasLineToken: Boolean(value.line_token_enc),
  };
}
