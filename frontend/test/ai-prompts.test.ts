import { describe, it, expect } from "vitest";
import { resolveAiPrompts, DEFAULT_AI_PROMPTS } from "@/lib/ai/prompts";

describe("resolveAiPrompts（預設 vs 自訂解析）", () => {
  it("null / 空物件 → 三段皆用內建預設", () => {
    const a = resolveAiPrompts(null);
    expect(a.effective).toEqual(DEFAULT_AI_PROMPTS);
    expect(a.source).toEqual({
      fix_article: "default",
      fill_seo: "default",
      gen_body: "default",
    });

    const b = resolveAiPrompts({});
    expect(b.effective).toEqual(DEFAULT_AI_PROMPTS);
  });

  it("空字串 / 純空白 → 視為未設定，退回預設（＝清空還原）", () => {
    const r = resolveAiPrompts({
      fix_article: "   ",
      fill_seo: "",
      gen_body: "  ",
    });
    expect(r.effective.fix_article).toBe(DEFAULT_AI_PROMPTS.fix_article);
    expect(r.effective.fill_seo).toBe(DEFAULT_AI_PROMPTS.fill_seo);
    expect(r.effective.gen_body).toBe(DEFAULT_AI_PROMPTS.gen_body);
    expect(r.source).toEqual({
      fix_article: "default",
      fill_seo: "default",
      gen_body: "default",
    });
  });

  it("非空字串 → 採用自訂值並標記 custom", () => {
    const r = resolveAiPrompts({
      fix_article: "自訂修文指示",
      fill_seo: "自訂 SEO 指示",
      gen_body: "自訂生成指示",
    });
    expect(r.effective.fix_article).toBe("自訂修文指示");
    expect(r.effective.fill_seo).toBe("自訂 SEO 指示");
    expect(r.effective.gen_body).toBe("自訂生成指示");
    expect(r.source).toEqual({
      fix_article: "custom",
      fill_seo: "custom",
      gen_body: "custom",
    });
  });

  it("可個別覆寫：只設一段，其餘退回預設", () => {
    const r = resolveAiPrompts({ gen_body: "只改生成" });
    expect(r.effective.gen_body).toBe("只改生成");
    expect(r.source.gen_body).toBe("custom");
    expect(r.effective.fix_article).toBe(DEFAULT_AI_PROMPTS.fix_article);
    expect(r.source.fix_article).toBe("default");
    expect(r.effective.fill_seo).toBe(DEFAULT_AI_PROMPTS.fill_seo);
    expect(r.source.fill_seo).toBe("default");
  });

  it("非字串型別（數字 / 物件）→ 視為無效，退回預設", () => {
    const r = resolveAiPrompts({
      fix_article: 123 as unknown,
      fill_seo: {} as unknown,
      gen_body: [] as unknown,
    });
    expect(r.effective).toEqual(DEFAULT_AI_PROMPTS);
  });
});
