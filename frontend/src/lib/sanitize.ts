// 共用的 body_html 消毒（防 stored XSS）— SERVER ONLY。
//
// 所有以 dangerouslySetInnerHTML 渲染的 CMS 富文本（products/articles/brands… 的 body_html）
// 都必須先經此函式。即使目前只有 admin/service_role 可寫，#37 接上 AI 自動產文後
// body_html 會有程式產生的內容，故統一在渲染端 allowlist 消毒，fail-safe。
import "server-only";

import sanitizeHtml from "sanitize-html";

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "p",
    "br",
    "hr",
    "blockquote",
    "pre",
    "code",
    "ul",
    "ol",
    "li",
    "strong",
    "em",
    "b",
    "i",
    "u",
    "s",
    "mark",
    "sub",
    "sup",
    "span",
    "div",
    "a",
    "img",
    "figure",
    "figcaption",
    "table",
    "thead",
    "tbody",
    "tfoot",
    "tr",
    "th",
    "td",
    "caption",
  ],
  allowedAttributes: {
    a: ["href", "name", "target", "rel"],
    img: ["src", "alt", "title", "width", "height", "loading"],
    th: ["colspan", "rowspan", "scope"],
    td: ["colspan", "rowspan"],
    "*": ["class"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["http", "https"] },
  // 外連結補上 rel，避免 reverse tabnabbing。
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }),
  },
};

/** 消毒 CMS body_html；null/undefined 回空字串。 */
export function sanitizeBodyHtml(dirty: string | null | undefined): string {
  if (!dirty) return "";
  return sanitizeHtml(dirty, OPTIONS);
}
