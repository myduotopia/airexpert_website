"use client";
// ERP 頁內確認框（#220）：取代瀏覽器原生確認框。原生確認框開著時 AI／e2e 自動化工具的點擊、截圖、
// 讀頁面會全部卡住，手機瀏覽器體驗也差；改用 ErpDialog（原生 <dialog> + showModal()，role=alertdialog）。
//
// 用法（每個需要確認的元件各自持有一個 Dialog，不需 Provider）：
//   const [askConfirm, confirmDialog] = useConfirm();
//   onClick={async () => {
//     if (!(await askConfirm({ title: "確定過帳？", message: "…", confirmLabel: "過帳" }))) return;
//     …原本的動作…
//   }}
//   …JSX 中任一處渲染 {confirmDialog}（以 portal 掛到 body，放哪裡都一樣）。
//
// - 確認鈕文字就是動作名稱（過帳、作廢、刪除…），自動化工具可用
//   getByRole("alertdialog") 內的 getByRole("button", { name }) 找到。
// - 起始焦點：tone="danger"（刪除、作廢等破壞性動作）在「取消」；tone="primary" 在確認鈕。
// - Esc／取消 → false；確認 → true；確認後立即關閉，連點不會重複 resolve。
// - 元件卸載時未決的請求以 false 結束，不會永久懸掛。
// promise 狀態管理在 lib/erp/confirm-controller.ts（純邏輯，有單元測試）。
import { useEffect, useState, type ReactNode } from "react";
import {
  createConfirmController,
  type ConfirmRequest,
} from "@/lib/erp/confirm-controller";
import { ErpDialog } from "./ErpDialog";

export interface ConfirmOptions {
  /** 問句，例：「確定過帳？」。 */
  title: string;
  /** 補充說明（後果），顯示在標題下方，並作為 aria-describedby。 */
  message?: string;
  /** 確認鈕文字：用動作名稱（過帳、作廢、刪除），不要用泛用的「確定」。 */
  confirmLabel: string;
  /** 取消鈕文字，預設「取消」。 */
  cancelLabel?: string;
  /** danger：紅色確認鈕、焦點預設在取消；primary（預設）：主色確認鈕、焦點在確認鈕。 */
  tone?: "danger" | "primary";
}

export type AskConfirm = (options: ConfirmOptions) => Promise<boolean>;

const BTN_BASE =
  "inline-flex h-10 items-center justify-center rounded-lg px-4 text-[14px] font-semibold";
const BTN_CANCEL = `${BTN_BASE} border-border hover:bg-surface-muted border bg-white`;
const BTN_CONFIRM = {
  primary: `${BTN_BASE} bg-primary hover:bg-primary-deep text-white`,
  danger: `${BTN_BASE} bg-red-600 text-white hover:bg-red-700`,
} as const;

/**
 * 回傳 [askConfirm, confirmDialog]：askConfirm(options) 開啟確認框並回傳 Promise<boolean>；
 * confirmDialog 必須渲染在元件中。askConfirm 的參照在元件生命週期內固定。
 */
export function useConfirm(): [AskConfirm, ReactNode] {
  const [request, setRequest] = useState<ConfirmRequest<ConfirmOptions> | null>(
    null,
  );
  const [controller] = useState(() =>
    createConfirmController<ConfirmOptions>(setRequest),
  );
  // 卸載時以 false 結束未決請求（例如確認框開著時換頁）。
  useEffect(() => () => controller.cancel(), [controller]);

  return [
    controller.request,
    // 回傳 tuple 不是清單，key 只為滿足 lint（react/jsx-key）。
    <ConfirmDialog
      key="erp-confirm"
      request={request}
      onResolve={controller.resolve}
    />,
  ];
}

function ConfirmDialog({
  request,
  onResolve,
}: {
  request: ConfirmRequest<ConfirmOptions> | null;
  onResolve: (value: boolean, id: number) => void;
}) {
  if (!request) return null;
  const { id, options } = request;
  const danger = options.tone === "danger";
  return (
    <ErpDialog
      // 換成新請求時重新掛載，重設起始焦點。
      key={id}
      open
      onClose={() => onResolve(false, id)}
      title={options.title}
      description={options.message}
      size="sm"
      role="alertdialog"
      showCloseButton={false}
      footer={
        <>
          <button
            type="button"
            data-autofocus={danger ? "" : undefined}
            onClick={() => onResolve(false, id)}
            className={BTN_CANCEL}
          >
            {options.cancelLabel ?? "取消"}
          </button>
          <button
            type="button"
            data-autofocus={danger ? undefined : ""}
            onClick={() => onResolve(true, id)}
            className={danger ? BTN_CONFIRM.danger : BTN_CONFIRM.primary}
          >
            {options.confirmLabel}
          </button>
        </>
      }
    />
  );
}
