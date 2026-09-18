"use client";

// 列印位置校正面板（spec §5.1）：X/Y 平移 ±15mm、縮放 90–110%，可重設為預設值。
// 輸入框保留使用者輸入的原字串（清空時不會跳成 0），對外一律送出 clampCalibration 後的值；
// 儲存（localStorage）由呼叫端負責（SheetPrintView），本元件是受控的純 UI。
import { useState } from "react";
import {
  DEFAULT_CALIBRATION,
  MAX_OFFSET_MM,
  MAX_SCALE,
  MIN_SCALE,
  clampCalibration,
  type Calibration,
} from "@/lib/service-report/layout";

const MIN_SCALE_PCT = Math.round(MIN_SCALE * 100);
const MAX_SCALE_PCT = Math.round(MAX_SCALE * 100);

const NUM =
  "border-border focus:border-primary h-9 w-20 rounded-lg border bg-white px-2 text-right text-[14px] tabular-nums outline-none";
const LABEL = "text-ink w-24 shrink-0 text-[13px] font-medium";

/** 顯示用字串（避免 0.5 顯示成 0.500）。 */
function show(n: number): string {
  return String(n);
}

export interface CalibrationPanelProps {
  value: Calibration;
  onChange: (next: Calibration) => void;
  /** 校正值是否已寫入瀏覽器（false＝localStorage 不可用，只在本次列印有效）。 */
  persisted?: boolean;
}

export function CalibrationPanel({
  value,
  onChange,
  persisted = true,
}: CalibrationPanelProps) {
  // 輸入中的原字串（null＝跟著 value 顯示）。
  const [draft, setDraft] = useState<Partial<Record<Field, string>>>({});

  function commit(field: Field, raw: string) {
    setDraft((d) => ({ ...d, [field]: raw }));
    onChange(
      clampCalibration({
        ...value,
        [field === "scalePct" ? "scale" : field]:
          field === "scalePct"
            ? raw.trim() === ""
              ? DEFAULT_CALIBRATION.scale
              : Number(raw) / 100
            : raw,
      }),
    );
  }

  function text(field: Field, fallback: number): string {
    const d = draft[field];
    return d === undefined ? show(fallback) : d;
  }

  function reset() {
    setDraft({});
    onChange({ ...DEFAULT_CALIBRATION });
  }

  const scalePct = Math.round(value.scale * 1000) / 10;

  return (
    <div className="border-border flex flex-col gap-3 rounded-xl border bg-white p-4 text-[14px] shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-ink text-[15px] font-semibold">列印位置校正</h2>
        <button
          type="button"
          onClick={reset}
          className="border-border hover:bg-surface-muted inline-flex h-8 items-center rounded-lg border bg-white px-3 text-[13px] font-semibold"
        >
          重設
        </button>
      </div>

      <Row
        label="左右平移"
        hint={`−${MAX_OFFSET_MM} ~ ${MAX_OFFSET_MM} mm，正值往右`}
      >
        <input
          aria-label="左右平移（mm）"
          type="number"
          inputMode="decimal"
          step={0.5}
          min={-MAX_OFFSET_MM}
          max={MAX_OFFSET_MM}
          value={text("offsetXmm", value.offsetXmm)}
          onChange={(e) => commit("offsetXmm", e.target.value)}
          className={NUM}
        />
        <span className="text-text-muted text-[13px]">mm</span>
      </Row>

      <Row
        label="上下平移"
        hint={`−${MAX_OFFSET_MM} ~ ${MAX_OFFSET_MM} mm，正值往下`}
      >
        <input
          aria-label="上下平移（mm）"
          type="number"
          inputMode="decimal"
          step={0.5}
          min={-MAX_OFFSET_MM}
          max={MAX_OFFSET_MM}
          value={text("offsetYmm", value.offsetYmm)}
          onChange={(e) => commit("offsetYmm", e.target.value)}
          className={NUM}
        />
        <span className="text-text-muted text-[13px]">mm</span>
      </Row>

      <Row label="縮放" hint={`${MIN_SCALE_PCT} ~ ${MAX_SCALE_PCT}%`}>
        <input
          aria-label="縮放（%）"
          type="number"
          inputMode="decimal"
          step={0.5}
          min={MIN_SCALE_PCT}
          max={MAX_SCALE_PCT}
          value={text("scalePct", scalePct)}
          onChange={(e) => commit("scalePct", e.target.value)}
          className={NUM}
        />
        <span className="text-text-muted text-[13px]">%</span>
      </Row>

      <p className="text-text-muted text-[12px] leading-relaxed">
        {persisted
          ? "校正值存在這台電腦的瀏覽器，所有報告單共用。"
          : "此瀏覽器無法儲存校正值（隱私模式？），設定只在本次列印有效。"}
      </p>
    </div>
  );
}

type Field = "offsetXmm" | "offsetYmm" | "scalePct";

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={LABEL}>{label}</span>
      {children}
      <span className="text-text-muted text-[12px]">{hint}</span>
    </div>
  );
}
