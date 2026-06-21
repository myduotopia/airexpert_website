import { jsonLdScriptHtml } from "@/lib/seo";

// 渲染自訂 JSON-LD（schema_jsonld）為 <script type="application/ld+json">。
// 序列化交給 jsonLdScriptHtml：跳脫 `<` 防 `</script>` breakout / XSS。
// data 為空（null / 空物件）時不輸出任何節點。
export function JsonLd({ data }: { data: unknown }) {
  const html = jsonLdScriptHtml(data);
  if (html === null) return null;

  return (
    <script
      type="application/ld+json"
      // 已於 jsonLdScriptHtml 跳脫 `<`，避免標籤 breakout。
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
