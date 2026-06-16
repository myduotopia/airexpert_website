"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { loginAction, type LoginState } from "../actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-primary mt-2 inline-flex h-11 items-center justify-center rounded-lg px-4 text-[15px] font-semibold text-white transition-opacity disabled:opacity-60"
    >
      {pending ? "登入中…" : "登入"}
    </button>
  );
}

export default function AdminLoginPage() {
  const [state, formAction] = useActionState<LoginState, FormData>(
    loginAction,
    {},
  );

  return (
    <div className="bg-surface-muted flex min-h-dvh items-center justify-center px-6">
      <div className="border-border w-full max-w-[400px] rounded-2xl border bg-white p-8 shadow-sm">
        <h1 className="text-ink text-[22px] font-bold">後台登入</h1>
        <p className="text-text-muted mt-1 text-[14px]">
          超勁賀空壓科技 · 內容管理後台
        </p>

        <form action={formAction} className="mt-6 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-ink text-[14px] font-medium">帳號 Email</span>
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              className="border-border focus:border-primary h-11 rounded-lg border px-3 text-[15px] outline-none"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-ink text-[14px] font-medium">密碼</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="border-border focus:border-primary h-11 rounded-lg border px-3 text-[15px] outline-none"
            />
          </label>

          {state.error ? (
            <p role="alert" className="text-[14px] text-red-600">
              {state.error}
            </p>
          ) : null}

          <SubmitButton />
        </form>
      </div>
    </div>
  );
}
