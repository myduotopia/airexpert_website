type Metric = {
  label: string;
  value: string;
};

type MetricsBoxProps = {
  metrics: Metric[];
};

/**
 * Bordered 2x2 metrics box for the hero — up to 4 key spec highlights, each cell
 * white with 1px internal dividers. Renders nothing when there are no metrics.
 */
export function MetricsBox({ metrics }: MetricsBoxProps) {
  if (metrics.length === 0) return null;

  return (
    <dl className="border-border grid grid-cols-2 overflow-hidden rounded-[12px] border">
      {metrics.map((metric, index) => (
        <div
          key={`${metric.label}-${index}`}
          className={`bg-surface flex flex-col gap-1 p-[18px] ${
            // 1px internal dividers: left border except first column,
            // top border on the second row.
            index % 2 === 1 ? "border-border border-l" : ""
          } ${index >= 2 ? "border-border border-t" : ""}`}
        >
          <dt className="text-text-muted font-mono text-[11px] tracking-[0.5px] uppercase">
            {metric.label}
          </dt>
          <dd className="text-ink text-[18px] font-bold">{metric.value}</dd>
        </div>
      ))}
    </dl>
  );
}
