"use client";
// 瀏覽器端把照片縮到長邊 <= maxEdge 並轉 JPEG base64，避開 Server Action 4.5MB 上限。

export interface CompressedImage {
  base64: string; // 不含 data: 前綴
  mimeType: "image/jpeg";
  dataUrl: string; // 供預覽
}

// 辨識用：長邊上限拉高到 2400、品質 0.9，保留手寫細節（小數字 / 例 / 〃 等記號）。
// serverActions.bodySizeLimit 已設 25mb，base64 走 Server Action 無虞。
export async function compressImage(
  file: File,
  maxEdge = 2400,
  quality = 0.9,
): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("無法建立畫布");
  ctx.drawImage(bitmap, 0, 0, w, h);
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  return {
    base64: dataUrl.split(",")[1] ?? "",
    mimeType: "image/jpeg",
    dataUrl,
  };
}

/** 壓縮階梯：依序嘗試，直到 base64 長度不超過預算（手寫細節優先保留長邊）。 */
const FIT_STEPS: readonly (readonly [number, number])[] = [
  [2400, 0.9],
  [2400, 0.8],
  [2000, 0.8],
  [1600, 0.75],
  [1280, 0.7],
  [1024, 0.65],
];

/**
 * 壓縮到 base64 長度 <= maxBase64Length（多張照片一起送 Server Action 時，平台請求主體上限 4.5MB）。
 * 階梯用盡仍超過 → 回最後一階的結果，交給伺服器端驗證回錯誤訊息。
 */
export async function compressImageToFit(
  file: File,
  maxBase64Length: number,
): Promise<CompressedImage> {
  let last: CompressedImage | null = null;
  for (const [edge, quality] of FIT_STEPS) {
    last = await compressImage(file, edge, quality);
    if (last.base64.length <= maxBase64Length) return last;
  }
  return last as CompressedImage;
}
