// 客戶表單（CustomerForm）的文字欄位設定。純資料／純函式，client 與測試共用。
// 主檔頁與建單時就地新增的 Dialog（嵌入模式，#218）共用同一份設定；fullOnly 的欄位只在主檔頁顯示。
// 傳真、收信人原為 fullOnly，#248 N-4 改為 Dialog 也顯示（與客戶主檔、就地新增廠商一致；目前沒有 fullOnly 欄位）。
import type { CustomerInput } from "./queries/master-data";

export type CustomerTextKey = Exclude<
  keyof CustomerInput,
  "erp_active" | "note" | "sales_rep_id"
>;

export interface CustomerTextField {
  key: CustomerTextKey;
  label: string;
  required?: boolean;
  wide?: boolean;
  type?: string;
  inputMode?: "email" | "tel";
  placeholder?: string;
  /** 只在客戶主檔頁顯示（建單時就地新增的 Dialog 不顯示）。 */
  fullOnly?: boolean;
}

const CUSTOMER_TEXT_FIELDS: readonly CustomerTextField[] = [
  { key: "code", label: "客戶編號", placeholder: "例：KC360" },
  { key: "name", label: "客戶名稱", required: true },
  { key: "tax_id", label: "統一編號", placeholder: "8 位數字" },
  { key: "invoice_title", label: "發票抬頭" },
  { key: "contact_person", label: "聯絡人" },
  { key: "phone", label: "電話", type: "tel" },
  { key: "fax", label: "傳真", type: "tel" },
  {
    // 不用 type="email"：瀏覽器原生驗證不接受多筆，且錯誤只以浮動提示呈現；改由 server 檢查，錯誤標在此欄（B-05）。
    key: "email",
    label: "Email",
    inputMode: "email",
    placeholder: "多筆以 ; 分隔",
  },
  {
    key: "mail_recipient",
    label: "收信人",
    placeholder: "郵寄對帳單／發票的收件人",
  },
  // 業務：員工選取器（CustomerForm 另行 render），不是一般文字框。
  { key: "sales_rep", label: "業務" },
  { key: "payment_terms", label: "付款條件", placeholder: "例：月結30天" },
  // 客戶來源（#266）：自由文字；Facebook 來的客戶填 FB（大小寫不拘，存成 FB），列表可依來源篩選。
  { key: "source", label: "客戶來源", placeholder: "例：FB" },
  { key: "address", label: "聯絡地址", wide: true },
  { key: "delivery_address", label: "送貨地址", wide: true },
];

/** 表單要顯示的文字欄位；embedded = 就地新增 Dialog。 */
export function customerFormFields(
  embedded: boolean,
): readonly CustomerTextField[] {
  return embedded
    ? CUSTOMER_TEXT_FIELDS.filter((f) => !f.fullOnly)
    : CUSTOMER_TEXT_FIELDS;
}
