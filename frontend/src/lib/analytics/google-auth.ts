// frontend/src/lib/analytics/google-auth.ts
// service account（base64 env）→ access token。SERVER ONLY。
import "server-only";
import { GoogleAuth } from "google-auth-library";

const SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
];

let cachedAuth: GoogleAuth | null = null;

/** 是否已設定金鑰（供頁面判斷「未設定」狀態）。 */
export function hasServiceAccount(): boolean {
  return !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
}

function getAuth(): GoogleAuth {
  if (cachedAuth) return cachedAuth;
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!b64) throw new Error("尚未設定 GOOGLE_SERVICE_ACCOUNT_JSON");
  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  } catch {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON 解碼失敗（應為 base64 的 JSON）",
    );
  }
  cachedAuth = new GoogleAuth({ credentials, scopes: SCOPES });
  return cachedAuth;
}

/** 取得一個有效的 access token（google-auth-library 內部快取／自動更新）。 */
export async function getGoogleAccessToken(): Promise<string> {
  const client = await getAuth().getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("取得 Google access token 失敗");
  return token.token;
}
