import type { ProductSpec } from "@/lib/types";

type SpecTableProps = {
  spec: ProductSpec;
};

/**
 * Renders the product's `spec` jsonb as a 2-column table: each top-level key
 * becomes a row (key → first/label column, value → value column). The schema
 * does not fix the keys (open key/value map), so we iterate `Object.entries`.
 *
 * The design references a 4-model comparison grid, but a single product carries
 * one spec set, so a single value column is the correct rendering here. Values
 * are stringified; null/empty values fall back to an em dash. Returns null when
 * there are no spec entries (caller decides what to show instead).
 */
export function SpecTable({ spec }: SpecTableProps) {
  const rows = Object.entries(spec ?? {}).filter(([key]) => key.trim() !== "");

  if (rows.length === 0) return null;

  return (
    <div className="border-border overflow-x-auto rounded-[12px] border">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="bg-primary-deep text-white">
            <th
              scope="col"
              className="px-5 py-3 text-[15px] font-bold whitespace-nowrap"
            >
              項目
            </th>
            <th
              scope="col"
              className="px-5 py-3 font-mono text-[15px] font-bold whitespace-nowrap"
            >
              規格
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([key, value], index) => {
            const display =
              value === null || value === "" ? "—" : String(value);
            return (
              <tr
                key={key}
                className={`border-border border-t ${
                  index % 2 === 1 ? "bg-surface-muted" : "bg-surface"
                }`}
              >
                <th
                  scope="row"
                  className="text-ink px-5 py-3 text-[15px] font-semibold whitespace-nowrap"
                >
                  {key}
                </th>
                <td className="text-text-muted px-5 py-3 font-mono text-[15px]">
                  {display}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
