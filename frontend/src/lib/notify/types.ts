// 聯絡通知共用型別。純型別 / 純函式可在無 server-only 相依下被測試。

/** 送出通知時用到的聯絡來信資料（與 ContactSubmission 對齊，但允許缺欄位）。 */
export interface ContactNotifyPayload {
  name: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  message: string | null;
  source_page: string | null;
}

/** 單一通知管道的結果（供測試發送頁顯示）。 */
export interface ChannelResult {
  ok: boolean;
  /** 失敗原因（成功時為 undefined）。不含任何機密。 */
  error?: string;
  /** 該管道未設定（如未填收件人 / token）→ 視為略過而非錯誤。 */
  skipped?: boolean;
}

/** notifyContactSubmission 的整體結果，每管道一筆。 */
export interface NotifyResult {
  email: ChannelResult;
  line: ChannelResult;
}
