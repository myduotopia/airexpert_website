"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Event, ContentStatus } from "@/lib/types";
import { saveEvent } from "./actions";

// #89：狀態 UI 簡化為「公開 / 隱藏」（DB enum 仍保留 archived）。
const STATUS_OPTIONS: { value: ContentStatus; label: string }[] = [
  { value: "published", label: "公開" },
  { value: "draft", label: "隱藏" },
];

const inputClass =
  "border-border focus:border-primary w-full rounded-lg border bg-white px-3 py-2 text-[14px] outline-none";
const labelClass = "text-ink text-[13px] font-medium";

export function EventForm({ event }: { event?: Event }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const action = saveEvent.bind(null, event?.id ?? null);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await action(formData);
      if (res.ok) {
        router.push("/admin/events");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="title" className={labelClass}>
          標題 *
        </label>
        <input
          id="title"
          name="title"
          required
          defaultValue={event?.title ?? ""}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="video_url" className={labelClass}>
          YouTube 影片連結
        </label>
        <input
          id="video_url"
          name="video_url"
          placeholder="https://www.youtube.com/watch?v=..."
          defaultValue={event?.video_url ?? ""}
          className={`${inputClass} font-mono text-[13px]`}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className={labelClass}>
          說明
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={event?.description ?? ""}
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="event_date" className={labelClass}>
            活動日期
          </label>
          <input
            id="event_date"
            name="event_date"
            type="date"
            defaultValue={event?.event_date ?? ""}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="status" className={labelClass}>
            狀態
          </label>
          <select
            id="status"
            name="status"
            defaultValue={event?.status === "published" ? "published" : "draft"}
            className={inputClass}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-[13px] text-red-600">
          {error}
        </p>
      ) : null}

      <div className="border-border flex items-center gap-3 border-t pt-4">
        <button
          type="submit"
          disabled={pending}
          className="bg-primary hover:bg-primary-deep inline-flex h-10 items-center justify-center rounded-lg px-4 text-[14px] font-semibold text-white transition-colors disabled:opacity-60"
        >
          {pending ? "處理中…" : event ? "儲存變更" : "建立影片"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/events")}
          className="text-text-muted hover:text-ink text-[14px]"
        >
          取消
        </button>
      </div>
    </form>
  );
}
