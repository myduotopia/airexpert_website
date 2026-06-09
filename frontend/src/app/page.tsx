// Minimal placeholder confirming the layout shell renders.
// The real Home page sections are built in issue #5.
export default function Home() {
  return (
    <section className="mx-auto flex max-w-[1440px] flex-col items-center justify-center gap-4 px-6 py-32 text-center md:px-20">
      <p className="text-text-muted font-mono text-[10px] tracking-[0.5px] uppercase">
        V3.08 Eco Green Light
      </p>
      <h1 className="text-ink text-3xl font-bold sm:text-4xl">
        超勁賀空壓科技 AirExpert
      </h1>
      <p className="text-text-muted max-w-md text-[15px] leading-[1.6]">
        版型外殼與設計系統已就緒。首頁內容將於後續 issue 建置。
      </p>
    </section>
  );
}
