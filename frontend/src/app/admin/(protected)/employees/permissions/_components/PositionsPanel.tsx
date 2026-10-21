"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/admin/ActionButton";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { ERP_INPUT } from "@/components/erp/styles";
import {
  MODULE_DESCRIPTIONS,
  MODULE_LABELS,
  POSITION_MODULES,
  type PositionModule,
} from "@/lib/admin/staff-accounts";
import type { PositionRow } from "@/lib/employees/permissions";
import {
  createPositionAction,
  deletePositionAction,
  setPositionActiveAction,
  setPositionModulesAction,
  updatePositionAction,
} from "../actions";

const BUTTON_PRIMARY =
  "bg-primary hover:bg-primary-deep inline-flex h-10 items-center justify-center rounded-lg px-4 text-[14px] font-semibold text-white disabled:opacity-60";
const BUTTON_SECONDARY =
  "border-border hover:bg-surface-muted inline-flex h-9 items-center rounded-md border bg-white px-3 text-[13px] font-medium whitespace-nowrap disabled:opacity-60";

// 職位頁籤：新增職位、改名／說明、停用、刪除（未被使用時），以及勾選每個職位的模組權限。
export function PositionsPanel({ positions }: { positions: PositionRow[] }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-text-muted text-[14px]">
        勾選後按「儲存權限」生效；擁有該職位的在職員工，下次載入頁面時就會看到對應的功能。停用的職位不提供任何權限。
      </p>
      {positions.length === 0 ? (
        <div className="border-border text-text-muted rounded-xl border border-dashed bg-white p-8 text-center text-[14px]">
          尚無職位。
        </div>
      ) : (
        positions.map((p) => <PositionCard key={p.id} position={p} />)
      )}
      <NewPositionForm />
    </div>
  );
}

function PositionCard({ position }: { position: PositionRow }) {
  const router = useRouter();
  const [modules, setModules] = useState<Set<PositionModule>>(
    () => new Set(position.modules),
  );
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(position.name);
  const [description, setDescription] = useState(position.description ?? "");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  const dirty =
    modules.size !== position.modules.length ||
    position.modules.some((m) => !modules.has(m));

  function toggle(m: PositionModule) {
    setMessage(null);
    setModules((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  }

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    setMessage(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setMessage({ ok: true, text: ok });
        setEditing(false);
        router.refresh();
      } else {
        setMessage({ ok: false, text: res.error ?? "操作失敗。" });
      }
    });
  }

  return (
    <section
      className={`border-border rounded-xl border bg-white p-5 ${
        position.active ? "" : "opacity-75"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        {editing ? (
          <div className="flex min-w-[260px] flex-1 flex-col gap-2">
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="text-text-muted">職位名稱</span>
              <input
                value={name}
                maxLength={30}
                onChange={(e) => setName(e.target.value)}
                className={ERP_INPUT}
              />
            </label>
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="text-text-muted">說明（選填）</span>
              <input
                value={description}
                maxLength={200}
                onChange={(e) => setDescription(e.target.value)}
                className={ERP_INPUT}
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                className={BUTTON_PRIMARY}
                onClick={() =>
                  run(
                    () =>
                      updatePositionAction(position.id, { name, description }),
                    "已更新職位 ✓",
                  )
                }
              >
                儲存
              </button>
              <button
                type="button"
                className={BUTTON_SECONDARY}
                onClick={() => {
                  setEditing(false);
                  setName(position.name);
                  setDescription(position.description ?? "");
                }}
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <div className="min-w-0">
            <h2 className="text-ink text-[18px] font-bold">
              {position.name}
              {!position.active ? (
                <span className="bg-surface-muted text-text-muted ml-2 rounded px-2 py-0.5 align-middle text-[12px] font-medium">
                  已停用
                </span>
              ) : null}
            </h2>
            <p className="text-text-muted mt-0.5 text-[13px]">
              {position.description ? `${position.description} · ` : ""}
              {position.employee_count} 位員工
            </p>
          </div>
        )}
        {!editing ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={BUTTON_SECONDARY}
              onClick={() => setEditing(true)}
            >
              改名
            </button>
            <ActionButton
              action={setPositionActiveAction.bind(
                null,
                position.id,
                !position.active,
              )}
              label={position.active ? "停用" : "啟用"}
              pendingLabel="處理中…"
              confirmText={
                position.active
                  ? `確定停用「${position.name}」？擁有此職位的員工會立即失去這個職位的所有權限。`
                  : undefined
              }
              variant="secondary"
            />
            {position.employee_count === 0 ? (
              <DeleteButton
                onDelete={deletePositionAction.bind(null, position.id)}
                confirmText={`確定刪除職位「${position.name}」？`}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      <fieldset className="mt-4" disabled={pending}>
        <legend className="text-ink mb-2 text-[14px] font-semibold">
          可使用的功能
        </legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {POSITION_MODULES.map((m) => (
            <label
              key={m}
              className="border-border hover:bg-surface-muted flex cursor-pointer items-start gap-3 rounded-lg border p-3"
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={modules.has(m)}
                onChange={() => toggle(m)}
              />
              <span>
                <span className="text-ink block text-[14px] font-medium">
                  {MODULE_LABELS[m]}
                </span>
                <span className="text-text-muted block text-[12px]">
                  {MODULE_DESCRIPTIONS[m]}
                </span>
              </span>
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!dirty || pending}
            className={BUTTON_PRIMARY}
            onClick={() =>
              run(
                () => setPositionModulesAction(position.id, [...modules]),
                "已儲存權限 ✓",
              )
            }
          >
            {pending ? "儲存中…" : "儲存權限"}
          </button>
          {message ? (
            <span
              role={message.ok ? "status" : "alert"}
              className={`text-[13px] ${
                message.ok ? "text-primary-deep" : "text-red-600"
              }`}
            >
              {message.text}
            </span>
          ) : null}
        </div>
      </fieldset>
    </section>
  );
}

function NewPositionForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="border-border flex flex-wrap items-end gap-3 rounded-xl border border-dashed bg-white p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const res = await createPositionAction({ name, description });
          if (res.ok) {
            setName("");
            setDescription("");
            router.refresh();
          } else {
            setError(res.error);
          }
        });
      }}
    >
      <label className="flex min-w-[180px] flex-col gap-1 text-[13px]">
        <span className="text-text-muted">新職位名稱</span>
        <input
          value={name}
          required
          maxLength={30}
          onChange={(e) => setName(e.target.value)}
          className={ERP_INPUT}
        />
      </label>
      <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[13px]">
        <span className="text-text-muted">說明（選填）</span>
        <input
          value={description}
          maxLength={200}
          onChange={(e) => setDescription(e.target.value)}
          className={ERP_INPUT}
        />
      </label>
      <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
        {pending ? "新增中…" : "新增職位"}
      </button>
      {error ? (
        <p role="alert" className="w-full text-[13px] text-red-600">
          {error}
        </p>
      ) : null}
    </form>
  );
}
