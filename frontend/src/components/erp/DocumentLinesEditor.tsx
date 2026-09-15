"use client";
// 單據明細編輯器（受控）：品項 / 折扣 / 備註三種行，新增、刪除、上下移動，
// 選品項自動帶入品名規格與單價；序號品項可選既有機號（serialMode="existing"）
// 或逐行輸入新機號（serialMode="new"）；下方以 calc.ts 即時試算合計 / 稅額 / 總計。
// 純呈現元件：不讀 DB、不送出；傳 name 時輸出 hidden input（JSON）供 <form> 送出。
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { calcDocumentTotals, calcLineAmount } from "@/lib/erp/calc";
import { newDraftLine, parseSerialLines } from "@/lib/erp/draft";
import type {
  DraftLine,
  ItemOption,
  LineType,
  SerialOption,
  TaxType,
} from "@/lib/erp/types";
import { ItemPicker } from "./ItemPicker";
import { MoneyText } from "./MoneyText";
import { NumberInput } from "./NumberInput";
import { SerialPicker } from "./SerialPicker";
import { ERP_AREA, ERP_BUTTON_SECONDARY, ERP_INPUT } from "./styles";

/** signed：依數量正負逐行決定（盤點調整單 A：盤盈輸入新機號、盤虧選既有機號）。 */
export type SerialMode = "none" | "existing" | "new" | "signed";

export interface DocumentLinesEditorProps {
  value: DraftLine[];
  onChange: (lines: DraftLine[]) => void;
  items: ItemOption[];
  /** serialMode="existing" 時的候選機號（依 item_id 分配到各行）。 */
  serials?: SerialOption[];
  serialMode?: SerialMode;
  /** 選品項時帶入哪個價格欄（null = 不帶入）。銷售用 sale_price、採購用 purchase_price。 */
  priceField?: "sale_price" | "purchase_price" | "avg_cost" | null;
  taxType: TaxType;
  taxRate: number;
  currency?: string;
  exchangeRate?: number;
  /** 是否顯示單價 / 金額欄與合計（調撥單 T 不需要）。預設 true。 */
  showPrices?: boolean;
  /** 允許負數量（盤點調整單 A 的盤虧）。 */
  allowNegativeQty?: boolean;
  /** 可新增的行類型（預設三種皆可）。 */
  allowedLineTypes?: LineType[];
  disabled?: boolean;
  /** 品項行文字欄的標題（預設「品名規格」；盤點調整單用「調整原因」）。 */
  descriptionLabel?: string;
  /** 傳入時輸出 <input type="hidden" name={name} value={JSON.stringify(lines)}>。 */
  name?: string;
}

const TAX_LABEL: Record<TaxType, string> = {
  excluded: "外加",
  included: "內含",
  exempt: "免稅",
};

export function DocumentLinesEditor({
  value,
  onChange,
  items,
  serials = [],
  serialMode = "none",
  priceField = "sale_price",
  taxType,
  taxRate,
  currency = "TWD",
  exchangeRate = 1,
  showPrices = true,
  allowNegativeQty = false,
  allowedLineTypes = ["item", "discount", "note"],
  disabled,
  descriptionLabel = "品名規格",
  name,
}: DocumentLinesEditorProps) {
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const serialsByItem = useMemo(() => {
    const m = new Map<string, SerialOption[]>();
    for (const s of serials) {
      const list = m.get(s.item_id) ?? [];
      list.push(s);
      m.set(s.item_id, list);
    }
    return m;
  }, [serials]);

  const totals = calcDocumentTotals({
    lines: value,
    taxType,
    taxRate,
    currency,
    exchangeRate,
  });

  function patchLine(key: string, patch: Partial<DraftLine>) {
    onChange(value.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function removeLine(key: string) {
    onChange(value.filter((l) => l.key !== key));
  }
  function moveLine(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }
  function addLine(type: LineType) {
    onChange([...value, newDraftLine(type)]);
  }
  function pickItem(line: DraftLine, item: ItemOption | null) {
    const price = item && priceField ? Number(item[priceField] ?? 0) : 0;
    patchLine(line.key, {
      item_id: item?.id ?? null,
      description: item?.name ?? "",
      unit_price: priceField ? price : line.unit_price,
      serial_ids: [],
      serial_nos: [],
    });
  }

  const colCount = showPrices ? 7 : 5;

  return (
    <div className="flex flex-col gap-3">
      <div className="border-border overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[760px] text-[14px]">
          <thead className="bg-surface-muted text-text-muted text-left text-[13px]">
            <tr>
              <th className="w-10 px-2 py-2 text-center font-medium">#</th>
              <th className="min-w-[220px] px-2 py-2 font-medium">品項</th>
              <th className="min-w-[200px] px-2 py-2 font-medium">
                {descriptionLabel}
              </th>
              <th className="w-24 px-2 py-2 text-right font-medium">數量</th>
              {showPrices && (
                <>
                  <th className="w-32 px-2 py-2 text-right font-medium">
                    單價
                  </th>
                  <th className="w-32 px-2 py-2 text-right font-medium">
                    金額
                  </th>
                </>
              )}
              <th className="w-24 px-2 py-2 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {value.length === 0 && (
              <tr>
                <td
                  colSpan={colCount}
                  className="text-text-muted px-3 py-6 text-center text-[14px]"
                >
                  尚無明細，請於下方新增。
                </td>
              </tr>
            )}
            {value.map((line, index) => {
              const item = line.item_id ? itemById.get(line.item_id) : null;
              const needSerial =
                line.line_type === "item" &&
                serialMode !== "none" &&
                !!item?.track_serial;
              const lineSerialMode =
                serialMode === "signed"
                  ? line.qty < 0
                    ? "existing"
                    : "new"
                  : serialMode;
              const serialCount =
                lineSerialMode === "new"
                  ? line.serial_nos.length
                  : line.serial_ids.length;
              const serialMismatch =
                needSerial && serialCount !== Math.abs(line.qty);
              const controls = (
                <div className="flex justify-end gap-0.5">
                  <IconButton
                    label="上移"
                    disabled={disabled || index === 0}
                    onClick={() => moveLine(index, -1)}
                  >
                    ↑
                  </IconButton>
                  <IconButton
                    label="下移"
                    disabled={disabled || index === value.length - 1}
                    onClick={() => moveLine(index, 1)}
                  >
                    ↓
                  </IconButton>
                  <IconButton
                    label="刪除此行"
                    disabled={disabled}
                    onClick={() => removeLine(line.key)}
                    danger
                  >
                    ×
                  </IconButton>
                </div>
              );

              return (
                // 一行明細可能佔兩列（主列 + 機號列），key 放在外層 Fragment。
                <Fragment key={line.key}>
                  <tr className="border-border border-t align-top">
                    <td className="text-text-muted px-2 py-2 text-center tabular-nums">
                      {index + 1}
                    </td>
                    {line.line_type === "item" && (
                      <>
                        <td className="px-2 py-2">
                          <ItemPicker
                            options={items}
                            value={line.item_id}
                            disabled={disabled}
                            onChange={(_, it) => pickItem(line, it)}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            aria-label={descriptionLabel}
                            value={line.description}
                            disabled={disabled}
                            onChange={(e) =>
                              patchLine(line.key, {
                                description: e.target.value,
                              })
                            }
                            className={ERP_INPUT}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <NumberInput
                            aria-label="數量"
                            value={line.qty}
                            allowNegative={allowNegativeQty}
                            decimals={item?.track_serial ? 0 : 3}
                            disabled={disabled}
                            onChange={(n) => patchLine(line.key, { qty: n })}
                          />
                          {item && (
                            <p className="text-text-muted mt-1 text-right text-[12px]">
                              {item.unit}
                            </p>
                          )}
                        </td>
                        {showPrices && (
                          <>
                            <td className="px-2 py-2">
                              <NumberInput
                                aria-label="單價"
                                value={line.unit_price}
                                decimals={2}
                                disabled={disabled}
                                onChange={(n) =>
                                  patchLine(line.key, { unit_price: n })
                                }
                              />
                            </td>
                            <td className="px-2 py-2 pt-4 text-right">
                              <MoneyText
                                value={calcLineAmount(line)}
                                decimals={2}
                              />
                            </td>
                          </>
                        )}
                      </>
                    )}
                    {line.line_type === "discount" && (
                      <>
                        <td className="text-text-muted px-2 py-2 pt-4 text-[13px]">
                          折扣
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            aria-label="折扣說明"
                            placeholder="折扣說明"
                            value={line.description}
                            disabled={disabled}
                            onChange={(e) =>
                              patchLine(line.key, {
                                description: e.target.value,
                              })
                            }
                            className={ERP_INPUT}
                          />
                        </td>
                        <td className="px-2 py-2" />
                        {showPrices && (
                          <>
                            <td className="px-2 py-2">
                              <NumberInput
                                aria-label="折扣金額"
                                placeholder="折扣金額"
                                value={Math.abs(line.amount)}
                                decimals={2}
                                disabled={disabled}
                                onChange={(n) =>
                                  patchLine(line.key, { amount: -Math.abs(n) })
                                }
                              />
                            </td>
                            <td className="px-2 py-2 pt-4 text-right">
                              <MoneyText
                                value={calcLineAmount(line)}
                                decimals={2}
                                negativeRed
                              />
                            </td>
                          </>
                        )}
                      </>
                    )}
                    {line.line_type === "note" && (
                      <td colSpan={showPrices ? 5 : 3} className="px-2 py-2">
                        <input
                          type="text"
                          aria-label="備註內容"
                          placeholder="備註（列印時顯示於明細中）"
                          value={line.description}
                          disabled={disabled}
                          onChange={(e) =>
                            patchLine(line.key, {
                              description: e.target.value,
                            })
                          }
                          className={ERP_INPUT}
                        />
                      </td>
                    )}
                    <td className="px-2 py-2 pt-3">{controls}</td>
                  </tr>
                  {needSerial && (
                    <tr>
                      <td />
                      <td colSpan={colCount - 1} className="px-2 pb-3">
                        <div className="flex flex-col gap-1">
                          <span className="text-text-muted text-[12px]">
                            機號
                            {serialMismatch && (
                              <span className="ml-2 text-amber-700">
                                機號數（{serialCount}）與數量（
                                {Math.abs(line.qty)}）不符，過帳前需一致
                              </span>
                            )}
                          </span>
                          {lineSerialMode === "existing" ? (
                            <SerialPicker
                              options={serialsByItem.get(item.id) ?? []}
                              value={line.serial_ids}
                              max={
                                Number.isInteger(Math.abs(line.qty))
                                  ? Math.abs(line.qty)
                                  : undefined
                              }
                              disabled={disabled}
                              onChange={(ids) =>
                                patchLine(line.key, { serial_ids: ids })
                              }
                            />
                          ) : (
                            <SerialNosTextarea
                              value={line.serial_nos}
                              disabled={disabled}
                              onChange={(nos) =>
                                patchLine(line.key, { serial_nos: nos })
                              }
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {!disabled && (
        <div className="flex flex-wrap gap-2">
          {allowedLineTypes.includes("item") && (
            <button
              type="button"
              onClick={() => addLine("item")}
              className={ERP_BUTTON_SECONDARY}
            >
              ＋ 品項
            </button>
          )}
          {showPrices && allowedLineTypes.includes("discount") && (
            <button
              type="button"
              onClick={() => addLine("discount")}
              className={ERP_BUTTON_SECONDARY}
            >
              ＋ 折扣
            </button>
          )}
          {allowedLineTypes.includes("note") && (
            <button
              type="button"
              onClick={() => addLine("note")}
              className={ERP_BUTTON_SECONDARY}
            >
              ＋ 備註
            </button>
          )}
        </div>
      )}

      {showPrices && (
        <dl className="ml-auto grid w-full max-w-[320px] grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-[14px]">
          <dt className="text-text-muted">合計（{TAX_LABEL[taxType]}）</dt>
          <dd className="text-right">
            <MoneyText value={totals.amount_untaxed} currency={currency} />
          </dd>
          <dt className="text-text-muted">
            稅額
            {taxType !== "exempt" ? `（${roundPercent(taxRate)}%）` : ""}
          </dt>
          <dd className="text-right">
            <MoneyText value={totals.tax_amount} currency={currency} />
          </dd>
          <dt className="text-ink font-semibold">總計</dt>
          <dd className="text-ink text-right font-semibold">
            <MoneyText
              value={totals.total_amount}
              currency={currency}
              showCurrency={currency !== "TWD"}
            />
          </dd>
          {currency !== "TWD" && (
            <>
              <dt className="text-text-muted">折合台幣</dt>
              <dd className="text-right">
                <MoneyText value={totals.total_twd} currency="TWD" />
              </dd>
            </>
          )}
        </dl>
      )}

      {name && (
        <input type="hidden" name={name} value={JSON.stringify(value)} />
      )}
    </div>
  );
}

function roundPercent(rate: number): string {
  return String(Math.round(rate * 10000) / 100);
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`hover:bg-surface-muted h-8 w-8 rounded-md text-[15px] leading-none disabled:opacity-30 ${
        danger ? "text-red-600" : "text-text-muted"
      }`}
    >
      {children}
    </button>
  );
}

/** 新機號輸入：每行一台，可貼上多行。保留使用者輸入中的空行，回報時才整理。 */
function SerialNosTextarea({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (nos: string[]) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState(() => value.join("\n"));
  const [lastValue, setLastValue] = useState(value);

  if (value !== lastValue) {
    setLastValue(value);
    if (parseSerialLines(text).join("\n") !== value.join("\n")) {
      setText(value.join("\n"));
    }
  }

  return (
    <textarea
      aria-label="新機號（每行一台）"
      placeholder="每行輸入一個機號，可直接貼上多行"
      rows={Math.min(Math.max(value.length + 1, 2), 8)}
      value={text}
      disabled={disabled}
      onChange={(e) => {
        setText(e.target.value);
        const nos = parseSerialLines(e.target.value);
        setLastValue(nos);
        onChange(nos);
      }}
      className={`${ERP_AREA} font-mono`}
    />
  );
}
