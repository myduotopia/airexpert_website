import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

describe("crypto (AES-256-GCM)", () => {
  it("round-trips（密文不含明文、可正確解回）", () => {
    const plain = "AIza-test-gemini-key-12345";
    const enc = encryptSecret(plain);
    expect(enc).not.toContain(plain);
    expect(enc.split(".")).toHaveLength(3);
    expect(decryptSecret(enc)).toBe(plain);
  });

  it("每次加密用新 IV（同明文 → 不同密文）", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("竄改密文 → 解密丟錯（auth tag 驗證）", () => {
    const [iv, tag] = encryptSecret("x").split(".");
    const tampered = [iv, tag, Buffer.from("zzzzzzzz").toString("base64")].join(
      ".",
    );
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("格式錯誤 → 丟錯", () => {
    expect(() => decryptSecret("not-a-valid-blob")).toThrow("密文格式錯誤");
  });
});
