import type { Metadata } from "next";
import { getPublishedCases, getCasesByCategory } from "@/lib/data";
import {
  CASE_CATEGORIES,
  CASE_FILTER_ALL,
  type CaseCategory,
} from "@/components/cases/constants";
import { FilterRow } from "@/components/cases/FilterRow";
import { CaseCard } from "@/components/cases/CaseCard";

export const metadata: Metadata = {
  title: "節能實績",
  description:
    "從空壓機到乾燥機，實地節能改善案例與量化成效，見證每一度電的價值。",
};

function isValidCategory(value: string): value is CaseCategory {
  return (CASE_CATEGORIES as readonly string[]).includes(value);
}

export default async function CasesPage({
  searchParams,
}: {
  // Next.js 16：searchParams 為非同步。
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const active =
    category && isValidCategory(category) ? category : CASE_FILTER_ALL;

  const cases =
    active === CASE_FILTER_ALL
      ? await getPublishedCases()
      : await getCasesByCategory(active);

  return (
    <>
      {/* Hero（node JH7IC） */}
      <section className="bg-surface-muted border-border border-b">
        <div className="mx-auto flex max-w-[1440px] flex-col items-center gap-5 px-6 pt-16 pb-10 text-center md:px-20 md:pt-[72px]">
          <p className="text-primary-deep font-mono text-[12px] tracking-[1px] uppercase">
            ENERGY-SAVING CASES
          </p>
          <h1 className="text-ink text-[40px] leading-[1.1] font-bold sm:text-[52px]">
            節能實績
          </h1>
          <p className="text-text-muted max-w-[620px] text-[16px] leading-[1.6]">
            從空壓機到乾燥機，實地節能改善案例與量化成效，見證每一度電的價值。
          </p>
        </div>
      </section>

      {/* FilterRow（node R09KFm） */}
      <section className="bg-surface border-border border-b">
        <div className="mx-auto max-w-[1440px] px-6 py-6 md:px-20">
          <FilterRow active={active} />
        </div>
      </section>

      {/* CaseGrid（node JVbw7） */}
      <section className="bg-surface">
        <div className="mx-auto max-w-[1440px] px-6 pt-8 pb-12 md:px-20">
          {cases.length === 0 ? (
            <p className="text-text-muted py-16 text-center text-[15px]">
              {active === CASE_FILTER_ALL
                ? "目前尚無實績案例，敬請期待。"
                : `「${active}」分類目前尚無實績案例。`}
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {cases.map((caseItem) => (
                <CaseCard key={caseItem.id} caseItem={caseItem} />
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
