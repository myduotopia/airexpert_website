import type { ReactNode } from "react";

export type NumberedStep = {
  /** Step title (the leading number is rendered separately). */
  title: string;
  /** Body copy; string or rich nodes (e.g. nested lists, highlights). */
  body: ReactNode;
};

type NumberedStepsProps = {
  steps: NumberedStep[];
  /** Heading level for each step title (default `h3`). */
  titleAs?: "h3" | "h4";
};

/**
 * Vertical numbered timeline of steps/sections. Each item shows a green
 * numbered chip, a title and body copy. Used for the 節能方案 3-step process
 * and the 機房規劃 5 numbered sections.
 */
export function NumberedSteps({
  steps,
  titleAs: Tag = "h3",
}: NumberedStepsProps) {
  return (
    <ol className="flex flex-col gap-5">
      {steps.map((step, index) => (
        <li
          key={step.title}
          className="border-border bg-surface flex flex-col gap-3 rounded-[14px] border p-6 sm:flex-row sm:gap-5"
        >
          <span
            className="bg-primary-soft/25 text-primary-deep flex h-10 w-10 shrink-0 items-center justify-center rounded-[20px] font-mono text-[17px] font-bold"
            aria-hidden="true"
          >
            {String(index + 1).padStart(2, "0")}
          </span>
          <div className="flex flex-col gap-2">
            <Tag className="text-ink text-[18px] font-semibold sm:text-[19px]">
              {step.title}
            </Tag>
            <div className="text-text-muted text-[16px] leading-[1.7]">
              {step.body}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
