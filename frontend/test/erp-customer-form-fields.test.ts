import { describe, expect, it } from "vitest";

// #248 N-4：就地新增客戶的 Dialog（CustomerForm 嵌入模式）也要有傳真、收信人，
// 與客戶主檔表單、就地新增廠商一致。
import { customerFormFields } from "@/lib/erp/customer-form-fields";

const keys = (embedded: boolean) =>
  customerFormFields(embedded).map((f) => f.key);

describe("customerFormFields", () => {
  it("Dialog（嵌入模式）含傳真、收信人", () => {
    expect(keys(true)).toContain("fax");
    expect(keys(true)).toContain("mail_recipient");
  });

  it("Dialog 與客戶主檔表單欄位相同（順序一致：電話→傳真、Email→收信人）", () => {
    expect(keys(true)).toEqual(keys(false));
    expect(keys(false)).toEqual([
      "code",
      "name",
      "tax_id",
      "invoice_title",
      "contact_person",
      "phone",
      "fax",
      "email",
      "mail_recipient",
      "sales_rep",
      "payment_terms",
      "address",
      "delivery_address",
    ]);
  });

  it("傳真為電話鍵盤；收信人有說明文字", () => {
    const fax = customerFormFields(true).find((f) => f.key === "fax");
    const recipient = customerFormFields(true).find(
      (f) => f.key === "mail_recipient",
    );
    expect(fax).toMatchObject({ label: "傳真", type: "tel" });
    expect(recipient).toMatchObject({
      label: "收信人",
      placeholder: "郵寄對帳單／發票的收件人",
    });
  });
});
