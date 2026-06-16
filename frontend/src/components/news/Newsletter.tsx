// 電子報訂閱橫幅，對應設計稿 Newsletter（node QuIZG）：主綠底，左文案、右輸入框＋深墨按鈕。
// 訂閱後端串接屬後續工作；此處先以可運作的視覺呈現（送出為前端 noop placeholder）。
export function Newsletter() {
  return (
    <section className="bg-primary">
      <div className="mx-auto flex max-w-[1440px] flex-col items-start justify-between gap-8 px-6 py-14 md:flex-row md:items-center md:px-20">
        <div className="flex max-w-[640px] flex-col gap-2.5">
          <h2 className="text-[30px] leading-[1.2] font-bold text-white">
            訂閱永續技術電子報
          </h2>
          <p className="text-[15px] leading-[1.6] text-[#E3F1E8]">
            每月精選節能案例、技術專文與產業趨勢，直送您的信箱。
          </p>
        </div>

        <form
          className="flex w-full items-center gap-2.5 md:w-auto"
          aria-label="訂閱電子報"
        >
          <input
            type="email"
            name="email"
            required
            placeholder="輸入您的 Email"
            className="text-ink h-[52px] w-full rounded-[26px] bg-white px-[18px] text-[14px] outline-none md:w-[280px]"
          />
          <button
            type="submit"
            className="bg-ink h-[52px] shrink-0 rounded-[26px] px-[26px] text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            訂閱
          </button>
        </form>
      </div>
    </section>
  );
}
