export type SpecColumn = {
  /** Column header label. */
  label: string;
  /** Min width (px) so columns stay legible inside the horizontal scroller. */
  minWidth: number;
};

type SpecTableProps = {
  /** Optional caption above the table (e.g. the model-series name). */
  caption?: string;
  columns: SpecColumn[];
  /** Each row is an array of cell strings, aligned to `columns` by index. */
  rows: string[][];
  /** Optional footnote rendered under the table (units, power, temp range…). */
  note?: string;
};

/**
 * Horizontally-scrollable spec table built with flexbox (per the design-system
 * table guidance) rather than `<table>`, so wide matrices scroll cleanly on
 * mobile inside `overflow-x-auto`. Uses `role="table"`/`row`/`columnheader`/
 * `cell` to keep the flex layout accessible. Each column carries a `minWidth`
 * so content never collapses; the inner track grows past the viewport and the
 * wrapper scrolls.
 */
export function SpecTable({ caption, columns, rows, note }: SpecTableProps) {
  const totalMinWidth = columns.reduce((sum, col) => sum + col.minWidth, 0);

  return (
    <figure className="flex flex-col gap-3">
      {caption ? (
        <figcaption className="text-ink text-[17px] font-semibold">
          {caption}
        </figcaption>
      ) : null}

      <div className="border-border overflow-x-auto rounded-[12px] border">
        <div role="table" style={{ minWidth: `${totalMinWidth}px` }}>
          {/* Header row */}
          <div
            role="row"
            className="bg-primary-deep flex text-[15px] font-bold text-white"
          >
            {columns.map((col) => (
              <div
                key={col.label}
                role="columnheader"
                className="px-4 py-3"
                style={{ flex: `1 0 ${col.minWidth}px` }}
              >
                {col.label}
              </div>
            ))}
          </div>

          {/* Data rows */}
          {rows.map((cells, rowIndex) => (
            <div
              key={cells[0] ?? `row-${rowIndex}`}
              role="row"
              className={`border-border flex border-t text-[15px] ${
                rowIndex % 2 === 1 ? "bg-surface-muted" : "bg-surface"
              }`}
            >
              {columns.map((col, colIndex) => {
                const value = cells[colIndex];
                const display = value && value.trim() !== "" ? value : "—";
                const isFirst = colIndex === 0;
                return (
                  <div
                    key={col.label}
                    role="cell"
                    className={`px-4 py-3 ${
                      isFirst
                        ? "text-ink font-semibold"
                        : "text-text-muted font-mono"
                    }`}
                    style={{ flex: `1 0 ${col.minWidth}px` }}
                  >
                    {display}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {note ? (
        <p className="text-text-muted text-[14px] leading-[1.6]">{note}</p>
      ) : null}
    </figure>
  );
}
