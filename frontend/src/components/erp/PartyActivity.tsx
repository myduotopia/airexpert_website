// 客戶／廠商詳情頁「相關單據」區塊（#267，server component）。
// 單據（報價／銷貨／銷退；採購／進貨／進退）與收付款（含沖抵單、退款單）合併，新到舊、每頁 20 筆；
// 頁碼與篩選走網址參數（docs_page／docs_type／docs_voided），整列連到該單詳情頁。
// 需 erp 模組（查詢走 erp RLS）；保養卡的客戶頁不使用此區塊。
import Link from "next/link";
import type { ReactNode } from "react";
import { DocStatusBadge } from "@/components/erp/DocStatusBadge";
import { MoneyText } from "@/components/erp/MoneyText";
import {
  activityPageCount,
  activityRowView,
  PARTY_ACTIVITY_ANCHOR,
  partyActivityFilters,
  partyActivityHref,
  parsePartyActivityParams,
} from "@/lib/erp/party-activity";
import { listPartyActivity } from "@/lib/erp/queries/party-activity";
import type { PartyType } from "@/lib/erp/types";

type RawParams = Record<string, string | string[] | undefined>;

const CHIP =
  "inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-medium";
const CHIP_ON = "border-primary bg-primary/10 text-primary-deep";
const CHIP_OFF =
  "border-border text-text-muted hover:bg-surface-muted bg-white";
const PAGER_BTN =
  "border-border hover:bg-surface-muted inline-flex h-9 items-center rounded-lg border bg-white px-3 text-[13px] font-semibold";

export async function PartyActivity({
  partyType,
  partyId,
  basePath,
  searchParams,
}: {
  partyType: PartyType;
  partyId: string;
  /** 詳情頁路徑（分頁／篩選連結用），例：/admin/erp/customers/{id}。 */
  basePath: string;
  searchParams: RawParams;
}) {
  const params = parsePartyActivityParams(searchParams, partyType);
  const res = await listPartyActivity(partyType, partyId, params);
  const href = (patch: Parameters<typeof partyActivityHref>[2]) =>
    partyActivityHref(basePath, searchParams, patch);
  const filtered = params.filter !== "all" || params.includeVoided;
  const openHeader =
    partyType === "customer" ? "未沖餘額／預收" : "未沖餘額／預付";

  return (
    <section
      id={PARTY_ACTIVITY_ANCHOR}
      aria-labelledby={`${PARTY_ACTIVITY_ANCHOR}-title`}
      className="mt-8 scroll-mt-24"
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <h2
          id={`${PARTY_ACTIVITY_ANCHOR}-title`}
          className="text-ink text-[18px] font-bold"
        >
          相關單據
        </h2>
        <Link
          href={href({ includeVoided: !params.includeVoided })}
          className="text-primary-deep text-[13px] font-medium hover:underline"
        >
          {params.includeVoided ? "隱藏作廢單" : "顯示作廢單"}
        </Link>
      </div>

      <nav aria-label="單別篩選" className="mb-3 flex flex-wrap gap-2">
        {partyActivityFilters(partyType).map((f) => {
          const on = f.value === params.filter;
          return (
            <Link
              key={f.value}
              href={href({ filter: f.value })}
              aria-current={on ? "true" : undefined}
              className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}
            >
              {f.label}
            </Link>
          );
        })}
      </nav>

      {!res.ok ? (
        <p role="alert" className="text-[14px] text-red-600">
          {res.error}
        </p>
      ) : res.data.rows.length === 0 ? (
        <div className="border-border text-text-muted rounded-xl border border-dashed bg-white p-8 text-center text-[14px]">
          {res.data.total > 0 ? (
            <>
              此頁沒有資料。
              <Link
                href={href({ page: activityPageCount(res.data.total) })}
                className="text-primary-deep ml-1 hover:underline"
              >
                回到最後一頁
              </Link>
            </>
          ) : filtered ? (
            "沒有符合條件的單據。"
          ) : partyType === "customer" ? (
            "此客戶尚無單據或收款紀錄。"
          ) : (
            "此廠商尚無單據或付款紀錄。"
          )}
        </div>
      ) : (
        <>
          <div className="border-border overflow-x-auto rounded-xl border bg-white">
            <table className="w-full border-collapse text-left text-[14px]">
              <thead>
                <tr className="border-border text-text-muted border-b">
                  <th className="px-4 py-3 font-medium">日期</th>
                  <th className="px-4 py-3 font-medium">單別</th>
                  <th className="px-4 py-3 font-medium">單號</th>
                  <th className="px-4 py-3 font-medium">狀態</th>
                  <th className="px-4 py-3 text-right font-medium">
                    金額（TWD）
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    {openHeader}
                  </th>
                </tr>
              </thead>
              <tbody>
                {res.data.rows.map((row) => {
                  const v = activityRowView(row);
                  // 整列可點：每格都是同一連結；只有單號格可 Tab 聚焦，避免同一列重複停留。
                  const cell = (
                    content: ReactNode,
                    opts: { right?: boolean; primary?: boolean } = {},
                  ) => (
                    <td className="p-0">
                      <Link
                        href={v.href}
                        tabIndex={opts.primary ? undefined : -1}
                        className={`block px-4 py-3 whitespace-nowrap ${opts.right ? "text-right" : ""}`}
                      >
                        {content}
                      </Link>
                    </td>
                  );
                  return (
                    <tr
                      key={v.key}
                      className={`border-border hover:bg-surface-muted border-b last:border-b-0 ${v.voided ? "text-text-muted" : "text-ink"}`}
                    >
                      {cell(v.dateText)}
                      {cell(v.typeLabel)}
                      {cell(
                        <>
                          <span
                            className={`font-mono text-[13px] font-medium ${v.voided ? "line-through" : ""}`}
                          >
                            {v.docNoText}
                          </span>
                          {v.tag && (
                            <span
                              className={`ml-2 rounded px-1.5 py-0.5 text-[11px] font-semibold ${v.tag === "退款" ? "bg-amber-50 text-amber-700" : "bg-surface-muted text-text-muted"}`}
                            >
                              {v.tag}
                            </span>
                          )}
                        </>,
                        { primary: true },
                      )}
                      {cell(
                        <DocStatusBadge
                          status={row.status}
                          label={v.statusText}
                        />,
                      )}
                      {cell(<MoneyText value={v.amount} negativeRed />, {
                        right: true,
                      })}
                      {cell(
                        v.open === null ? (
                          "—"
                        ) : (
                          <MoneyText
                            value={v.open}
                            negativeRed
                            className={v.open !== 0 ? "font-semibold" : ""}
                          />
                        ),
                        { right: true },
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="text-text-muted mt-3 flex items-center justify-between text-[13px]">
            <span>
              共 {res.data.total} 筆，第 {params.page} /{" "}
              {activityPageCount(res.data.total)} 頁
            </span>
            <div className="flex gap-2">
              {params.page > 1 && (
                <Link
                  href={href({ page: params.page - 1 })}
                  className={PAGER_BTN}
                >
                  上一頁
                </Link>
              )}
              {params.page < activityPageCount(res.data.total) && (
                <Link
                  href={href({ page: params.page + 1 })}
                  className={PAGER_BTN}
                >
                  下一頁
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
