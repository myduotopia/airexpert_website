import {
  ClipboardList,
  Cpu,
  HardHat,
  CalendarCheck,
  Headset,
  HeartHandshake,
  type LucideIcon,
} from "lucide-react";
import { HOME_SERVICE_STEPS } from "@/components/home/content";
import { Reveal } from "@/components/home/scrollAnimate";

// Service — 服務流程 5 步驟時間軸。淺綠底，brass 連接線 + 金色 chip 點綴。
const STEP_ICONS: Record<string, LucideIcon> = {
  "clipboard-list": ClipboardList,
  cpu: Cpu,
  "hard-hat": HardHat,
  "calendar-check": CalendarCheck,
  headset: Headset,
};

export function ServiceProcess() {
  const steps = HOME_SERVICE_STEPS;
  return (
    <section className="border-border bg-surface-muted border-b">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-12 px-6 py-16 md:px-20 md:py-[72px]">
        <Reveal className="flex flex-col items-center gap-3 text-center">
          <p className="text-primary-deep font-mono text-[12px] tracking-[1px] uppercase">
            SERVICES · 一站式服務
          </p>
          <h2 className="text-ink max-w-[820px] text-[26px] font-extrabold sm:text-[34px]">
            節能升級，從第一步開始，打造一站式氣體解決方案
          </h2>
          <p className="text-text-muted max-w-[640px] text-[16px]">
            設備買了之後，安裝、施工、定期保養到維修，全部我們負責。
          </p>
        </Reveal>

        <Reveal delay={120}>
          <ol className="grid grid-cols-2 gap-x-4 gap-y-10 md:flex md:gap-0">
            {steps.map((step, i) => {
              const Icon = STEP_ICONS[step.icon] ?? ClipboardList;
              const brassBadge = i >= 3;
              const num = String(i + 1).padStart(2, "0");
              return (
                <li
                  key={step.title}
                  className="flex flex-1 flex-col items-center gap-4 text-center"
                >
                  {/* connector（僅桌面顯示）：brass 細線 + 編號徽章 */}
                  <div className="hidden w-full items-center md:flex">
                    <span
                      className={`bg-brass h-0.5 flex-1 ${i === 0 ? "opacity-0" : ""}`}
                    />
                    <span
                      className={`flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full font-mono text-[13px] font-bold text-white ${
                        brassBadge ? "bg-brass" : "bg-ink"
                      }`}
                    >
                      {num}
                    </span>
                    <span
                      className={`bg-brass h-0.5 flex-1 ${
                        i === steps.length - 1 ? "opacity-0" : ""
                      }`}
                    />
                  </div>
                  <span className="bg-primary-soft/15 flex h-[50px] w-[50px] items-center justify-center rounded-full">
                    <Icon
                      size={24}
                      className="text-primary"
                      aria-hidden="true"
                    />
                  </span>
                  <h3 className="text-ink text-[17px] font-bold">
                    {step.title}
                  </h3>
                  <span className="bg-brass-soft text-ink rounded-[20px] px-3 py-[5px] font-mono text-[12px] font-bold">
                    {step.chip}
                  </span>
                </li>
              );
            })}
          </ol>
        </Reveal>

        <Reveal delay={200} className="flex justify-center md:justify-end">
          <div className="border-brass flex w-full max-w-[520px] items-center justify-center gap-2 border-t-2 pt-3.5">
            <HeartHandshake
              size={18}
              className="text-primary-deep"
              aria-hidden="true"
            />
            <span className="text-primary-deep text-[15px] font-semibold">
              一次成交永續服務
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
