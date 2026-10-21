"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { changePasswordAction, type ChangePasswordState } from "./actions";

const INPUT =
  "border-border focus:border-primary h-11 rounded-lg border px-3 text-[15px] outline-none";

function Field({
  id,
  label,
  autoComplete,
  hint,
}: {
  id: string;
  label: string;
  autoComplete: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-ink text-[14px] font-medium">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type="password"
        autoComplete={autoComplete}
        required
        className={INPUT}
      />
      {hint ? <p className="text-text-muted text-[12px]">{hint}</p> : null}
    </div>
  );
}

// 變更密碼表單。成功後清空欄位並提供回到後台的連結（側欄會隨之解鎖）。
export function ChangePasswordForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<ChangePasswordState, FormData>(
    changePasswordAction,
    {},
  );

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <Field
        id="current_password"
        label="目前密碼"
        autoComplete="current-password"
      />
      <Field
        id="new_password"
        label="新密碼"
        autoComplete="new-password"
        hint="至少 8 個字元，不可為 00000000，也不可與目前密碼相同。"
      />
      <Field
        id="confirm_password"
        label="再輸入一次新密碼"
        autoComplete="new-password"
      />

      {state.error ? (
        <p role="alert" className="text-[14px] text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p role="status" className="text-primary-deep text-[14px]">
          密碼已更新 ✓ 下次登入請使用新密碼。{" "}
          <Link href="/admin" className="font-semibold underline">
            前往後台
          </Link>
        </p>
      ) : null}

      <div>
        <SubmitButton pendingText="更新中…">更新密碼</SubmitButton>
      </div>
    </form>
  );
}
