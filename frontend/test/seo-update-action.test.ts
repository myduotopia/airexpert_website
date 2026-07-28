import { describe, it, expect, vi, beforeEach } from "vitest";

// 統一 SEO 總覽儲存 server action 的安全測試：
//   * 拒絕非 allowlist 表名
//   * 寫入只含 SEO 白名單欄位（夾帶的 body_html / status / role 被丟棄）
// vi.mock 會被提升到檔首，故用 vi.hoisted 取得可在 factory 內安全引用的 spy。
const { updateTag } = vi.hoisted(() => ({ updateTag: vi.fn() }));
vi.mock("next/cache", () => ({ updateTag }));
vi.mock("@/lib/admin/auth", () => ({
  requireRole: vi.fn(async () => "seo_manager"),
}));
vi.mock("@/lib/supabase-admin", () => ({ getAdminSupabase: vi.fn() }));

import { updateContentSeo } from "@/app/admin/(protected)/seo/actions";
import { requireRole } from "@/lib/admin/auth";
import { getAdminSupabase } from "@/lib/supabase-admin";

type Captured = { table: string; values: Record<string, unknown>; id: string };

function fakeAdmin(error: { message: string } | null = null) {
  const captured: Captured = { table: "", values: {}, id: "" };
  const admin = {
    from(table: string) {
      captured.table = table;
      return {
        update(values: Record<string, unknown>) {
          captured.values = values;
          return {
            eq(_col: string, id: string) {
              captured.id = id;
              return Promise.resolve({ error });
            },
          };
        },
      };
    },
  };
  return { admin, captured };
}

function seoForm(extra: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("seo_title", "我的標題");
  fd.set("seo_description", "我的描述");
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.mocked(getAdminSupabase).mockReset();
  vi.mocked(requireRole).mockClear();
  updateTag.mockClear();
});

describe("updateContentSeo — table allowlist", () => {
  it("拒絕非 allowlist 的表名（不觸發任何寫入）", async () => {
    const { admin } = fakeAdmin();
    const fromSpy = vi.spyOn(admin, "from");
    vi.mocked(getAdminSupabase).mockReturnValue(
      admin as unknown as ReturnType<typeof getAdminSupabase>,
    );

    const res = await updateContentSeo("admin_profiles", "id-1", seoForm());

    expect(res.ok).toBe(false);
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("先 requireRole 再做任何事", async () => {
    const { admin } = fakeAdmin();
    vi.mocked(getAdminSupabase).mockReturnValue(
      admin as unknown as ReturnType<typeof getAdminSupabase>,
    );
    await updateContentSeo("products", "id-1", seoForm());
    expect(requireRole).toHaveBeenCalledWith(["admin", "seo_manager"]);
  });
});

describe("updateContentSeo — pickSeoWritable 收斂", () => {
  it("只寫 SEO 白名單欄位，夾帶的 body_html / status / role 被丟棄", async () => {
    const { admin, captured } = fakeAdmin();
    vi.mocked(getAdminSupabase).mockReturnValue(
      admin as unknown as ReturnType<typeof getAdminSupabase>,
    );

    const res = await updateContentSeo(
      "products",
      "id-42",
      seoForm({
        body_html: "<p>偷改內文</p>",
        status: "published",
        role: "admin",
        slug: "hacked",
        title: "標題（AI 用，不應寫入）",
      }),
    );

    expect(res.ok).toBe(true);
    expect(captured.table).toBe("products");
    expect(captured.id).toBe("id-42");
    // 只有 SEO 欄位
    expect(captured.values).not.toHaveProperty("body_html");
    expect(captured.values).not.toHaveProperty("status");
    expect(captured.values).not.toHaveProperty("role");
    expect(captured.values).not.toHaveProperty("slug");
    expect(captured.values).not.toHaveProperty("title");
    expect(captured.values.seo_title).toBe("我的標題");
    expect(captured.values.seo_description).toBe("我的描述");
    // 全部鍵皆在白名單內
    const allowed = new Set([
      "seo_title",
      "seo_description",
      "canonical_url",
      "og_title",
      "og_description",
      "og_image_url",
      "schema_jsonld",
      "noindex",
      "nofollow",
    ]);
    for (const key of Object.keys(captured.values)) {
      expect(allowed.has(key)).toBe(true);
    }
  });

  it("成功後 updateTag 該表 cache tag（read-your-own-writes，立即可見）", async () => {
    const { admin } = fakeAdmin();
    vi.mocked(getAdminSupabase).mockReturnValue(
      admin as unknown as ReturnType<typeof getAdminSupabase>,
    );
    await updateContentSeo("articles", "id-1", seoForm());
    expect(updateTag).toHaveBeenCalledWith("articles");
  });

  it("JSON-LD 格式錯誤 → 回 ok:false，不寫入", async () => {
    const { admin } = fakeAdmin();
    const fromSpy = vi.spyOn(admin, "from");
    vi.mocked(getAdminSupabase).mockReturnValue(
      admin as unknown as ReturnType<typeof getAdminSupabase>,
    );
    const res = await updateContentSeo(
      "products",
      "id-1",
      seoForm({ schema_jsonld: "{ 壞掉的 json" }),
    );
    expect(res.ok).toBe(false);
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("DB 寫入失敗 → 回 ok:false 並夾帶訊息", async () => {
    const { admin } = fakeAdmin({ message: "db boom" });
    vi.mocked(getAdminSupabase).mockReturnValue(
      admin as unknown as ReturnType<typeof getAdminSupabase>,
    );
    const res = await updateContentSeo("products", "id-1", seoForm());
    expect(res).toEqual({ ok: false, error: "db boom" });
  });
});
