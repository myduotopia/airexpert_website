// 金額顯示（千分位、依幣別小數位、負數標紅可選）。server / client 皆可用。
import { formatMoney } from "@/lib/erp/format";

export function MoneyText({
  value,
  currency = "TWD",
  decimals,
  showCurrency = false,
  negativeRed = false,
  className = "",
}: {
  value: number | null | undefined;
  currency?: string;
  /** 覆寫小數位（預設 TWD 0 位、外幣 2 位）。 */
  decimals?: number;
  /** 顯示幣別前綴（例：USD 1,234.50）。 */
  showCurrency?: boolean;
  negativeRed?: boolean;
  className?: string;
}) {
  const text = formatMoney(value, { currency, decimals });
  const red = negativeRed && typeof value === "number" && value < 0;
  return (
    <span
      className={`tabular-nums ${red ? "text-red-600" : ""} ${className}`.trim()}
    >
      {showCurrency && text !== "—" ? `${currency} ` : ""}
      {text}
    </span>
  );
}
