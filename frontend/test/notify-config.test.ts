import { describe, it, expect } from "vitest";
import {
  parseRecipients,
  toPublicConfig,
  type ContactNotifyValue,
} from "@/lib/notify/config";

describe("notify config — parseRecipients", () => {
  it("以逗號 / 分號 / 換行分隔，去空白", () => {
    const out = parseRecipients("a@x.com, b@x.com;c@x.com\nd@x.com");
    expect(out).toEqual(["a@x.com", "b@x.com", "c@x.com", "d@x.com"]);
  });

  it("去除空白與空字串", () => {
    expect(parseRecipients("  a@x.com  , ,\n, b@x.com ")).toEqual([
      "a@x.com",
      "b@x.com",
    ]);
  });

  it("去重（保留首次出現順序）", () => {
    expect(parseRecipients("a@x.com\na@x.com\nb@x.com")).toEqual([
      "a@x.com",
      "b@x.com",
    ]);
  });

  it("空輸入 → 空陣列", () => {
    expect(parseRecipients("")).toEqual([]);
    expect(parseRecipients("  \n , ; ")).toEqual([]);
  });
});

describe("notify config — toPublicConfig（遮罩機密）", () => {
  it("不外洩明文機密，只給 has* 布林", () => {
    const value: ContactNotifyValue = {
      email_recipients: ["a@x.com"],
      from_email: "no-reply@x.com",
      resend_key_enc: "iv.tag.cipher",
      line_token_enc: "iv.tag.cipher2",
      line_target_id: "U123",
    };
    const pub = toPublicConfig(value);
    expect(pub).toEqual({
      emailRecipients: ["a@x.com"],
      fromEmail: "no-reply@x.com",
      lineTargetId: "U123",
      hasResendKey: true,
      hasLineToken: true,
    });
    // 確認沒有任何加密字串外洩
    expect(JSON.stringify(pub)).not.toContain("cipher");
  });

  it("空 value → 安全預設（has* 皆 false）", () => {
    const pub = toPublicConfig({});
    expect(pub).toEqual({
      emailRecipients: [],
      fromEmail: "",
      lineTargetId: "",
      hasResendKey: false,
      hasLineToken: false,
    });
  });

  it("email_recipients 非陣列 → 退回空陣列", () => {
    const pub = toPublicConfig({
      email_recipients: "oops" as unknown as string[],
    });
    expect(pub.emailRecipients).toEqual([]);
  });
});
