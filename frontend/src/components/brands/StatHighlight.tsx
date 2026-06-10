// Emphasis stat blocks for brand pages (e.g. 節能 99%, 除油 99.8%). Big mono
// numbers in primary-deep with a supporting label, matching the home StatBar.
export type Stat = {
  value: string;
  label: string;
};

type StatHighlightProps = {
  stats: Stat[];
};

export function StatHighlight({ stats }: StatHighlightProps) {
  return (
    <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="border-border bg-surface flex flex-col gap-2 rounded-[14px] border p-7"
        >
          <dt className="text-text-muted order-2 text-[16px] leading-[1.6]">
            {stat.label}
          </dt>
          <dd className="text-primary-deep order-1 font-mono text-[44px] leading-none font-bold">
            {stat.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
