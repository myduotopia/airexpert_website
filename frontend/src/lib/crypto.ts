// 對稱加密（AES-256-GCM）— SERVER ONLY。用於把 admin 貼上的 API key 等機密
// 加密後存進 site_settings（is_public=false）。金鑰來自 server 端 env SETTINGS_ENC_KEY
// （base64 編碼的 32 bytes）。prod 在 Vercel env 設定，切勿外流或加 NEXT_PUBLIC_ 前綴。
import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key(): Buffer {
  const b64 = process.env.SETTINGS_ENC_KEY;
  if (!b64) throw new Error("缺少 SETTINGS_ENC_KEY（server 端機密加密金鑰）");
  const k = Buffer.from(b64, "base64");
  if (k.length !== 32) {
    throw new Error("SETTINGS_ENC_KEY 需為 base64 編碼的 32 bytes");
  }
  return k;
}

/** 加密純文字 → "iv.tag.ciphertext"（皆 base64）。 */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    enc.toString("base64"),
  ].join(".");
}

/** 解密 "iv.tag.ciphertext"。格式錯誤或驗證失敗會丟錯。 */
export function decryptSecret(blob: string): string {
  const [ivB, tagB, encB] = blob.split(".");
  if (!ivB || !tagB || !encB) throw new Error("密文格式錯誤");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(ivB, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encB, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
