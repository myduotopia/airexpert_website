"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Send, CheckCircle2 } from "lucide-react";
import { submitContactForm } from "@/lib/contact";
import type { ContactSubmissionInput } from "@/lib/types";

// Contact form (issue #9). The only client component on /contact.
// Submits via `submitContactForm` (anon insert, NO `.select()` — see lib/contact.ts).
// States: idle | submitting | success | error.

type Status = "idle" | "submitting" | "success" | "error";

type FieldErrors = {
  name?: boolean;
  contact?: boolean; // email OR phone required
  message?: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ContactForm() {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  const [status, setStatus] = useState<Status>("idle");
  const [errors, setErrors] = useState<FieldErrors>({});

  // Move focus to the confirmation on success so screen readers announce it
  // (content already present when a live region first mounts is not announced).
  const successHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (status === "success") successHeadingRef.current?.focus();
  }, [status]);

  // Stable ids for label/aria associations.
  const baseId = useId();
  const nameId = `${baseId}-name`;
  const companyId = `${baseId}-company`;
  const phoneId = `${baseId}-phone`;
  const emailId = `${baseId}-email`;
  const messageId = `${baseId}-message`;
  const contactHintId = `${baseId}-contact-hint`;

  const submitting = status === "submitting";

  function validate(): boolean {
    const next: FieldErrors = {};
    if (!name.trim()) next.name = true;

    const hasEmail = email.trim().length > 0 && EMAIL_RE.test(email.trim());
    const hasPhone = phone.trim().length > 0;
    if (!hasEmail && !hasPhone) next.contact = true;

    if (!message.trim()) next.message = true;

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (!validate()) return;

    setStatus("submitting");
    const payload: ContactSubmissionInput = {
      name: name.trim() || null,
      company: company.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      message: message.trim() || null,
      source_page: "/contact",
    };

    try {
      await submitContactForm(payload);
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  // Success — replace the form with a thank-you confirmation.
  if (status === "success") {
    return (
      <div
        className="border-border bg-surface flex flex-col items-center gap-4 rounded-2xl border px-6 py-12 text-center"
        role="status"
        aria-live="polite"
      >
        <span className="bg-surface-muted flex h-14 w-14 items-center justify-center rounded-full">
          <CheckCircle2
            className="text-primary-deep h-7 w-7"
            aria-hidden="true"
          />
        </span>
        <h2
          ref={successHeadingRef}
          tabIndex={-1}
          className="text-ink text-[24px] font-bold outline-none"
        >
          感謝您的來信
        </h2>
        <p className="text-text-muted max-w-[360px] text-[17px] leading-[1.65]">
          我們已收到您的需求，專人將盡快與您聯繫。若為緊急事項，歡迎直接來電。
        </p>
      </div>
    );
  }

  const inputClass =
    "border-border bg-surface text-ink placeholder:text-text-muted/70 focus-visible:border-primary-deep focus-visible:ring-primary-deep/30 aria-[invalid=true]:border-primary-deep w-full rounded-lg border px-4 py-3 text-[17px] outline-none transition-colors focus-visible:ring-2";
  const labelClass = "text-ink text-[16px] font-semibold";

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="border-border bg-surface flex flex-col gap-5 rounded-2xl border p-6 md:p-8"
    >
      {/* Name (required) */}
      <div className="flex flex-col gap-2">
        <label htmlFor={nameId} className={labelClass}>
          姓名 <span className="text-primary-deep">*</span>
        </label>
        <input
          id={nameId}
          name="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          aria-required="true"
          aria-invalid={errors.name ? "true" : undefined}
          className={inputClass}
        />
        {errors.name ? (
          <p className="text-primary-deep text-[15px]">請填寫您的姓名。</p>
        ) : null}
      </div>

      {/* Company (optional) */}
      <div className="flex flex-col gap-2">
        <label htmlFor={companyId} className={labelClass}>
          公司
        </label>
        <input
          id={companyId}
          name="company"
          type="text"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          autoComplete="organization"
          className={inputClass}
        />
      </div>

      {/* Phone + Email (at least one required) */}
      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="flex flex-1 flex-col gap-2">
          <label htmlFor={phoneId} className={labelClass}>
            電話
          </label>
          <input
            id={phoneId}
            name="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            aria-invalid={errors.contact ? "true" : undefined}
            aria-describedby={contactHintId}
            className={inputClass}
          />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <label htmlFor={emailId} className={labelClass}>
            Email
          </label>
          <input
            id={emailId}
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            aria-invalid={errors.contact ? "true" : undefined}
            aria-describedby={contactHintId}
            className={inputClass}
          />
        </div>
      </div>
      <p
        id={contactHintId}
        className={
          errors.contact
            ? "text-primary-deep -mt-3 text-[15px]"
            : "text-text-muted -mt-3 text-[15px]"
        }
      >
        {errors.contact
          ? "請至少填寫電話或 Email，方便我們回覆您。"
          : "電話與 Email 至少擇一填寫，方便我們回覆您。"}
      </p>

      {/* Message (required) */}
      <div className="flex flex-col gap-2">
        <label htmlFor={messageId} className={labelClass}>
          需求留言 <span className="text-primary-deep">*</span>
        </label>
        <textarea
          id={messageId}
          name="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          aria-required="true"
          aria-invalid={errors.message ? "true" : undefined}
          className={`${inputClass} resize-y`}
        />
        {errors.message ? (
          <p className="text-primary-deep text-[15px]">請描述您的需求。</p>
        ) : null}
      </div>

      {/* Status region — announced to assistive tech. */}
      <p aria-live="polite" className="sr-only">
        {submitting ? "表單送出中" : ""}
      </p>
      {status === "error" ? (
        <p
          aria-live="assertive"
          className="border-border bg-surface-muted text-ink rounded-lg border px-4 py-3 text-[16px] leading-[1.6]"
        >
          很抱歉，送出時發生問題，請稍後再試一次，或直接來電與我們聯繫。
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="bg-primary-deep focus-visible:ring-primary-deep/40 inline-flex items-center justify-center gap-2 rounded-[26px] px-7 py-[14px] text-[17px] font-semibold text-white transition-opacity outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            送出中…
          </>
        ) : (
          <>
            送出需求
            <Send className="h-4 w-4" aria-hidden="true" />
          </>
        )}
      </button>
    </form>
  );
}
