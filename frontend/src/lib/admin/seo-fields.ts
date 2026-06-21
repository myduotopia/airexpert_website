// 後台共用：把 <SeoFields> 表單欄位解析成可寫入 DB 的 SEO 欄位值。
// 五個內容區的 server action（products / news / services / cases / events 相簿）共用。
// schema_jsonld 以 JSON 文字輸入：空 → null；非法 JSON → 回傳錯誤（由呼叫端拒絕送出）。
//
// 對應元件：components/admin/SeoFields.tsx（name= 須一致）。

export type SeoValues = {
  seo_title: string | null;
  seo_description: string | null;
  canonical_url: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image_url: string | null;
  schema_jsonld: unknown;
  noindex: boolean;
  nofollow: boolean;
};

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function nullable(value: string): string | null {
  return value === "" ? null : value;
}

function checkbox(fd: FormData, key: string): boolean {
  // 未勾選的 checkbox 不會出現在 FormData；勾選則為 "on"。
  return fd.get(key) != null;
}

/**
 * 解析 SEO 欄位。schema_jsonld 必須為合法 JSON 物件（或空）。
 * 回傳 { values } 成功；{ error } 表示 JSON 格式錯誤（呼叫端應回傳給表單）。
 */
export function parseSeoFields(
  fd: FormData,
): { ok: true; values: SeoValues } | { ok: false; error: string } {
  const rawJsonld = str(fd, "schema_jsonld");
  let schema_jsonld: unknown = null;
  if (rawJsonld !== "") {
    try {
      schema_jsonld = JSON.parse(rawJsonld);
    } catch {
      return { ok: false, error: "JSON-LD 格式錯誤，請檢查內容後再儲存。" };
    }
    if (
      typeof schema_jsonld !== "object" ||
      schema_jsonld === null ||
      Array.isArray(schema_jsonld)
    ) {
      return { ok: false, error: "JSON-LD 必須是一個 JSON 物件。" };
    }
  }

  return {
    ok: true,
    values: {
      seo_title: nullable(str(fd, "seo_title")),
      seo_description: nullable(str(fd, "seo_description")),
      canonical_url: nullable(str(fd, "canonical_url")),
      og_title: nullable(str(fd, "og_title")),
      og_description: nullable(str(fd, "og_description")),
      og_image_url: nullable(str(fd, "og_image_url")),
      schema_jsonld,
      noindex: checkbox(fd, "noindex"),
      nofollow: checkbox(fd, "nofollow"),
    },
  };
}
