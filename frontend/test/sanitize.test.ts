import { describe, it, expect } from "vitest";
import { sanitizeBodyHtml } from "@/lib/sanitize";

describe("sanitizeBodyHtml（防 stored XSS）", () => {
  it("移除 <script>", () => {
    const out = sanitizeBodyHtml("<p>hi</p><script>alert(1)</script>");
    expect(out).toContain("<p>hi</p>");
    expect(out).not.toContain("script");
  });

  it("移除事件處理屬性（onclick 等）", () => {
    const out = sanitizeBodyHtml('<p onclick="steal()">hi</p>');
    expect(out).not.toContain("onclick");
    expect(out).toContain("hi");
  });

  it("移除 javascript: 連結", () => {
    const out = sanitizeBodyHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain("javascript:");
  });

  it("保留允許標籤與安全連結", () => {
    const out = sanitizeBodyHtml(
      '<p><strong>粗</strong> <a href="https://airexpert.com.tw">連結</a></p>',
    );
    expect(out).toContain("<strong>");
    expect(out).toContain("https://airexpert.com.tw");
  });

  it("null / undefined → 空字串", () => {
    expect(sanitizeBodyHtml(null)).toBe("");
    expect(sanitizeBodyHtml(undefined)).toBe("");
  });
});
