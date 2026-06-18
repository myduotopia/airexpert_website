import { randomBytes } from "node:crypto";

// crypto.ts 需要 SETTINGS_ENC_KEY；測試環境給一把臨時金鑰。
if (!process.env.SETTINGS_ENC_KEY) {
  process.env.SETTINGS_ENC_KEY = randomBytes(32).toString("base64");
}
