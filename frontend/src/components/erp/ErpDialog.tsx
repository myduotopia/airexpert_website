"use client";
// ERP 頁內 modal（原生 <dialog> + showModal()）：建單時就地新增主檔（#218）、日後的頁內確認框（#220）共用。
// - 受控：open=true 才渲染；Esc、右上角 ×、或內容自行呼叫 onClose 關閉（關閉與否由父層決定）。
// - 以 createPortal 掛到 document.body：Dialog 內的 <form> 不會成為單據 <form> 的 DOM 子孫（HTML 不允許巢狀 form）。
// - React 的合成事件會沿元件樹（不是 DOM 樹）穿過 portal 冒泡，所以在 <dialog> 上攔下 submit / reset，
//   避免 Dialog 內表單送出時觸發外層單據表單的 onSubmit。
// - showModal() 讓背景 inert 並把焦點移入 Dialog；關閉時呼叫 close()，瀏覽器會把焦點還給開啟前的元素。
// - 起始焦點：內容中標 data-autofocus 的元素（沒有則依瀏覽器預設）。
// - 手機：寬度接近全寬、高度不超過可視範圍，內容可捲動；標題列固定在上方。
import {
  useId,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { createPortal } from "react-dom";
import { handleDialogCancel, handleDialogClose } from "@/lib/erp/dialog-events";

export interface ErpDialogProps {
  open: boolean;
  /** Esc / × / 背景點擊（closeOnBackdrop）時呼叫；父層把 open 設回 false 才真正關閉。 */
  onClose: () => void;
  title: ReactNode;
  /** 標題下方的說明（同時作為 aria-describedby）。 */
  description?: ReactNode;
  children?: ReactNode;
  /** 底部按鈕列（確認框用；表單通常把按鈕放在 children 的 <form> 內）。 */
  footer?: ReactNode;
  /** 寬度：sm 420px（確認框）、md 560px、lg 720px（主檔表單）。 */
  size?: "sm" | "md" | "lg";
  /** 確認框用 alertdialog。 */
  role?: "dialog" | "alertdialog";
  /** 點背景是否關閉（預設 false，避免誤觸丟失輸入）。 */
  closeOnBackdrop?: boolean;
  /** 是否顯示右上角關閉鈕（預設 true）。 */
  showCloseButton?: boolean;
}

const SIZE: Record<NonNullable<ErpDialogProps["size"]>, string> = {
  sm: "max-w-[420px]",
  md: "max-w-[560px]",
  lg: "max-w-[720px]",
};

const stop = (e: SyntheticEvent) => e.stopPropagation();

export function ErpDialog(props: ErpDialogProps) {
  // 未開啟時不渲染。open 應由使用者互動後才設為 true（server render 時沒有 document 可 portal）。
  if (!props.open || typeof document === "undefined") return null;
  return <OpenDialog {...props} />;
}

function OpenDialog({
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  role = "dialog",
  closeOnBackdrop = false,
  showCloseButton = true,
}: ErpDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  // 已由我們主動關閉（卸載）時，忽略原生 close 事件，避免重複呼叫 onClose。
  const closingRef = useRef(false);
  // 確認框只有標題、說明與按鈕列，沒有內容區：不渲染空白的內容區（避免多一段留白與雙重分隔線）。
  const hasBody =
    children !== undefined && children !== null && children !== false;

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    // showModal() 預設聚焦第一個可聚焦元素（會是右上角 ×）；內容可用 data-autofocus 指定起始欄位。
    dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    // 開啟期間鎖住背景捲動。
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = prevOverflow;
      closingRef.current = true;
      // 在 DOM 移除前 close()：焦點回到開啟前的元素（例如原本的選取器）。
      if (dialog.open) dialog.close();
    };
  }, []);

  return createPortal(
    <dialog
      ref={ref}
      // <dialog> 本身即 dialog 角色；確認框才覆寫為 alertdialog。
      role={role === "alertdialog" ? "alertdialog" : undefined}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      // Esc：交給父層決定（受控），不讓瀏覽器自行關閉。
      // 停止冒泡：React 會把 cancel／close 沿元件樹傳給外層 Dialog（巢狀 Dialog 時外層會一起關閉，
      // 見 lib/erp/dialog-events.ts）。
      onCancel={(e) => handleDialogCancel(e, onClose)}
      // 少數情況（例如瀏覽器強制關閉）仍會直接關閉 → 同步回報父層。
      onClose={(e) => handleDialogClose(e, closingRef.current, onClose)}
      onClick={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
      onSubmit={stop}
      onReset={stop}
      className={`text-ink m-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] overflow-hidden rounded-xl bg-white p-0 shadow-xl backdrop:bg-black/40 open:flex open:flex-col ${SIZE[size]}`}
    >
      <div className="border-border flex shrink-0 items-start justify-between gap-3 border-b px-5 py-4">
        <div className="min-w-0">
          <h2 id={titleId} className="text-ink text-[17px] font-bold">
            {title}
          </h2>
          {description && (
            <p id={descId} className="text-text-muted mt-1 text-[13px]">
              {description}
            </p>
          )}
        </div>
        {showCloseButton && (
          <button
            type="button"
            aria-label="關閉"
            onClick={onClose}
            className="text-text-muted hover:text-ink hover:bg-surface-muted -mt-1 -mr-2 h-8 w-8 shrink-0 rounded-md text-[20px] leading-none"
          >
            ×
          </button>
        )}
      </div>
      {hasBody && (
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>
      )}
      {footer && (
        <div
          className={`border-border flex shrink-0 flex-wrap justify-end gap-2 px-5 py-3 ${hasBody ? "border-t" : ""}`}
        >
          {footer}
        </div>
      )}
    </dialog>,
    document.body,
  );
}
