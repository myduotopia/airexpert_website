// 送出前的「確認 → 檢核」流程（#254，A-4 改回原本做法）。
// - 有確認框（儲存並過帳、明細頁過帳）：先跳頁內確認框，使用者按確認後才做前端檢核；
//   取消就結束，不檢核也不顯示錯誤。
// - 沒有確認框（儲存草稿、報價單儲存即確認）：直接檢核。
// 檢核錯誤一次全部回傳（collect*Errors，#240）。純流程、不碰 React，供表單與測試共用。
// 收付款／退款（PaymentForm、RefundForm）是先檢核再確認，不走這裡。

export type SubmitGate =
  | { kind: "cancelled" }
  | { kind: "invalid"; errors: string[] }
  | { kind: "ok" };

export async function gateSubmit({
  confirm,
  check,
}: {
  /** 頁內確認框；null／未傳表示不需確認。回 false（取消）就不往下做。 */
  confirm?: (() => Promise<boolean>) | null;
  /** 前端檢核，回傳所有錯誤（空陣列表示通過）；確認後才呼叫。 */
  check: () => readonly string[];
}): Promise<SubmitGate> {
  if (confirm && !(await confirm())) return { kind: "cancelled" };
  const errors = [...check()];
  return errors.length > 0 ? { kind: "invalid", errors } : { kind: "ok" };
}
