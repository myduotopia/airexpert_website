// 一次性批次同步廠商提醒規則（#274）：重新解析全部廠商的備註與付款條件，新增／更新／停用 auto 提醒規則
// （不動手動規則）。解析與同步計畫在 src/lib/erp/reminders/（parse-note.ts、sync.ts，有單元測試），
// 套用走 RPC erp_apply_reminder_sync（0040，單一交易）。與後台「提醒事項 › 全部規則 › 從廠商備註重新解析」
// 結果相同；匯入廠商（#273）後若不方便登入後台，可改用本腳本執行一次。
//
// ⚠️ 本檔不含任何真實資料；連線字串由執行者在本機提供。
// ⚠️ 輸出只有筆數，不印任何廠商名稱、編號或備註內容。
//
// 用法（在 frontend/ 目錄）：
//   DATABASE_URL='postgresql://postgres.<ref>:<密碼>@<pooler 主機>:5432/postgres' \
//     npx tsx scripts/sync-vendor-reminders.ts [--apply]
//
//   預設為「乾跑」：讀廠商與既有規則 → 印出統計（新增、重新啟用、更新原文、停用、待確認片段數）→
//   在交易內實際呼叫 RPC 後 ROLLBACK，DB 不留任何變更。確認無誤再加 --apply（COMMIT）。
//   可重跑：第二次執行應為「沒有需要寫入的變更」。新規則的起算日為今天（台灣日期），不會冒出過去的逾期。
//
// 前置：0040_erp_reminders.sql 須已套用。
//
// 連線：DATABASE_URL 拆成 PGHOST／PGPORT／PGUSER／PGPASSWORD／PGDATABASE 環境變數交給 psql（密碼不出現在命令列）；
//   本機 Docker 測試請在 URL 加 ?sslmode=disable。同步計畫以 COPY FROM STDIN 進交易內暫存表（base64 JSON），
//   不出現在 SQL 文字裡（同 scripts/import-customers.ts）。
//   psql 路徑：環境變數 PSQL，否則依序找 /opt/homebrew/opt/libpq/bin/psql、/usr/local/opt/libpq/bin/psql、psql。
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { parseReminderText } from "../src/lib/erp/reminders/parse-note";
import {
  SYNC_RULE_COLUMNS,
  isEmptySyncPlan,
  planVendorReminderSync,
  type ExistingReminderRule,
  type VendorNoteInput,
} from "../src/lib/erp/reminders/sync";
import { taipeiToday } from "../src/lib/erp/statement";

function usage(msg?: string): never {
  if (msg) console.error(`錯誤：${msg}\n`);
  console.error(
    "用法：DATABASE_URL=... npx tsx scripts/sync-vendor-reminders.ts [--apply]",
  );
  process.exit(2);
}

function parseArgs(argv: string[]): { apply: boolean } {
  const a = { apply: false };
  for (const k of argv) {
    if (k === "--apply") a.apply = true;
    else usage(`未知參數 ${k}`);
  }
  return a;
}

function findPsql(): string {
  if (process.env.PSQL) return process.env.PSQL;
  for (const p of [
    "/opt/homebrew/opt/libpq/bin/psql",
    "/usr/local/opt/libpq/bin/psql",
  ]) {
    if (existsSync(p)) return p;
  }
  return "psql";
}

/** DATABASE_URL → libpq 環境變數（密碼不進命令列）。 */
function pgEnv(url: string): NodeJS.ProcessEnv {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    usage("DATABASE_URL 格式不正確");
  }
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.replace(/^\//, "")) || "postgres",
    PGAPPNAME: "vendor-reminders-274",
  };
  const ssl = u.searchParams.get("sslmode");
  env.PGSSLMODE = ssl ?? env.PGSSLMODE ?? "require";
  return env;
}

function psql(env: NodeJS.ProcessEnv, sql: string): string {
  const r = spawnSync(
    findPsql(),
    ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"],
    { env, input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (r.error) throw new Error(`無法執行 psql：${r.error.message}`);
  if (r.status !== 0) {
    // stderr 可能含 DETAIL（會帶出值）→ 只印第一行錯誤訊息。
    const first = r.stderr.trim().split("\n")[0] ?? "";
    throw new Error(`psql 失敗（exit ${r.status}）：${first}`);
  }
  return r.stdout;
}

function buildSql(
  plan: { insert: unknown[]; update: unknown[] },
  commit: boolean,
) {
  const b64 = Buffer.from(
    JSON.stringify({ insert: plan.insert, update: plan.update }),
    "utf8",
  ).toString("base64");
  return [
    "begin;",
    "create temp table reminder_sync_payload (b64 text not null) on commit drop;",
    "copy reminder_sync_payload (b64) from stdin;",
    b64,
    "\\.",
    "select erp_apply_reminder_sync((select convert_from(decode(b64, 'base64'), 'UTF8')::jsonb from reminder_sync_payload));",
    "select 'rules=' || count(*) || ' auto=' || count(*) filter (where source = 'auto')" +
      " || ' auto_active=' || count(*) filter (where source = 'auto' and active) from erp_reminder_rules;",
    commit ? "commit;" : "rollback;",
  ].join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.DATABASE_URL;
  if (!url)
    usage("請以環境變數 DATABASE_URL 提供連線字串（身分需為 postgres）");
  const env = pgEnv(url);

  const who = psql(
    env,
    "select session_user || '|' || (to_regclass('public.erp_reminder_rules') is not null)::text" +
      " || '|' || (to_regprocedure('public.erp_apply_reminder_sync(jsonb)') is not null)::text;",
  ).trim();
  const [sessionUser, hasTable, hasRpc] = who.split("|");
  console.log(`DB 身分：${sessionUser}`);
  if (hasTable !== "true" || hasRpc !== "true") {
    console.error("提醒事項資料表不存在：請先套用 0040_erp_reminders.sql。");
    process.exit(1);
  }

  const vendors = JSON.parse(
    psql(
      env,
      "select coalesce(json_agg(json_build_object('id', id, 'note', note, 'payment_terms', payment_terms)" +
        " order by id), '[]'::json) from erp_vendors;",
    ).trim(),
  ) as VendorNoteInput[];
  const existing = JSON.parse(
    psql(
      env,
      `select coalesce(json_agg(r order by r.id), '[]'::json) from (select ${SYNC_RULE_COLUMNS}` +
        " from erp_reminder_rules where vendor_id is not null) r;",
    ).trim(),
  ) as ExistingReminderRule[];

  const today = taipeiToday();
  const plan = planVendorReminderSync(vendors, existing, today);
  let withRules = 0;
  let pendingVendors = 0;
  let pendingFragments = 0;
  for (const v of vendors) {
    const r = parseReminderText(v.note, v.payment_terms);
    if (r.rules.length > 0) withRules += 1;
    if (r.unparsed.length > 0) {
      pendingVendors += 1;
      pendingFragments += r.unparsed.length;
    }
  }
  const reactivate = plan.update.filter((u) => u.active && !u.auto_missing);
  const deactivate = plan.update.filter((u) => u.auto_missing);
  const before = new Map(existing.map((e) => [e.id, e]));
  const reactivated = reactivate.filter((u) => before.get(u.id)?.auto_missing);

  console.log(
    `\n今天（台灣）${today}；廠商 ${vendors.length} 家，其中 ${withRules} 家的備註／付款條件解析出固定日期。`,
  );
  console.log(`既有規則（有對象）${existing.length} 條。`);
  console.log(`  新增 auto 規則 ${plan.insert.length}`);
  console.log(`  重新啟用（備註再次出現）${reactivated.length}`);
  console.log(
    `  更新原文 ${plan.update.length - deactivate.length - reactivated.length}`,
  );
  console.log(`  停用（備註已無此項）${deactivate.length}`);
  console.log(
    `  待確認（疑似日期但無法解析）：${pendingVendors} 家、${pendingFragments} 段（請到後台「提醒事項 › 待確認」查看）`,
  );

  if (isEmptySyncPlan(plan)) {
    console.log("\n沒有需要寫入的變更。");
    return;
  }
  const out = psql(env, buildSql(plan, args.apply)).trim();
  console.log(`\n${out.split("\n").join("；")}`);
  console.log(
    args.apply
      ? "\n已寫入（COMMIT）。可重跑本指令確認結果為「沒有需要寫入的變更」。"
      : "\n乾跑完成：上述寫入已在交易內執行並 ROLLBACK，DB 沒有任何變更。確認無誤後加 --apply。",
  );
}

try {
  main();
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
