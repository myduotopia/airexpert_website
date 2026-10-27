"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter, unstable_rethrow } from "next/navigation";
import { ACTION_BUTTON_VARIANT_CLASS } from "@/components/admin/ActionButton";
import { DataTable } from "@/components/admin/DataTable";
import {
  useConfirm,
  type ConfirmOptions,
} from "@/components/erp/ConfirmDialog";
import { ERP_SELECT } from "@/components/erp/styles";
import type { ActionResult } from "@/lib/admin/crud";
import {
  DEFAULT_STAFF_PASSWORD,
  MUST_CHANGE_PASSWORD_LABEL,
  STAFF_ACCOUNT_STATUS_LABELS,
  batchCreateSummary,
  normalizeLoginEmail,
  type BatchCreateResult,
  type StaffAccountStatus,
} from "@/lib/admin/staff-accounts";
import type { StaffPersonRow } from "@/lib/employees/permissions";
import {
  assignEmployeePositionAction,
  changeStaffEmailAction,
  createStaffAccountAction,
  createStaffAccountsBatchAction,
  resetStaffPasswordAction,
  setStaffLoginDisabledAction,
} from "../actions";

interface PositionOption {
  id: string;
  name: string;
  active: boolean;
}

const STATUS_CLASS: Record<StaffAccountStatus, string> = {
  none: "bg-surface-muted text-text-muted",
  enabled: "bg-emerald-50 text-emerald-800",
  disabled: "bg-red-50 text-red-700",
  not_staff: "bg-surface-muted text-ink",
};

const BADGE = "inline-flex w-fit rounded px-2 py-0.5 text-[12px] font-medium";

/** 預設密碼被他人搶先使用的提醒（啟用、重設、建立時不停用的確認框共用）。 */
const DEFAULT_PASSWORD_RISK = `任何知道登入 email（員工編號或員工個人 email）的人都能用預設密碼 ${DEFAULT_STAFF_PASSWORD} 登入並改掉密碼，請在員工本人在場時操作，並請本人立即改密碼。`;

// 人員頁籤：員工的職位指派、帳號狀態（已啟用／已停用＋需改密碼）與帳號操作。
// #263：帳號建立後預設停用，由人事主管在員工本人在場時按「啟用帳號」，避免預設密碼在員工改密碼前被他人使用。
// #265：員工帳號的登入 email 可由人事改成員工個人 email（只限員工帳號）；「帳號」欄顯示目前的登入 email。
// 所有確認一律用頁內確認框（useConfirm），不用瀏覽器原生確認框。
export function PeoplePanel({
  people,
  positions,
  includeFormer,
}: {
  people: StaffPersonRow[];
  positions: PositionOption[];
  includeFormer: boolean;
}) {
  const [startDisabled, setStartDisabled] = useState(true);
  const creatable = people.filter(
    (p) => p.current && p.status === "none" && p.expected_email,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="border-border flex flex-wrap items-start justify-between gap-4 rounded-xl border bg-white p-5">
        <div className="min-w-0 flex-1 text-[14px]">
          <p className="text-ink font-semibold">員工帳號</p>
          <p className="text-text-muted mt-1">
            建立時的登入 email 為「員工編號小寫@airexpert.com.tw」，預設密碼{" "}
            {DEFAULT_STAFF_PASSWORD}
            ，首次登入必須先改密碼。沒有員工編號的員工無法建立帳號。建立後可按「修改登入
            email」改成員工的個人 email（不寄確認信，密碼不變）。
          </p>
          <label className="text-ink mt-3 flex items-start gap-2">
            <input
              type="checkbox"
              checked={startDisabled}
              onChange={(e) => setStartDisabled(e.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="font-medium">建立後先停用</span>
              <span className="text-text-muted block text-[13px]">
                單筆與批次建立皆適用。停用的帳號無法登入；請在員工本人在場時按「啟用帳號」，讓本人立即登入改密碼。
              </span>
            </span>
          </label>
        </div>
        <BatchCreateButton
          count={creatable.length}
          startDisabled={startDisabled}
        />
      </div>

      <div className="flex items-center justify-end text-[13px]">
        <Link
          href={`/admin/employees/permissions?tab=people${includeFormer ? "" : "&former=1"}`}
          className="text-text-muted hover:text-ink underline"
        >
          {includeFormer ? "只顯示在職員工" : "也顯示離職／停用的員工"}
        </Link>
      </div>

      <DataTable
        rows={people}
        getKey={(p) => p.employee_id}
        empty="沒有員工。"
        columns={[
          {
            header: "編號",
            cell: (p) =>
              p.code ? (
                <span className="font-mono text-[13px]">{p.code}</span>
              ) : (
                "—"
              ),
          },
          {
            header: "姓名",
            cell: (p) => (
              <span>
                <span className="font-medium">{p.name}</span>
                {!p.current ? (
                  <span className="text-text-muted ml-1 text-[12px]">
                    （離職）
                  </span>
                ) : null}
                {p.title ? (
                  <span className="text-text-muted block text-[12px]">
                    原職務：{p.title}
                  </span>
                ) : null}
              </span>
            ),
          },
          {
            header: "職位",
            cell: (p) => <PositionSelect person={p} positions={positions} />,
          },
          {
            header: "帳號",
            cell: (p) => (
              <span className="flex flex-col gap-1">
                <span className="flex flex-wrap gap-1">
                  <span className={`${BADGE} ${STATUS_CLASS[p.status]}`}>
                    {STAFF_ACCOUNT_STATUS_LABELS[p.status]}
                  </span>
                  {p.status !== "none" && p.must_change_password ? (
                    <span className={`${BADGE} bg-amber-50 text-amber-800`}>
                      {MUST_CHANGE_PASSWORD_LABEL}
                    </span>
                  ) : null}
                </span>
                <span className="text-text-muted font-mono text-[12px] break-all">
                  {p.status === "none"
                    ? (p.expected_email ?? "（沒有員工編號）")
                    : (p.account_email ?? "—")}
                </span>
              </span>
            ),
          },
          {
            header: "",
            className: "text-right",
            cell: (p) => (
              <AccountActions person={p} startDisabled={startDisabled} />
            ),
          },
        ]}
      />
    </div>
  );
}

/**
 * 先以頁內確認框確認、再呼叫 server action 的按鈕；失敗訊息就地顯示（同 ActionButton，但不用原生確認框）。
 * confirm 回傳 null → 不確認直接執行。
 */
function ConfirmActionButton({
  label,
  pendingLabel,
  variant,
  confirm,
  run,
  beforeAsk,
}: {
  label: string;
  pendingLabel: string;
  variant: keyof typeof ACTION_BUTTON_VARIANT_CLASS;
  confirm: ConfirmOptions;
  run: () => Promise<ActionResult>;
  /** 開啟確認框前呼叫（重設確認框內的勾選狀態等）。 */
  beforeAsk?: () => void;
}) {
  const [askConfirm, confirmDialog] = useConfirm();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setError(null);
          beforeAsk?.();
          if (!(await askConfirm(confirm))) return;
          startTransition(async () => {
            try {
              const res = await run();
              if (!res.ok) setError(res.error);
            } catch (e) {
              // 同 ActionButton：redirect 等框架控制流程錯誤原樣丟回給 Next.js。
              unstable_rethrow(e);
              setError(
                (e as Error)?.message || "操作失敗，請確認網路後再試一次。",
              );
            }
          });
        }}
        className={`inline-flex items-center transition-colors disabled:opacity-60 ${ACTION_BUTTON_VARIANT_CLASS[variant]}`}
      >
        {pending ? pendingLabel : label}
      </button>
      {error ? (
        <span
          role="alert"
          className="max-w-[22rem] text-left text-[12px] whitespace-normal text-red-600"
        >
          {error}
        </span>
      ) : null}
      {confirmDialog}
    </span>
  );
}

function AccountActions({
  person,
  startDisabled,
}: {
  person: StaffPersonRow;
  startDisabled: boolean;
}) {
  if (person.status === "none") {
    if (!person.current || !person.expected_email) return null;
    return (
      <ConfirmActionButton
        label="建立帳號"
        pendingLabel="建立中…"
        variant="secondary"
        confirm={{
          title: `確定替 ${person.name} 建立帳號？`,
          message: `帳號 ${person.expected_email}，預設密碼 ${DEFAULT_STAFF_PASSWORD}，首次登入必須改密碼。${
            startDisabled
              ? "建立後先停用：需由人事按「啟用帳號」後才能登入。"
              : `建立後立即可登入：${DEFAULT_PASSWORD_RISK}`
          }`,
          confirmLabel: "建立帳號",
        }}
        run={() => createStaffAccountAction(person.employee_id, startDisabled)}
      />
    );
  }
  if (person.status === "not_staff") {
    return (
      <span className="text-text-muted text-[12px]">
        由管理員在人員管理頁處理
      </span>
    );
  }
  const disabled = person.status === "disabled";
  return (
    <span className="inline-flex flex-wrap justify-end gap-2">
      <ChangeEmailButton person={person} />
      <ResetPasswordButton person={person} />
      {disabled ? (
        <ConfirmActionButton
          label="啟用帳號"
          pendingLabel="啟用中…"
          variant="secondary"
          confirm={{
            title: `確定啟用 ${person.name} 的帳號？`,
            message: `啟用後即可用 ${person.account_email ?? "此帳號"} 登入後台。${
              person.must_change_password
                ? `此帳號仍是預設密碼：${DEFAULT_PASSWORD_RISK}`
                : ""
            }`,
            confirmLabel: "啟用帳號",
          }}
          run={() => setStaffLoginDisabledAction(person.employee_id, false)}
        />
      ) : (
        <ConfirmActionButton
          label="停用帳號"
          pendingLabel="停用中…"
          variant="danger"
          confirm={{
            title: `確定停用 ${person.name} 的帳號？`,
            message:
              "停用後無法登入後台；已登入的畫面會立即失去所有功能權限。之後可再按「啟用帳號」恢復。",
            confirmLabel: "停用帳號",
            tone: "danger",
          }}
          run={() => setStaffLoginDisabledAction(person.employee_id, true)}
        />
      )}
    </span>
  );
}

/**
 * 修改登入 email（#265，只限員工帳號）：按鈕展開輸入框 → 先在前端檢查格式 → 頁內確認框列出舊／新 email →
 * server action（格式、重複、只限 staff 由 DB 再檢查一次）。成功後收合並重新整理。
 */
function ChangeEmailButton({ person }: { person: StaffPersonRow }) {
  const router = useRouter();
  const [askConfirm, confirmDialog] = useConfirm();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const current = person.account_email ?? "（未知）";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue("");
          setError(null);
          setOpen(true);
        }}
        className={`inline-flex items-center transition-colors ${ACTION_BUTTON_VARIANT_CLASS.secondary}`}
      >
        修改登入 email
      </button>
    );
  }

  return (
    <form
      noValidate
      className="inline-flex flex-wrap items-center justify-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const norm = normalizeLoginEmail(value);
        if (!norm.ok) {
          setError(norm.error);
          return;
        }
        // 與目前相同由 DB 判斷（Auth 與後台資料都已是此 email 才算相同；先前同步失敗時要能再送一次補齊）。
        const ok = await askConfirm({
          title: `確定修改 ${person.name} 的登入 email？`,
          message: `登入 email 由 ${current} 改為 ${norm.email}。不會寄確認信，密碼與啟用狀態不變；之後請員工改用新 email 登入。`,
          confirmLabel: "修改登入 email",
        });
        if (!ok) return;
        startTransition(async () => {
          try {
            const res = await changeStaffEmailAction(
              person.employee_id,
              norm.email,
            );
            if (res.ok) {
              setOpen(false);
              router.refresh();
            } else {
              setError(res.error);
            }
          } catch (err) {
            unstable_rethrow(err);
            setError(
              (err as Error)?.message || "操作失敗，請確認網路後再試一次。",
            );
          }
        });
      }}
    >
      <input
        type="email"
        autoComplete="off"
        autoFocus
        aria-label={`${person.name} 的新登入 email`}
        placeholder="新的登入 email"
        value={value}
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
        className="border-border focus:border-primary disabled:bg-surface-muted h-9 w-[220px] max-w-full rounded-lg border bg-white px-3 text-[14px] outline-none"
      />
      <button
        type="submit"
        disabled={pending}
        className={`inline-flex items-center transition-colors disabled:opacity-60 ${ACTION_BUTTON_VARIANT_CLASS.secondary}`}
      >
        {pending ? "修改中…" : "儲存"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => setOpen(false)}
        className="text-text-muted hover:text-ink text-[13px] underline disabled:opacity-60"
      >
        取消
      </button>
      {error ? (
        <span
          role="alert"
          className="max-w-[22rem] basis-full text-right text-[12px] whitespace-normal text-red-600"
        >
          {error}
        </span>
      ) : null}
      {confirmDialog}
    </form>
  );
}

/**
 * 重設為預設密碼。帳號已啟用時，確認框內可勾選「重設後先停用帳號」（預設勾選）：預設密碼在員工本人改掉之前，
 * 任何知道登入 email 的人都能登入，故預設一併停用，員工本人在場時再啟用。帳號已停用 → 維持停用。
 */
function ResetPasswordButton({ person }: { person: StaffPersonRow }) {
  const enabled = person.status === "enabled";
  // 確認框內勾選框的值（確認框關閉後才讀取；每次開啟前重設為預設勾選）。
  const alsoDisable = useRef(true);
  return (
    <ConfirmActionButton
      label="重設為預設密碼"
      pendingLabel="重設中…"
      variant="secondary"
      beforeAsk={() => {
        alsoDisable.current = true;
      }}
      confirm={{
        title: `確定把 ${person.name} 的密碼重設為 ${DEFAULT_STAFF_PASSWORD}？`,
        message: enabled ? (
          <div className="flex flex-col gap-2">
            <p>下次登入必須改密碼。</p>
            <label className="text-ink flex items-start gap-2">
              <input
                type="checkbox"
                defaultChecked
                onChange={(e) => {
                  alsoDisable.current = e.target.checked;
                }}
                className="mt-1"
              />
              <span>
                <span className="font-medium">重設後先停用帳號（建議）</span>
                <span className="text-text-muted block text-[13px]">
                  員工本人在場時再按「啟用帳號」。若不停用，帳號維持啟用：
                  {DEFAULT_PASSWORD_RISK}
                </span>
              </span>
            </label>
          </div>
        ) : (
          "下次登入必須改密碼。帳號目前已停用，重設後維持停用；請在員工本人在場時再按「啟用帳號」。"
        ),
        confirmLabel: "重設密碼",
        tone: "danger",
      }}
      // 已停用的帳號不必再停用（維持停用）；已啟用則依勾選。
      run={() =>
        resetStaffPasswordAction(
          person.employee_id,
          enabled ? alsoDisable.current : false,
        )
      }
    />
  );
}

function PositionSelect({
  person,
  positions,
}: {
  person: StaffPersonRow;
  positions: PositionOption[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(person.position_id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <span className="flex min-w-[150px] flex-col gap-1">
      <select
        aria-label={`${person.name} 的職位`}
        value={value}
        disabled={pending}
        className={ERP_SELECT}
        onChange={(e) => {
          const next = e.target.value;
          const prev = value;
          setValue(next);
          setError(null);
          startTransition(async () => {
            const res = await assignEmployeePositionAction(
              person.employee_id,
              next || null,
            );
            if (res.ok) {
              router.refresh();
            } else {
              setValue(prev);
              setError(res.error);
            }
          });
        }}
      >
        <option value="">（未指派）</option>
        {positions.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
            {o.active ? "" : "（已停用）"}
          </option>
        ))}
      </select>
      {pending ? (
        <span className="text-text-muted text-[12px]">儲存中…</span>
      ) : null}
      {error ? (
        <span role="alert" className="text-[12px] text-red-600">
          {error}
        </span>
      ) : null}
    </span>
  );
}

function BatchCreateButton({
  count,
  startDisabled,
}: {
  count: number;
  startDisabled: boolean;
}) {
  const router = useRouter();
  const [askConfirm, confirmDialog] = useConfirm();
  const [result, setResult] = useState<BatchCreateResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex max-w-[420px] flex-col items-end gap-2">
      <button
        type="button"
        disabled={pending || count === 0}
        className="bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-semibold text-white disabled:opacity-60"
        onClick={async () => {
          const ok = await askConfirm({
            title: `確定替 ${count} 位在職且尚無帳號的員工建立帳號？`,
            message: `預設密碼為 ${DEFAULT_STAFF_PASSWORD}，首次登入必須改密碼。${
              startDisabled
                ? "建立後先停用：需由人事逐一按「啟用帳號」後才能登入。"
                : `建立後立即可登入：${DEFAULT_PASSWORD_RISK}`
            }`,
            confirmLabel: "批次建立",
          });
          if (!ok) return;
          setResult(null);
          startTransition(async () => {
            const res = await createStaffAccountsBatchAction(startDisabled);
            setResult(res);
            router.refresh();
          });
        }}
      >
        {pending ? "建立中…" : `批次建立帳號（${count} 位）`}
      </button>
      {confirmDialog}
      {result ? (
        result.ok ? (
          <div role="status" className="text-right text-[13px]">
            <p className="text-primary-deep">{batchCreateSummary(result)}</p>
            {result.failed.map((f) => (
              <p key={f.name} className="text-red-600">
                {f.name}：{f.error}
              </p>
            ))}
          </div>
        ) : (
          <p role="alert" className="text-[13px] text-red-600">
            {result.error}
          </p>
        )
      ) : null}
    </div>
  );
}
