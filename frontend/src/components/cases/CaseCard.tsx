import Link from "next/link";
import { CoverImage } from "@/components/CoverImage";
import { ArrowRight, ImageIcon, MapPin, Factory } from "lucide-react";
import type { Case } from "@/lib/types";
import { HOME_COLORS } from "@/components/home/tokens";
import { metricsToEntries } from "./metrics";

// 實績卡片，沿用設計稿 News Card（node AzEGv）版型，內容改為實績欄位：
// 封面圖 → 分類 Tag + 地區/產業 → 標題 → 數據摘要（取前 2 筆 metrics）→「查看實績 →」。
// 整張卡可點擊，導向 /cases/[slug]。
export function CaseCard({ caseItem }: { caseItem: Case }) {
  const href = `/cases/${caseItem.slug}`;
  const cover = caseItem.images?.[0]?.url ?? null;
  const metrics = metricsToEntries(caseItem.metrics).slice(0, 2);

  return (
    <li className="border-border bg-surface flex flex-col overflow-hidden rounded-[14px] border">
      <Link href={href} className="group flex h-full flex-col">
        <div className="bg-surface-muted relative aspect-[380/210] w-full overflow-hidden">
          {cover ? (
            <CoverImage
              src={cover}
              alt={caseItem.images?.[0]?.alt ?? caseItem.title}
              sizes="(max-width: 768px) 100vw, 380px"
              className="transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <span
              className="flex h-full w-full items-center justify-center"
              style={{ backgroundColor: HOME_COLORS.chipMint }}
              aria-hidden="true"
            >
              <ImageIcon className="text-primary/40 h-8 w-8" />
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-3 p-[22px]">
          <div className="text-text-muted flex flex-wrap items-center gap-2.5 text-[11px]">
            <span
              className="inline-flex items-center rounded-[6px] px-2.5 py-1 text-[11px] font-semibold text-white"
              style={{ backgroundColor: "var(--color-primary)" }}
            >
              {caseItem.category}
            </span>
            {caseItem.region ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" aria-hidden="true" />
                {caseItem.region}
              </span>
            ) : null}
            {caseItem.industry ? (
              <span className="inline-flex items-center gap-1">
                <Factory className="h-3 w-3" aria-hidden="true" />
                {caseItem.industry}
              </span>
            ) : null}
          </div>

          <h3 className="text-ink group-hover:text-primary-deep text-[17px] leading-[1.4] font-semibold transition-colors">
            {caseItem.title}
          </h3>

          {metrics.length > 0 ? (
            <dl className="flex flex-wrap gap-x-5 gap-y-2">
              {metrics.map((m) => (
                <div key={m.key} className="flex flex-col">
                  <dt className="text-text-muted text-[11px]">{m.key}</dt>
                  <dd className="text-primary-deep font-mono text-[15px] font-semibold">
                    {m.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}

          <span className="text-primary-deep mt-auto inline-flex items-center gap-1.5 text-[13px] font-semibold">
            查看實績
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </Link>
    </li>
  );
}
