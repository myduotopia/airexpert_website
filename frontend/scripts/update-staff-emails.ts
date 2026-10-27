// 一次性套用員工帳號登入 email（#265）：從本機 xlsx 讀「員工編號」與「Email」兩欄（以標題名稱找欄），
// 依員工編號找員工連結的 staff 帳號（employees.admin_profile_id），把登入 email 改成員工的個人 email。
// 比對與輸出邏輯在 src/lib/admin/staff-email-update.ts（有單元測試）。
//
// ⚠️ 本檔不含任何真實資料；檔案路徑、連線字串與金鑰都由執行者在本機提供。
// ⚠️ 輸出只有列號、員工編號、動作與「遮罩」email（例 t***@example.com），不印姓名與原始 email。
//
// 用法（在 frontend/ 目錄）：
//   DATABASE_URL='postgresql://postgres.<ref>:<密碼>@<pooler 主機>:5432/postgres' \
//     npx tsx scripts/update-staff-emails.ts --file <xlsx 路徑> [--sheet <工作表名稱或序號>]
//   確認乾跑結果無誤後，加上 Auth 的 service_role 金鑰並加 --apply：
//   SUPABASE_URL='https://<ref>.supabase.co' SUPABASE_KEY='<service_role key>' DATABASE_URL='…' \
//     npx tsx scripts/update-staff-emails.ts --file <xlsx 路徑> [--sheet …] --apply
//
//   預設為「乾跑」：讀 DB 快照 → 列出每位的動作（更新／略過（沒有 email、與目前相同）／錯誤與原因）→
//   以 hr_check_staff_email_change 逐筆再檢查一次（在交易內、ROLLBACK）。不呼叫 Auth、不寫入任何資料。
//   --apply：逐筆（不平行）
//     1. hr_check_staff_email_change（DB 檢查，取得 Auth 目前的 email）
//     2. GoTrue admin API 更新 email（email_confirm: true，不寄確認信）
//     3. hr_apply_staff_email_change（同步 admin_profiles.email、寫稽核 account_email_change）
//     4. 步驟 3 失敗 → 把 Auth email 改回步驟 1 的值
//   稽核的操作者為維運身分（DATABASE_URL 的 postgres；actor_id 為空，權限管理頁顯示「系統維運」），
//   與 #257 匯入腳本相同。重跑時已套用的列會顯示「與目前的登入 email 相同」而略過。
//
// 連線：DATABASE_URL 拆成 PGHOST／PGPORT／PGUSER／PGPASSWORD／PGDATABASE 交給 psql（密碼不出現在命令列）。
//   email 以 COPY FROM STDIN 傳進交易內暫存表（base64），不出現在 SQL 文字裡（語句出錯時 Postgres log 只記 SQL）。
//   psql 路徑：環境變數 PSQL，否則依序找 /opt/homebrew/opt/libpq/bin/psql、/usr/local/opt/libpq/bin/psql、psql。
//   Auth：直接以 fetch 呼叫 GoTrue（Node 20 沒有原生 WebSocket，supabase-js 的 createClient 會因 realtime 報錯）。
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import * as cptable from "xlsx/dist/cpexcel.full";
import { maskEmail, staffRpcError } from "../src/lib/admin/staff-accounts";
import {
  buildEmailUpdatePlan,
  findEmailColumns,
  formatPlanLine,
  gotrueUpdateEmail,
  summarizeEmailPlan,
  type EmailPlanRow,
  type StaffAccountSnapshot,
} from "../src/lib/admin/staff-email-update";
import { readWorkbook, type SheetData } from "../src/lib/employees/sheet";

XLSX.set_cptable(cptable);

interface Args {
  file: string;
  sheet: string | null;
  apply: boolean;
}

function usage(msg?: string): never {
  if (msg) console.error(`錯誤：${msg}\n`);
  console.error(
    "用法：DATABASE_URL=... npx tsx scripts/update-staff-emails.ts --file <xlsx 路徑> [--sheet <名稱或序號>]\n" +
      "      加 --apply 才寫入（另需 SUPABASE_URL 與 SUPABASE_KEY（service_role））",
  );
  process.exit(2);
}

function parseArgs(argv: string[]): Args {
  const a: Args = { file: "", sheet: null, apply: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) usage(`${k} 需要值`);
      return v;
    };
    if (k === "--file") a.file = next();
    else if (k === "--sheet") a.sheet = next();
    else if (k === "--apply") a.apply = true;
    else usage(`未知參數 ${k}`);
  }
  if (!a.file) usage("缺少 --file");
  return a;
}

function pickSheet(sheets: SheetData[], key: string | null): SheetData {
  if (key === null) {
    if (sheets.length === 0) usage("檔案沒有工作表");
    return sheets[0];
  }
  const byName = sheets.find((s) => s.name === key);
  if (byName) return byName;
  const n = Number(key);
  if (Number.isInteger(n) && n >= 1 && n <= sheets.length) return sheets[n - 1];
  usage(
    `找不到工作表「${key}」；可用：${sheets.map((s, i) => `${i + 1}=${s.name}`).join("、")}`,
  );
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
    PGAPPNAME: "staff-email-265",
  };
  env.PGSSLMODE = u.searchParams.get("sslmode") ?? env.PGSSLMODE ?? "require";
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
    throw new Error(`psql 失敗（exit ${r.status}）：${r.stderr.trim()}`);
  }
  return r.stdout;
}

/**
 * 在一個交易內執行 sql；payload（含 email）以 COPY FROM STDIN 放進暫存表，sql 以 PAYLOAD 取用（jsonb）。
 * try_check／try_apply：把 RPC 的例外轉成 jsonb（{ ok, … } / { ok:false, error }），單筆失敗不中斷交易。
 */
const PAYLOAD =
  "(select convert_from(decode(b64, 'base64'), 'UTF8')::jsonb from staff_email_payload)";

function psqlWithPayload(
  env: NodeJS.ProcessEnv,
  payload: unknown,
  sql: string,
  commit: boolean,
): string {
  return psql(
    env,
    [
      "begin;",
      "create temp table staff_email_payload (b64 text not null) on commit drop;",
      "copy staff_email_payload (b64) from stdin;",
      Buffer.from(JSON.stringify(payload), "utf8").toString("base64"),
      "\\.",
      `create function pg_temp.try_check(p_employee_id uuid, p_email text) returns jsonb
       language plpgsql as $f$
       declare r record;
       begin
         select * into r from hr_check_staff_email_change(p_employee_id, p_email);
         return jsonb_build_object('ok', true, 'user_id', r.user_id, 'auth_email', r.auth_email);
       exception when others then
         return jsonb_build_object('ok', false, 'error', sqlerrm);
       end $f$;`,
      `create function pg_temp.try_apply(p_employee_id uuid, p_email text) returns jsonb
       language plpgsql as $f$
       begin
         return jsonb_build_object('ok', true, 'user_id', hr_apply_staff_email_change(p_employee_id, p_email));
       exception when others then
         return jsonb_build_object('ok', false, 'error', sqlerrm);
       end $f$;`,
      sql,
      commit ? "commit;" : "rollback;",
    ].join("\n"),
  ).trim();
}

type CheckResult =
  | { ok: true; user_id: string; auth_email: string | null }
  | { ok: false; error: string };

type UpdateRow = Extract<EmailPlanRow, { action: "update" }>;

/** 逐筆以 hr_check_staff_email_change 檢查（交易 ROLLBACK，不寫入）。回傳與 rows 同順序。 */
function dbCheck(env: NodeJS.ProcessEnv, rows: UpdateRow[]): CheckResult[] {
  if (rows.length === 0) return [];
  const out = psqlWithPayload(
    env,
    rows.map((r) => ({ employee_id: r.employee_id, email: r.to })),
    `select coalesce(jsonb_agg(pg_temp.try_check((x->>'employee_id')::uuid, x->>'email') order by n), '[]'::jsonb)
       from jsonb_array_elements(${PAYLOAD}) with ordinality as t(x, n);`,
    false,
  );
  return JSON.parse(out) as CheckResult[];
}

function dbApply(
  env: NodeJS.ProcessEnv,
  row: UpdateRow,
): { ok: true; user_id: string } | { ok: false; error: string } {
  const out = psqlWithPayload(
    env,
    { employee_id: row.employee_id, email: row.to },
    `select pg_temp.try_apply((${PAYLOAD}->>'employee_id')::uuid, ${PAYLOAD}->>'email');`,
    true,
  );
  return JSON.parse(out) as
    | { ok: true; user_id: string }
    | { ok: false; error: string };
}

function loadSnapshot(env: NodeJS.ProcessEnv): {
  accounts: StaffAccountSnapshot[];
  taken: Map<string, string>;
} {
  const accounts = JSON.parse(
    psql(
      env,
      `select coalesce(json_agg(json_build_object(
          'employee_id', e.id, 'code', btrim(e.code), 'user_id', p.id, 'role', p.role,
          'auth_email', lower(u.email), 'profile_email', lower(p.email)) order by e.code), '[]'::json)
         from employees e
         left join admin_profiles p on p.id = e.admin_profile_id
         left join auth.users u on u.id = p.id
        where e.code is not null and btrim(e.code) <> '';`,
    ).trim(),
  ) as StaffAccountSnapshot[];
  // 其他帳號已使用的 email（只在記憶體內比對，不輸出）
  const pairs = JSON.parse(
    psql(
      env,
      `select coalesce(json_agg(json_build_array(lower(t.email), t.id)), '[]'::json)
         from (select email, id from auth.users where email is not null
               union all
               select email, id from admin_profiles where email is not null) t;`,
    ).trim(),
  ) as [string, string][];
  return { accounts, taken: new Map(pairs) };
}

async function applyRow(
  env: NodeJS.ProcessEnv,
  supabaseUrl: string,
  serviceKey: string,
  row: UpdateRow,
): Promise<string> {
  const [check] = dbCheck(env, [row]);
  if (!check?.ok) {
    return `錯誤：${staffRpcError({ message: check?.error }, "檢查失敗")}`;
  }
  if (check.user_id !== row.user_id) {
    return "錯誤：員工連結的帳號已變更，請重新乾跑確認";
  }
  const previous = check.auth_email;

  const auth = await gotrueUpdateEmail(
    fetch,
    supabaseUrl,
    serviceKey,
    row.user_id,
    row.to,
  );
  if (!auth.ok) {
    return auth.taken
      ? `錯誤：${staffRpcError({ message: "email_taken" })}`
      : `錯誤：Auth 更新失敗（${auth.error}），未變更`;
  }

  const applied = dbApply(env, row);
  if (applied.ok && applied.user_id === row.user_id) return "已更新";

  const reason = applied.ok
    ? "同步的帳號不符"
    : staffRpcError({ message: applied.error }, "同步失敗").replace(/。$/, "");
  const revert = previous
    ? await gotrueUpdateEmail(
        fetch,
        supabaseUrl,
        serviceKey,
        row.user_id,
        previous,
      )
    : ({ ok: false, taken: false, error: "沒有原本的 email" } as const);
  return revert.ok
    ? `錯誤：${reason}；Auth email 已改回 ${maskEmail(previous)}`
    : `錯誤：${reason}；Auth email 改回失敗（${revert.error}），登入帳號已是 ${maskEmail(row.to)}，請重跑 --apply 補齊`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.DATABASE_URL;
  if (!url)
    usage("請以環境變數 DATABASE_URL 提供連線字串（身分需為 postgres）");
  const supabaseUrl = process.env.SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_KEY ?? "";
  if (args.apply && (!supabaseUrl || !serviceKey)) {
    usage("--apply 需要環境變數 SUPABASE_URL 與 SUPABASE_KEY（service_role）");
  }
  const env = pgEnv(url);

  const sheets = readWorkbook(XLSX, new Uint8Array(readFileSync(args.file)));
  const sheet = pickSheet(sheets, args.sheet);
  const cols = findEmailColumns(sheet.grid);
  if (!cols.ok) usage(cols.error);
  console.log(
    `工作表「${sheet.name}」標題列第 ${cols.headerRow + 1} 列；員工編號 = 第 ${cols.codeCol + 1} 欄、Email = 第 ${cols.emailCol + 1} 欄（其他欄不讀）`,
  );

  const who = psql(
    env,
    "select session_user || '|' || coalesce(nullif(current_setting('role', true), 'none'), session_user);",
  ).trim();
  const [sessionUser, role] = who.split("|");
  console.log(`DB 身分：${sessionUser}（role ${role}）`);

  const { accounts, taken } = loadSnapshot(env);
  const plan = buildEmailUpdatePlan(sheet.grid, cols, accounts, taken);
  const s = summarizeEmailPlan(plan);
  console.log(`\n檔案 ${plan.length} 列：`);
  for (const r of plan) console.log("  " + formatPlanLine(r));
  console.log(`\n合計：更新 ${s.update}、略過 ${s.skip}、錯誤 ${s.error}`);

  const updates = plan.filter((r): r is UpdateRow => r.action === "update");
  if (updates.length === 0) {
    console.log("\n沒有需要更新的帳號。");
    return;
  }

  if (!args.apply) {
    const checks = dbCheck(env, updates);
    const failed = updates.flatMap((r, i) => {
      const c = checks[i];
      return c?.ok
        ? []
        : [{ r, error: staffRpcError({ message: c?.error }, "檢查失敗") }];
    });
    if (failed.length) {
      console.log("\nDB 檢查（hr_check_staff_email_change）未通過：");
      for (const f of failed) {
        console.log(
          `  第 ${String(f.r.line).padStart(3)} 列  ${f.r.code}  ${f.error}`,
        );
      }
    } else {
      console.log(
        `\nDB 檢查（hr_check_staff_email_change）：${updates.length} 筆皆通過。`,
      );
    }
    console.log(
      "\n乾跑完成：沒有呼叫 Auth，DB 沒有任何變更。確認無誤後加上 SUPABASE_URL、SUPABASE_KEY 並加 --apply。",
    );
    return;
  }

  console.log("\n套用（逐筆）：");
  let failures = 0;
  for (const r of updates) {
    const result = await applyRow(env, supabaseUrl, serviceKey, r);
    if (result !== "已更新") failures++;
    console.log(
      `  第 ${String(r.line).padStart(3)} 列  ${r.code.padEnd(6)}  ${maskEmail(r.to)}  ${result}`,
    );
  }
  console.log(
    `\n完成：已更新 ${updates.length - failures}、失敗 ${failures}。可重跑本指令（不加 --apply）確認結果為「與目前的登入 email 相同」。`,
  );
  if (failures > 0) process.exit(1);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
