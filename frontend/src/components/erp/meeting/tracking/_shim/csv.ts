// ⚠️ 暫代版（#272）：#271 合併後改用 lib/erp/meeting/csv.ts，並刪除本檔。
// 瀏覽器端下載 CSV 字串（server action 已產生含 BOM 的內容，見 lib/erp/reports.ts 的 toCsv）。

export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
