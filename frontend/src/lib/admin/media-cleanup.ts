// 取代圖片時，刪除「不再被引用」的舊上傳檔，避免 media bucket 堆積孤兒檔。SERVER ONLY。
//
// 安全保證（重要）：只刪「media bucket 內的公開檔」。
//   * 內建預設素材（/brand/logo-mark.png、/favicon.ico、/hero/*、/categories/* …）
//     與任何手填的外部 URL 都「不含」media 公開前綴 → mediaPathFromUrl 回 null → 永不刪除，
//     前台一律能 fallback 到內建預設。
//   * 僅刪「舊值有、新值沒有」的 media 檔（still-referenced 的不刪）。
//   * best-effort：刪除失敗只記 log，不影響存檔結果。
import "server-only";

import { getAdminSupabase } from "../supabase-admin";
import { HOME_KEYS } from "../data/home-keys";

// 僅認 Supabase（*.supabase.co）的 media bucket 公開 URL，並取出 bucket 內路徑。
// 錨定 host 可避免有人手填「外部網址剛好含相同路徑片段」而被誤判為本站 media 檔
// （即使被誤判也只會對「本站 media bucket」下無此檔的 key 做無害 no-op，仍加此防線）。
const MEDIA_PUBLIC_RE =
  /^https?:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\/media\/(.+)$/;

/**
 * 由公開 URL 取出 media bucket 內的相對路徑（供 storage.remove 用）。
 * 非本站 media 公開 URL（內建預設 / 外部連結 / 空值）→ null（代表不可刪）。
 */
export function mediaPathFromUrl(url: unknown): string | null {
  if (typeof url !== "string" || url === "") return null;
  const m = MEDIA_PUBLIC_RE.exec(url);
  if (!m) return null;
  const path = m[1];
  if (!path) return null;
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/**
 * 純函式：算出「舊值有、新值已不再引用」且屬 media bucket 的路徑（去重）。
 * 只回傳這些路徑——非 media 檔（預設/外部）一律被 mediaPathFromUrl 濾掉。
 */
export function removedMediaPaths(
  oldUrls: readonly (string | null | undefined)[],
  newUrls: readonly (string | null | undefined)[],
): string[] {
  const keep = new Set(
    newUrls.map(mediaPathFromUrl).filter((p): p is string => p !== null),
  );
  const removed = new Set<string>();
  for (const u of oldUrls) {
    const p = mediaPathFromUrl(u);
    if (p !== null && !keep.has(p)) removed.add(p);
  }
  return [...removed];
}

/** 刪除「不再被引用」的舊 media 檔。best-effort，不丟錯。 */
export async function cleanupRemovedMedia(
  oldUrls: readonly (string | null | undefined)[],
  newUrls: readonly (string | null | undefined)[],
): Promise<void> {
  const paths = removedMediaPaths(oldUrls, newUrls);
  if (paths.length === 0) return;
  try {
    const { error } = await getAdminSupabase()
      .storage.from("media")
      .remove(paths);
    if (error) {
      console.error("[media-cleanup] 刪除舊圖失敗", error.message);
    }
  } catch (e) {
    console.error("[media-cleanup] 刪除舊圖例外", e);
  }
}

/**
 * 取出某首頁區段 value 內所有圖片 URL（目前只有輪播 slides / 產品分類 categories 有圖）。
 * 純函式；容錯：非預期形狀回空陣列。
 */
export function sectionImageUrls(key: string, value: unknown): string[] {
  if (typeof value !== "object" || value === null) return [];
  const v = value as Record<string, unknown>;
  if (key === HOME_KEYS.carousel) {
    return extractUrls(v.slides);
  }
  if (key === HOME_KEYS.products) {
    return extractUrls(v.categories);
  }
  return [];
}

function extractUrls(rows: unknown): string[] {
  if (!Array.isArray(rows)) return [];
  const out: string[] = [];
  for (const row of rows) {
    if (row && typeof row === "object") {
      const u = (row as Record<string, unknown>).image_url;
      if (typeof u === "string" && u !== "") out.push(u);
    }
  }
  return out;
}
