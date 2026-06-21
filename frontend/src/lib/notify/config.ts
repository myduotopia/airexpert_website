// 聯絡通知設定的「純」解析 / 整形函式。
// 不引入 server-only / crypto，方便單元測試（解析、遮罩、收件人清單）。

/** site_settings.contact_notify 的儲存形狀（value）。機密皆為加密字串。 */
export interface ContactNotifyValue {
  email_recipients?: string[];
  from_email?: string;
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
  lineTargetId: string;
  hasResendKey: boolean;
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
    lineTargetId: value.line_target_id ?? "",
    hasResendKey: Boolean(value.resend_key_enc),
    hasLineToken: Boolean(value.line_token_enc),
  };
}
