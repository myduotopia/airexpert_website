import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildEmailPayload,
  sendEmail,
  RESEND_ENDPOINT,
} from "@/lib/notify/email";
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("email payload 組裝", () => {
  it("含 姓名/公司/電話/Email/留言/來源頁，且帶上 from / to", () => {
    const body = buildEmailPayload(submission, {
      from: "no-reply@x.com",
      to: ["a@x.com", "b@x.com"],
    });
    expect(body.from).toBe("no-reply@x.com");
    expect(body.to).toEqual(["a@x.com", "b@x.com"]);
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
    const body = buildEmailPayload(
      {
        name: null,
        company: null,
        phone: null,
        email: null,
        message: null,
        source_page: null,
      },
      { from: "f@x.com", to: ["t@x.com"] },
    );
    expect(body.subject).toContain("訪客");
    expect(body.text).toContain("—");
  });
});

describe("sendEmail（mock fetch）", () => {
  it("POST 到 Resend endpoint，帶 Bearer key 與 JSON body", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    await sendEmail(submission, {
      apiKey: "re_test_key",
      from: "no-reply@x.com",
      to: ["a@x.com"],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(RESEND_ENDPOINT);
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer re_test_key");
    expect(headers["content-type"]).toBe("application/json");
    const parsed = JSON.parse(init?.body as string);
    expect(parsed.to).toEqual(["a@x.com"]);
    expect(parsed.subject).toContain("王小明");
  });

  it("非 2xx → 丟錯，且錯誤訊息不含 API key", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("forbidden", { status: 403 }),
    );
    let caught: Error | null = null;
    try {
      await sendEmail(submission, {
        apiKey: "re_secret_xyz",
        from: "f@x.com",
        to: ["t@x.com"],
      });
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).not.toBeNull();
    expect(caught?.message).toMatch(/403/);
    expect(caught?.message).not.toContain("re_secret_xyz");
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
