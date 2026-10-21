"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/admin/ActionButton";
import { DataTable } from "@/components/admin/DataTable";
import { ERP_SELECT } from "@/components/erp/styles";
import {
  DEFAULT_STAFF_PASSWORD,
  STAFF_ACCOUNT_STATUS_LABELS,
  type StaffAccountStatus,
} from "@/lib/admin/staff-accounts";
import type { StaffPersonRow } from "@/lib/employees/permissions";
import {
  assignEmployeePositionAction,
  createStaffAccountAction,
  createStaffAccountsBatchAction,
  resetStaffPasswordAction,
  setStaffLoginDisabledAction,
  type BatchCreateResult,
} from "../actions";

interface PositionOption {
  id: string;
  name: string;
  active: boolean;
}

const STATUS_CLASS: Record<StaffAccountStatus, string> = {
  none: "bg-surface-muted text-text-muted",
  must_change: "bg-amber-50 text-amber-800",
  active: "bg-emerald-50 text-emerald-800",
  disabled: "bg-red-50 text-red-700",
  not_staff: "bg-surface-muted text-ink",
};

// 人員頁籤：員工的職位指派、帳號狀態與帳號操作。
export function PeoplePanel({
  people,
  positions,
  includeFormer,
}: {
  people: StaffPersonRow[];
  positions: PositionOption[];
  includeFormer: boolean;
}) {
  const creatable = people.filter(
    (p) => p.current && p.status === "none" && p.expected_email,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="border-border flex flex-wrap items-start justify-between gap-4 rounded-xl border bg-white p-5">
        <div className="min-w-0 text-[14px]">
          <p className="text-ink font-semibold">員工帳號</p>
          <p className="text-text-muted mt-1">
            帳號為「員工編號小寫@airexpert.com.tw」，預設密碼{" "}
            {DEFAULT_STAFF_PASSWORD}
            ，首次登入必須先改密碼。沒有員工編號的員工無法建立帳號。
          </p>
        </div>
        <BatchCreateButton count={creatable.length} />
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
                <span
                  className={`inline-flex w-fit rounded px-2 py-0.5 text-[12px] font-medium ${STATUS_CLASS[p.status]}`}
                >
                  {STAFF_ACCOUNT_STATUS_LABELS[p.status]}
                </span>
                <span className="text-text-muted font-mono text-[12px]">
                  {p.account_email ?? p.expected_email ?? "（沒有員工編號）"}
                </span>
              </span>
            ),
          },
          {
            header: "",
            className: "text-right",
            cell: (p) => <AccountActions person={p} />,
          },
        ]}
      />
    </div>
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

function AccountActions({ person }: { person: StaffPersonRow }) {
  if (person.status === "none") {
    if (!person.current || !person.expected_email) return null;
    return (
      <ActionButton
        action={createStaffAccountAction.bind(null, person.employee_id)}
        label="建立帳號"
        pendingLabel="建立中…"
        confirmText={`確定替 ${person.name} 建立帳號 ${person.expected_email}？預設密碼為 ${DEFAULT_STAFF_PASSWORD}，首次登入必須改密碼。`}
        variant="secondary"
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
  return (
    <span className="inline-flex flex-wrap justify-end gap-2">
      <ActionButton
        action={resetStaffPasswordAction.bind(null, person.employee_id)}
        label="重設為預設密碼"
        pendingLabel="重設中…"
        confirmText={`確定把 ${person.name} 的密碼重設為 ${DEFAULT_STAFF_PASSWORD}？下次登入必須改密碼。`}
        variant="secondary"
      />
      {person.status === "disabled" ? (
        <ActionButton
          action={setStaffLoginDisabledAction.bind(
            null,
            person.employee_id,
            false,
          )}
          label="恢復登入"
          pendingLabel="處理中…"
          variant="secondary"
        />
      ) : (
        <ActionButton
          action={setStaffLoginDisabledAction.bind(
            null,
            person.employee_id,
            true,
          )}
          label="停用登入"
          pendingLabel="處理中…"
          confirmText={`確定停用 ${person.name} 的登入？停用後無法登入後台（已登入的工作階段最晚約一小時內失效）。`}
          variant="danger"
        />
      )}
    </span>
  );
}

function BatchCreateButton({ count }: { count: number }) {
  const router = useRouter();
  const [result, setResult] = useState<BatchCreateResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex max-w-[420px] flex-col items-end gap-2">
      <button
        type="button"
        disabled={pending || count === 0}
        className="bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-semibold text-white disabled:opacity-60"
        onClick={() => {
          if (
            !window.confirm(
              `確定替 ${count} 位在職且尚無帳號的員工建立帳號？預設密碼為 ${DEFAULT_STAFF_PASSWORD}，首次登入必須改密碼。`,
            )
          ) {
            return;
          }
          setResult(null);
          startTransition(async () => {
            const res = await createStaffAccountsBatchAction();
            setResult(res);
            router.refresh();
          });
        }}
      >
        {pending ? "建立中…" : `批次建立帳號（${count} 位）`}
      </button>
      {result ? (
        result.ok ? (
          <div role="status" className="text-right text-[13px]">
            <p className="text-primary-deep">
              已建立 {result.created.length} 個帳號
              {result.failed.length ? `，${result.failed.length} 位失敗` : ""}。
            </p>
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
