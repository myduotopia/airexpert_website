"use client";

import { useActionState, useEffect, useRef } from "react";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { createSeoManager, type StaffFormState } from "./actions";

// 建立 SEO 代管帳號表單。成功後清空欄位，方便連續建立。
export function CreateSeoManagerForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<StaffFormState, FormData>(
    createSeoManager,
    {},
  );

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex max-w-[560px] flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-ink text-[14px] font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="off"
          required
          placeholder="seo-vendor@example.com"
          className="border-border focus:border-primary h-11 rounded-lg border px-3 text-[15px] outline-none"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-ink text-[14px] font-medium">
          初始密碼
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="至少 8 個字元"
          className="border-border focus:border-primary h-11 rounded-lg border px-3 text-[15px] outline-none"
        />
        <p className="text-text-muted text-[12px]">
          代管人員可用此 Email + 密碼登入後台，只能編輯各內容的 SEO meta。
        </p>
      </div>

      {state.error ? (
        <p role="alert" className="text-[14px] text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="text-primary-deep text-[14px]">已建立代管帳號 ✓</p>
      ) : null}

      <div>
        <SubmitButton>建立代管帳號</SubmitButton>
      </div>
    </form>
  );
}
