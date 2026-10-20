// 敏感資料存取紀錄（hr 才會渲染；資料由 RLS 限制只有 hr 讀得到）。
import {
  ACCESS_ACTION_LABELS,
  PRIVATE_FIELD_LABELS,
  isPrivateField,
  type PrivateAccessLog,
} from "@/lib/employees/private";

const AT_FMT = new Intl.DateTimeFormat("zh-TW", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Taipei",
});

export function PrivateAccessLogList({ logs }: { logs: PrivateAccessLog[] }) {
  if (logs.length === 0) {
    return <p className="text-text-muted text-[13px]">尚無紀錄。</p>;
  }
  return (
    <ul className="divide-border divide-y text-[13px]">
      {logs.map((l) => (
        <li key={l.id} className="flex flex-wrap gap-x-4 gap-y-1 py-1.5">
          <span className="text-text-muted font-mono whitespace-nowrap">
            {AT_FMT.format(new Date(l.at))}
          </span>
          <span className="text-ink">
            {l.actor_email ?? (l.actor_role === "postgres" ? "系統匯入" : "—")}
          </span>
          <span className="text-ink">
            {ACCESS_ACTION_LABELS[l.action] ?? l.action}
            {isPrivateField(l.field) ? PRIVATE_FIELD_LABELS[l.field] : l.field}
          </span>
        </li>
      ))}
    </ul>
  );
}
