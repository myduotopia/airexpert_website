// ERP 表單／動作列的錯誤顯示（#240 B-08a）：前端檢核一次列出所有錯誤。
// 一條時與原本的紅框訊息相同；多條時以清單列出，標題說明共幾項。沒有錯誤時不渲染。
// 不含互動，server／client component 皆可用。
export function ErrorList({
  errors,
  className = "",
}: {
  errors: readonly string[];
  className?: string;
}) {
  if (errors.length === 0) return null;
  const box = `rounded-lg bg-red-50 px-4 py-3 text-[14px] text-red-700 ${className}`;
  if (errors.length === 1) {
    return (
      <p role="alert" className={box}>
        {errors[0]}
      </p>
    );
  }
  return (
    <div role="alert" className={box}>
      <p className="font-semibold">請修正以下 {errors.length} 項：</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {errors.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    </div>
  );
}
