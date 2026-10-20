// 一次性員工匯入（#257）：從本機 xls／xlsx／csv 讀取，沿用後台匯入頁的同一套解析與比對邏輯
// （src/lib/employees/import.ts），以維運身分（postgres）寫入正式 DB，含敏感欄位（加密）。
//
// ⚠️ 本檔不含任何真實資料；檔案路徑與連線字串都由執行者在本機提供。
// ⚠️ 輸出含員工姓名（加 --hide-names 可遮罩），請勿貼到 issue／PR 等公開處。敏感欄位只印遮罩值。
//
// 用法（在 frontend/ 目錄）：
//   DATABASE_URL='postgresql://postgres.<ref>:<密碼>@<pooler 主機>:5432/postgres' \
//     npx tsx scripts/import-employees.ts --file <檔案路徑> --sheet <工作表名稱或序號> \
//       [--status keep|active|inactive|compare] [--compare-sheet <工作表名稱或序號>] \
//       [--header-row <列號>] [--no-private] [--hide-names] [--apply]
//
//   預設為「乾跑」：讀取 DB 現有員工 → 印出預覽（新增／更新／不變／略過與原因）→ 在交易內實際執行
//   全部寫入（含加密與約束檢查）後 ROLLBACK，DB 不留任何變更。確認無誤再加 --apply（單一交易 COMMIT）。
//
//   #257 的情境（工作表 A = 在職、B = 全部）：
//     npx tsx scripts/import-employees.ts --file <路徑> --sheet B --status compare --compare-sheet A
//
// 連線：DATABASE_URL 會拆成 PGHOST／PGPORT／PGUSER／PGPASSWORD／PGDATABASE 環境變數交給 psql
// （密碼不出現在命令列參數）；SQL（含敏感資料）經 stdin 傳給 psql，不寫入任何檔案。
// psql 路徑：環境變數 PSQL，否則依序找 /opt/homebrew/opt/libpq/bin/psql、/usr/local/opt/libpq/bin/psql、psql。
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import * as cptable from "xlsx/dist/cpexcel.full";
import {
  PLAN_ACTION_LABELS,
  buildImportPlan,
  collectSheetKeys,
  defaultMapping,
  detectHeaderRow,
  mappingError,
  parseRows,
  planToOps,
  stripPrivate,
  summarizePlan,
  type ExistingEmployee,
  type ImportStatusMode,
  type PlanRow,
} from "../src/lib/employees/import";
import { employeeRolesText } from "../src/lib/employees/normalize";
import {
  PRIVATE_FIELDS,
  PRIVATE_FIELD_LABELS,
  maskPrivateValue,
} from "../src/lib/employees/private";
import { taipeiToday } from "../src/lib/employees/status";
import { readWorkbook, type SheetData } from "../src/lib/employees/sheet";

XLSX.set_cptable(cptable);

interface Args {
  file: string;
  sheet: string;
  status: ImportStatusMode;
  compareSheet: string | null;
  headerRow: number | null;
  apply: boolean;
  noPrivate: boolean;
  hideNames: boolean;
}

function usage(msg?: string): never {
  if (msg) console.error(`錯誤：${msg}\n`);
  console.error(
    "用法：DATABASE_URL=... npx tsx scripts/import-employees.ts --file <路徑> --sheet <名稱或序號>\n" +
      "        [--status keep|active|inactive|compare] [--compare-sheet <名稱或序號>]\n" +
      "        [--header-row <列號>] [--no-private] [--hide-names] [--apply]",
  );
  process.exit(2);
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    file: "",
    sheet: "",
    status: "keep",
    compareSheet: null,
    headerRow: null,
    apply: false,
    noPrivate: false,
    hideNames: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) usage(`${k} 需要值`);
      return v;
    };
    if (k === "--file") a.file = next();
    else if (k === "--sheet") a.sheet = next();
    else if (k === "--compare-sheet") a.compareSheet = next();
    else if (k === "--header-row") a.headerRow = Number(next());
    else if (k === "--status") {
      const s = next();
      if (!["keep", "active", "inactive", "compare"].includes(s)) {
        usage(`--status 不接受 ${s}`);
      }
      a.status = s as ImportStatusMode;
    } else if (k === "--apply") a.apply = true;
    else if (k === "--no-private") a.noPrivate = true;
    else if (k === "--hide-names") a.hideNames = true;
    else usage(`未知參數 ${k}`);
  }
  if (!a.file) usage("缺少 --file");
  if (!a.sheet) usage("缺少 --sheet");
  if (a.status === "compare" && !a.compareSheet) {
    usage("--status compare 需要 --compare-sheet");
  }
  return a;
}

function pickSheet(sheets: SheetData[], key: string): SheetData {
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
    PGAPPNAME: "employee-import-257",
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
    throw new Error(`psql 失敗（exit ${r.status}）：${r.stderr.trim()}`);
  }
  return r.stdout;
}

/** 以隨機 tag 做 dollar quoting（內容不可能含此 tag，否則重抽）。 */
function dollar(text: string): string {
  for (;;) {
    const tag = `$emp_${randomBytes(6).toString("hex")}$`;
    if (!text.includes(tag)) return `${tag}${text}${tag}`;
  }
}

function hideName(name: string, hide: boolean): string {
  if (!hide || !name) return name;
  const chars = [...name];
  return chars[0] + "＊".repeat(Math.max(1, chars.length - 1));
}

function describe(r: PlanRow, hide: boolean): string {
  const priv = PRIVATE_FIELDS.filter((f) => r.private[f])
    .map(
      (f) => `${PRIVATE_FIELD_LABELS[f]}=${maskPrivateValue(f, r.private[f])}`,
    )
    .join(", ");
  const notes = [
    r.reason,
    r.matchedBy === "code"
      ? "依編號對到"
      : r.matchedBy === "name"
        ? "依姓名對到"
        : null,
    r.noRole && r.action !== "skip" ? "無角色" : null,
    r.privateDropped ? "敏感欄位未匯入" : null,
    ...r.warnings,
    Object.keys(r.patch).length && r.action === "update"
      ? `變更：${Object.keys(r.patch).join(",")}`
      : null,
  ].filter(Boolean);
  return [
    `第 ${String(r.line).padStart(3)} 列`,
    PLAN_ACTION_LABELS[r.action].padEnd(2, "　"),
    (r.code ?? "—").padEnd(5),
    hideName(r.name, hide) || "—",
    `${r.title ?? "—"}→${employeeRolesText(r.roles) || "無角色"}`,
    r.active === null ? "—" : r.active ? "在職" : "離職",
    priv ? `[${priv}]` : "",
    notes.length ? `（${notes.join("；")}）` : "",
  ]
    .filter(Boolean)
    .join("  ");
}

function buildSql(ops: ReturnType<typeof planToOps>, commit: boolean): string {
  const lines: string[] = ["begin;"];
  if (ops.inserts.length > 0) {
    lines.push(`
insert into employees (id, code, name, roles, active, title, phone, hired_on, left_on)
select (x->>'id')::uuid, x->>'code', x->>'name',
       array(select jsonb_array_elements_text(coalesce(x->'roles', '[]'::jsonb))),
       coalesce((x->>'active')::boolean, true), x->>'title', x->>'phone',
       (x->>'hired_on')::date, (x->>'left_on')::date
  from jsonb_array_elements(${dollar(JSON.stringify(ops.inserts))}::jsonb) x;`);
  }
  if (ops.updates.length > 0) {
    lines.push(`
update employees e set
  code     = case when u.p ? 'code'     then u.p->>'code'               else e.code     end,
  name     = case when u.p ? 'name'     then u.p->>'name'               else e.name     end,
  roles    = case when u.p ? 'roles'    then array(select jsonb_array_elements_text(u.p->'roles')) else e.roles end,
  active   = case when u.p ? 'active'   then (u.p->>'active')::boolean  else e.active   end,
  title    = case when u.p ? 'title'    then u.p->>'title'              else e.title    end,
  phone    = case when u.p ? 'phone'    then u.p->>'phone'              else e.phone    end,
  hired_on = case when u.p ? 'hired_on' then (u.p->>'hired_on')::date   else e.hired_on end,
  left_on  = case when u.p ? 'left_on'  then (u.p->>'left_on')::date    else e.left_on  end
  from (select (x->>'id')::uuid as id, x->'patch' as p
          from jsonb_array_elements(${dollar(JSON.stringify(ops.updates))}::jsonb) x) u
 where e.id = u.id;`);
  }
  if (ops.private.length > 0) {
    lines.push(
      `select 'private=' || hr_import_employee_private(${dollar(JSON.stringify(ops.private))}::jsonb)::text;`,
    );
  }
  lines.push(
    `select 'employees=' || count(*) || ' active=' || count(*) filter (where active) from employees;`,
  );
  lines.push(commit ? "commit;" : "rollback;");
  return lines.join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.DATABASE_URL;
  if (!url)
    usage("請以環境變數 DATABASE_URL 提供連線字串（身分需為 postgres）");
  const env = pgEnv(url);

  const sheets = readWorkbook(XLSX, new Uint8Array(readFileSync(args.file)));
  const sheet = pickSheet(sheets, args.sheet);
  const header =
    args.headerRow !== null ? args.headerRow - 1 : detectHeaderRow(sheet.grid);
  if (header < 0 || header >= sheet.grid.length) {
    usage("找不到含「員工編號」的標題列，請以 --header-row 指定");
  }
  const mapping = defaultMapping(sheet.grid[header] ?? []);
  const mapErr = mappingError(mapping);
  if (mapErr) usage(mapErr);
  console.log(
    `工作表「${sheet.name}」標題列第 ${header + 1} 列；欄位對應：` +
      (sheet.grid[header] ?? [])
        .map((h, i) => `${h || `第${i + 1}欄`}→${mapping[i] ?? "不匯入"}`)
        .join("、"),
  );

  let compareKeys = null;
  if (args.status === "compare" && args.compareSheet) {
    compareKeys = collectSheetKeys(pickSheet(sheets, args.compareSheet).grid);
    if (!compareKeys) usage("比對用的工作表找不到含「員工編號」的標題列");
  }

  // 連線確認：身分、金鑰是否存在（不印金鑰）
  const who = psql(
    env,
    `select session_user || '|' || coalesce(nullif(current_setting('role', true), 'none'), session_user)
            || '|' || (to_regclass('vault.decrypted_secrets') is not null
                       and exists (select 1 from vault.decrypted_secrets where name = 'employee_pii_key'))::text;`,
  ).trim();
  const [sessionUser, role, hasKey] = who.split("|");
  console.log(
    `DB 身分：${sessionUser}（role ${role}）；加密金鑰：${hasKey === "true" ? "已設定" : "未設定"}`,
  );

  const existingJson = psql(
    env,
    `select coalesce(json_agg(json_build_object(
        'id', id, 'code', code, 'name', name, 'roles', roles, 'active', active,
        'title', title, 'phone', phone, 'hired_on', hired_on, 'left_on', left_on)
        order by name, id), '[]'::json) from employees;`,
  );
  const existing = JSON.parse(existingJson.trim()) as ExistingEmployee[];

  const parsed = parseRows(sheet.grid, header, mapping);
  const rows = args.noPrivate ? stripPrivate(parsed) : parsed;
  const plan = buildImportPlan(
    rows,
    existing,
    { status: args.status, compareKeys, canWritePrivate: !args.noPrivate },
    taipeiToday(),
  );
  const s = summarizePlan(plan);

  console.log(`\n既有員工 ${existing.length} 位；檔案 ${plan.length} 列：`);
  for (const r of plan) console.log("  " + describe(r, args.hideNames));
  console.log(
    `\n合計：新增 ${s.insert}、更新 ${s.update}、不變 ${s.unchanged}、略過 ${s.skip}；` +
      `無角色 ${s.noRole}；含敏感資料 ${s.privateRows} 位`,
  );
  if (s.privateRows > 0 && hasKey !== "true") {
    console.error(
      "\n加密金鑰未設定：請先在 Vault 建立 employee_pii_key，或加 --no-private 只匯入基本資料。",
    );
    process.exit(1);
  }

  const ops = planToOps(plan, randomUUID);
  if (ops.inserts.length + ops.updates.length + ops.private.length === 0) {
    console.log("\n沒有需要寫入的資料。");
    return;
  }

  const out = psql(env, buildSql(ops, args.apply)).trim();
  console.log(`\n${out}`);
  console.log(
    args.apply
      ? "\n已寫入（COMMIT）。可重跑本指令確認結果為「不變」。"
      : "\n乾跑完成：上述寫入已在交易內執行並 ROLLBACK，DB 沒有任何變更。確認無誤後加 --apply。",
  );
}

try {
  main();
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
