// PostgREST 分頁讀取（#229）。
// Supabase（PostgREST）預設單次最多回 1,000 列（max-rows），超過的部分會被「靜默截斷」、不回錯誤。
// 需要完整清單的查詢（下拉選項、報表明細、全表列表）一律用 fetchAllRows 以 .range 分頁讀完。
//
// 使用注意：
// 1. buildPage 每次都要「重新建立」整個查詢：supabase-js 的 builder 是可變物件
//    （.order() 會累加排序、.eq() 會重複附加條件），不可在外面建好一個 builder 再重複 .range()。
// 2. 查詢需有穩定且唯一的排序（例：.order("code").order("id")），否則頁與頁之間可能重複或漏列。
// 3. pageSize 不可大於伺服器的 max-rows：回傳列數少於 pageSize 即視為最後一頁。
// 4. 任一頁失敗即回 { data: null, error }，不回部分資料（避免把殘缺清單當成完整結果）。
// 5. offset 分頁不是快照：讀取期間若有新增 / 刪除，可能多讀或少讀邊界上的一列（同既有各模組作法）。

/** 每頁筆數 = Supabase 預設 max-rows。 */
export const FETCH_ALL_PAGE_SIZE = 1000;

/**
 * 保護上限：讀到這麼多列仍是滿頁就停止並回錯誤。
 * 防止 buildPage 忘了套 .range（每頁都回滿頁）造成無窮迴圈、持續打 DB；
 * 遠大於目前各表規模（品項約 2,000、客戶約 1,000），真的超過時寧可報錯也不回殘缺資料。
 */
export const FETCH_ALL_MAX_ROWS = 500_000;

export const FETCH_ALL_TOO_MANY_ROWS_CODE = "FETCH_ALL_TOO_MANY_ROWS";

/** 預設錯誤型別（相容 supabase-js 的 PostgrestError）。 */
export interface FetchAllRowsError {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

export type FetchAllRowsResult<T, E> =
  | { data: T[]; error: null }
  | { data: null; error: E | FetchAllRowsError };

export interface FetchAllRowsOptions {
  /** 每頁筆數，不可大於伺服器 max-rows（預設 1000）。 */
  pageSize?: number;
  /** 保護上限（預設 500,000 列）。 */
  maxRows?: number;
}

function assertPositiveInt(name: string, n: number): void {
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError(`fetchAllRows：${name} 需為正整數（收到 ${n}）`);
  }
}

/**
 * 以 buildPage(from, to)（0 起算、含端點，同 .range）逐頁讀取，直到某頁少於 pageSize 為止。
 * 回傳形狀同 supabase 查詢結果（{ data, error }），呼叫端可直接替換原本的 await query。
 */
export async function fetchAllRows<T, E = FetchAllRowsError>(
  buildPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown; error: E | null }>,
  opts: FetchAllRowsOptions = {},
): Promise<FetchAllRowsResult<T, E>> {
  const pageSize = opts.pageSize ?? FETCH_ALL_PAGE_SIZE;
  const maxRows = opts.maxRows ?? FETCH_ALL_MAX_ROWS;
  assertPositiveInt("pageSize", pageSize);
  assertPositiveInt("maxRows", maxRows);
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildPage(from, from + pageSize - 1);
    if (error) return { data: null, error };
    const page = (data ?? []) as T[];
    for (const row of page) rows.push(row);
    if (page.length < pageSize) return { data: rows, error: null };
    if (rows.length >= maxRows) {
      return {
        data: null,
        error: {
          code: FETCH_ALL_TOO_MANY_ROWS_CODE,
          message: `資料超過分頁讀取上限（${maxRows} 列），為避免資料不完整已停止讀取。`,
        },
      };
    }
  }
}
