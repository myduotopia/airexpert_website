"use client";
// 瀏覽器端把照片縮到長邊 <= maxEdge 並轉 JPEG base64，避開 Server Action 4.5MB 上限。

export interface CompressedImage {
  base64: string; // 不含 data: 前綴
  mimeType: "image/jpeg";
  dataUrl: string; // 供預覽
}

export async function compressImage(
  file: File,
  maxEdge = 1600,
  quality = 0.8,
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
