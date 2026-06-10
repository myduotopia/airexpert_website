import type { Feature } from "./sample";

type FeatureGridProps = {
  features: Feature[];
};

/** KEY FEATURES card grid — icon chip + title + description per card. */
export function FeatureGrid({ features }: FeatureGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {features.map((feature) => {
        const Icon = feature.icon;
        return (
          <div
            key={feature.title}
            className="border-border bg-surface flex flex-col gap-3.5 rounded-[14px] border p-5"
          >
            <span className="bg-primary-soft/25 text-primary-deep flex h-[42px] w-[42px] items-center justify-center rounded-[21px]">
              <Icon size={21} aria-hidden="true" />
            </span>
            <h3 className="text-ink text-[15px] font-semibold">
              {feature.title}
            </h3>
            <p className="text-text-muted text-[12px] leading-[1.55]">
              {feature.description}
            </p>
          </div>
        );
      })}
    </div>
  );
}
