// 就地新增（#218）的選項狀態：server 傳入的 options + 本頁新增的項目（依 id 去重）。
// 父層重新傳入 options（例如 revalidate 後重新渲染）時，新增項不會被洗掉。
import { useCallback, useMemo, useState } from "react";
import { mergeOptions } from "@/lib/erp/quick-create";

export function useAddedOptions<T extends { id: string }>(
  base: T[],
): [options: T[], add: (option: T) => void] {
  const [added, setAdded] = useState<T[]>([]);
  const options = useMemo(() => mergeOptions(base, added), [base, added]);
  const add = useCallback(
    (option: T) => setAdded((prev) => mergeOptions(prev, [option])),
    [],
  );
  return [options, add];
}
