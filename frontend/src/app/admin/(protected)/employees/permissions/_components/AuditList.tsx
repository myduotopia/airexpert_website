import { DataTable } from "@/components/admin/DataTable";
import { MODULE_LABELS } from "@/lib/admin/staff-accounts";
import type { AccessAuditRow } from "@/lib/employees/permissions";

// login_disable／login_enable：動作碼沿用 #261（DB check 約束與既有紀錄不變），#263 起顯示為停用／啟用帳號。
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  account_create: "建立帳號",
  password_reset: "重設為預設密碼",
  password_change: "本人變更密碼",
  login_disable: "停用帳號",
  login_enable: "啟用帳號",
  position_create: "新增職位",
  position_update: "修改職位",
  position_delete: "刪除職位",
  position_permission_grant: "職位加入權限",
  position_permission_revoke: "職位移除權限",
  employee_position_change: "變更員工職位",
  account_link: "連結帳號",
  account_unlink: "解除帳號連結",
  account_email_change: "修改登入 email",
};

const DATE_FMT = new Intl.DateTimeFormat("zh-TW", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Taipei",
});

function str(v: unknown): string {
  return typeof v === "string" && v ? v : "";
}

function moduleLabel(v: unknown): string {
  const s = str(v);
  return (MODULE_LABELS as Record<string, string>)[s] ?? s;
}

/** 紀錄內容（detail jsonb）→ 一行說明。 */
export function auditSummary(row: AccessAuditRow): string {
  const d = row.detail ?? {};
  switch (row.action) {
    case "account_create": {
      // 0033 起 detail.login_disabled = 建立當下 Auth 是否已停用（DB 讀 auth.users.banned_until）。
      const who = [str(d.employee_name), str(d.email)]
        .filter(Boolean)
        .join(" ");
      return d.login_disabled === true ? `${who}（建立時已停用）` : who;
    }
    case "password_reset":
    case "login_disable":
    case "login_enable":
      return [str(d.employee_name), str(d.email)].filter(Boolean).join(" ");
    case "position_create":
    case "position_delete":
      return str(d.name);
    case "position_update": {
      const o = (d.old ?? {}) as Record<string, unknown>;
      const n = (d.new ?? {}) as Record<string, unknown>;
      const parts: string[] = [];
      if (o.name !== n.name) parts.push(`${str(o.name)} → ${str(n.name)}`);
      else parts.push(str(n.name));
      if (o.active !== n.active) parts.push(n.active ? "啟用" : "停用");
      if (o.description !== n.description) parts.push("修改說明");
      return parts.join("，");
    }
    case "position_permission_grant":
    case "position_permission_revoke":
      return `${str(d.position_name) || "（已刪除的職位）"}：${moduleLabel(d.module)}`;
    case "employee_position_change":
      return `${str(d.employee_name)}：${str(d.from_name) || "未指派"} → ${str(d.to_name) || "未指派"}`;
    case "account_email_change":
      // 0034：舊／新 email 只存遮罩形式（例 t***@example.com）。
      return `${str(d.employee_name)}：${str(d.from_email) || "—"} → ${str(d.to_email) || "—"}`;
    case "account_link":
    case "account_unlink":
      return `${str(d.employee_name)}：${str(d.from_email) || (d.from ? "（已刪除的帳號）" : "未連結")} → ${str(d.to_email) || "未連結"}`;
    default:
      return "";
  }
}

// 稽核紀錄（最近 100 筆；資料表不可改刪）。
export function AuditList({ rows }: { rows: AccessAuditRow[] }) {
  return (
    <DataTable
      rows={rows}
      getKey={(r) => String(r.id)}
      empty="尚無紀錄。"
      columns={[
        {
          header: "時間",
          cell: (r) => (
            <span className="font-mono text-[13px] whitespace-nowrap">
              {DATE_FMT.format(new Date(r.at))}
            </span>
          ),
        },
        {
          header: "操作者",
          cell: (r) => (
            <span className="text-[13px]">
              {r.actor_email ??
                (r.actor_role === "authenticated" ? "—" : "系統維運")}
            </span>
          ),
        },
        {
          header: "動作",
          cell: (r) => AUDIT_ACTION_LABELS[r.action] ?? r.action,
        },
        { header: "內容", cell: (r) => auditSummary(r) },
      ]}
    />
  );
}
