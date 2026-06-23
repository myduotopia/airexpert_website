// 可選用的 Gemini 模型（後台下拉選單；暫定兩個）。
// 獨立於 actions.ts（"use server" 僅能匯出 async function）與 client 表單共用。
export const AI_MODEL_OPTIONS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
] as const;

export const DEFAULT_AI_MODEL = AI_MODEL_OPTIONS[0];
