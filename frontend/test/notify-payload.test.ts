import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

// 以 mock 取代 nodemailer，避免測試真的開 SMTP 連線。
// vi.mock 會被提升到檔首，故 mock fn 須以 vi.hoisted 建立才能在 factory 內引用。
// 參數型別讓 TS 推得 calls[0][0]（否則無參數實作會被推成空 tuple，索引報錯）。
const { createTransportMock, sendMailMock } = vi.hoisted(() => {
  const sendMailMock = vi.fn();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 參數僅供 TS 推導 calls 型別
  const createTransportMock = vi.fn((_opts: Record<string, unknown>) => ({
    sendMail: sendMailMock,
  }));
  return { createTransportMock, sendMailMock };
});
vi.mock("nodemailer", () => ({
  default: { createTransport: createTransportMock },
}));

import { buildEmailPayload, sendEmail } from "@/lib/notify/email";
import {
  buildLineText,
  buildLineBody,
  sendLine,
  LINE_PUSH_ENDPOINT,
} from "@/lib/notify/line";
import type { ContactNotifyPayload } from "@/lib/notify/types";

const submission: ContactNotifyPayload = {
  name: "王小明",
  company: "ACME 公司",
  phone: "0912-345-678",
  email: "ming@example.com",
  message: "想詢問空壓機節能方案。",
  source_page: "/contact",
};

beforeEach(() => {
  createTransportMock.mockClear();
  sendMailMock.mockReset();
  sendMailMock.mockResolvedValue({ messageId: "test" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("email payload 組裝", () => {
  it("含 姓名/公司/電話/Email/留言/來源頁", () => {
    const body = buildEmailPayload(submission);
    expect(body.subject).toContain("王小明");
    for (const v of [
      "王小明",
      "ACME 公司",
      "0912-345-678",
      "ming@example.com",
      "/contact",
      "想詢問空壓機節能方案。",
    ]) {
      expect(body.text).toContain(v);
    }
  });

  it("空欄位以「—」呈現，無姓名時主旨用「訪客」", () => {
    const body = buildEmailPayload({
      name: null,
      company: null,
      phone: null,
      email: null,
      message: null,
      source_page: null,
    });
    expect(body.subject).toContain("訪客");
    expect(body.text).toContain("—");
  });
});

describe("sendEmail（mock nodemailer）", () => {
  it("用設定的 host/port/secure/auth 建立 transport，並以 from/to/subject 寄送", async () => {
    await sendEmail(
      {
        smtp_host: "smtp.x.com",
        smtp_port: 465,
        smtp_secure: true,
        smtp_user: "user@x.com",
        smtp_pass: "secret_pass_xyz",
        from_email: "no-reply@x.com",
        to: ["a@x.com", "b@x.com"],
      },
      submission,
    );

    expect(createTransportMock).toHaveBeenCalledTimes(1);
    const transportOpts = createTransportMock.mock.calls[0][0];
    expect(transportOpts).toMatchObject({
      host: "smtp.x.com",
      port: 465,
      secure: true,
      auth: { user: "user@x.com", pass: "secret_pass_xyz" },
    });
    // 確認有設逾時（避免壞主機卡住 serverless）。
    expect(transportOpts.connectionTimeout).toBeGreaterThan(0);

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const mail = sendMailMock.mock.calls[0][0];
    expect(mail.from).toBe("no-reply@x.com");
    expect(mail.to).toEqual(["a@x.com", "b@x.com"]);
    expect(mail.subject).toContain("王小明");
    expect(mail.text).toContain("ming@example.com");
  });

  it("寄送失敗 → 丟錯，且錯誤訊息不含密碼", async () => {
    sendMailMock.mockRejectedValue(new Error("connection refused"));
    let caught: Error | null = null;
    try {
      await sendEmail(
        {
          smtp_host: "smtp.x.com",
          smtp_port: 587,
          smtp_secure: false,
          smtp_user: "user@x.com",
          smtp_pass: "secret_pass_xyz",
          from_email: "f@x.com",
          to: ["t@x.com"],
        },
        submission,
      );
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).not.toBeNull();
    expect(caught?.message).toMatch(/SMTP/);
    expect(caught?.message).not.toContain("secret_pass_xyz");
  });
});

describe("line payload 組裝", () => {
  it("文字含主要欄位", () => {
    const text = buildLineText(submission);
    for (const v of [
      "王小明",
      "ACME 公司",
      "0912-345-678",
      "ming@example.com",
      "/contact",
      "想詢問空壓機節能方案。",
    ]) {
      expect(text).toContain(v);
    }
  });

  it("push body 形狀正確（to + messages[type=text]）", () => {
    const body = buildLineBody(submission, "U123");
    expect(body.to).toBe("U123");
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].type).toBe("text");
    expect(body.messages[0].text).toContain("王小明");
  });
});

describe("sendLine（mock fetch）", () => {
  it("POST 到 LINE push endpoint，帶 Bearer token 與正確 body", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    await sendLine(submission, {
      channelToken: "line_test_token",
      targetId: "U999",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(LINE_PUSH_ENDPOINT);
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer line_test_token");
    const parsed = JSON.parse(init?.body as string);
    expect(parsed.to).toBe("U999");
    expect(parsed.messages[0].type).toBe("text");
  });

  it("非 2xx → 丟錯", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("bad", { status: 400 }),
    );
    await expect(
      sendLine(submission, { channelToken: "t", targetId: "U1" }),
    ).rejects.toThrow(/400/);
  });
});
