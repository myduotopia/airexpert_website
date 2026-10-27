// 一次性匯入舊系統客戶資料（#266）：從本機 xlsx 讀取，對應規則見 src/lib/erp/customer-import.ts
// （依標題名稱找欄、(FA) → 來源 FB、送貨郵遞＋地址合併、備註類合併進 note、比對既有客戶只補空白）。
//
// ⚠️ 本檔不含任何真實資料；檔案路徑與連線字串都由執行者在本機提供。
// ⚠️ 輸出只有筆數、列號、欄位名稱與原因，不印任何客戶名稱、編號或其他儲存格內容。
//
// 用法（在 frontend/ 目錄）：
//   DATABASE_URL='postgresql://postgres.<ref>:<密碼>@<pooler 主機>:5432/postgres' \
//     npx tsx scripts/import-customers.ts --file <xlsx 路徑> [--sheet 工作表4] [--apply]
//
//   預設為「乾跑」：讀取 DB 現有客戶 → 印出統計（新增／補欄位／不變、衝突欄位、FB、Email 待確認、錯誤列）
//   → 在交易內實際執行全部寫入後 ROLLBACK，DB 不留任何變更。確認無誤再加 --apply（單一交易 COMMIT）。
//   可重跑：第二次執行應全部為「不變」。
//
// 前置：0035（mx_customers.source）須已套用。
//
// 連線：DATABASE_URL 會拆成 PGHOST／PGPORT／PGUSER／PGPASSWORD／PGDATABASE 環境變數交給 psql
// （密碼不出現在命令列參數）；本機 Docker 測試請在 URL 加 ?sslmode=disable。SQL 與資料經 stdin 傳給 psql，
// 不寫入任何檔案。客戶資料以 COPY FROM STDIN 進交易內暫存表，不出現在 SQL 文字裡（語句出錯時 Postgres log
// 只會記到 SQL，不會記到資料；同 scripts/import-employees.ts）。
// psql 路徑：環境變數 PSQL，否則依序找 /opt/homebrew/opt/libpq/bin/psql、/usr/local/opt/libpq/bin/psql、psql。
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import * as cptable from "xlsx/dist/cpexcel.full";
import {
  CUSTOMER_IMPORT_FIELD_LABELS,
  DEFAULT_CUSTOMER_IMPORT_SHEET,
  buildCustomerImportPlan,
  customerImportOps,
  parseCustomerSheet,
  summarizeCustomerImport,
  type CustomerImportField,
  type ExistingCustomer,
} from "../src/lib/erp/customer-import";
import { readWorkbook, type SheetData } from "../src/lib/employees/sheet";

XLSX.set_cptable(cptable);

interface Args {
  file: string;
  sheet: string;
  apply: boolean;
}

function usage(msg?: string): never {
  if (msg) console.error(`錯誤：${msg}\n`);
  console.error(
    "用法：DATABASE_URL=... npx tsx scripts/import-customers.ts --file <xlsx 路徑> " +
      `[--sheet ${DEFAULT_CUSTOMER_IMPORT_SHEET}] [--apply]`,
  );
  process.exit(2);
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    file: "",
    sheet: DEFAULT_CUSTOMER_IMPORT_SHEET,
    apply: false,
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
    else if (k === "--apply") a.apply = true;
    else usage(`未知參數 ${k}`);
  }
  if (!a.file) usage("缺少 --file");
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
    PGAPPNAME: "customer-import-266",
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
    // stderr 可能含 DETAIL（例：唯一鍵衝突會帶出值）→ 只印第一行錯誤訊息。
    const first = r.stderr.trim().split("\n")[0] ?? "";
    throw new Error(`psql 失敗（exit ${r.status}）：${first}`);
  }
  return r.stdout;
}

/**
 * 資料以 COPY … FROM STDIN 傳進交易內暫存表（base64 JSON，COPY 文字格式不需跳脫），
 * 不寫成 SQL 字面值：語句出錯時伺服器會把整段 SQL 記進 Postgres log，字面值會讓客戶資料進 log。
 * 暫存表 on commit drop，rollback 時也一併消失。
 */
function copyPayload(payloads: Record<string, unknown>): string {
  const rows = Object.entries(payloads).map(
    ([k, v]) =>
      `${k}\t${Buffer.from(JSON.stringify(v), "utf8").toString("base64")}`,
  );
  return [
    "create temp table customer_import_payload (k text primary key, b64 text not null) on commit drop;",
    "copy customer_import_payload (k, b64) from stdin;",
    ...rows,
    "\\.",
  ].join("\n");
}

function payload(k: string): string {
  return `(select convert_from(decode(b64, 'base64'), 'UTF8')::jsonb from customer_import_payload where k = '${k}')`;
}

/** 只補空白：DB 端再確認一次欄位仍為空白（讀取後若有人填了值，不覆蓋）。 */
function fillCol(col: string): string {
  return `${col} = case when u.p ? '${col}' and nullif(btrim(c.${col}), '') is null then u.p->>'${col}' else c.${col} end`;
}

const FILL_COLS = [
  "name",
  "tax_id",
  "payment_terms",
  "contact_person",
  "mail_recipient",
  "phone",
  "fax",
  "address",
  "delivery_address",
  "email",
  "source",
];
const INSERT_COLS = ["code", ...FILL_COLS, "note"];

function buildSql(
  ops: ReturnType<typeof customerImportOps>,
  commit: boolean,
): string {
  const lines: string[] = [
    "begin;",
    copyPayload({ inserts: ops.inserts, updates: ops.updates }),
  ];
  lines.push(`
with ins as (
  insert into mx_customers (${INSERT_COLS.join(", ")}, erp_active)
  select ${INSERT_COLS.map((c) => `x->>'${c}'`).join(", ")}, true
    from jsonb_array_elements(${payload("inserts")}) x
  returning 1
)
select 'inserted=' || count(*) from ins;`);
  lines.push(`
with upd as (
  update mx_customers c set
    ${FILL_COLS.map(fillCol).join(",\n    ")},
    note = case when u.p ? 'note' and c.note is not distinct from u.note_base then u.p->>'note' else c.note end,
    updated_at = now()
    from (select (x->>'id')::uuid as id, x->'patch' as p, x->>'note_base' as note_base
            from jsonb_array_elements(${payload("updates")}) x) u
   where c.id = u.id
  returning 1
)
select 'updated=' || count(*) from upd;`);
  lines.push(
    "select 'customers=' || count(*) || ' fb=' || count(*) filter (where upper(btrim(source)) = 'FB')" +
      " || ' erp_active=' || count(*) filter (where erp_active) from mx_customers;",
  );
  lines.push(commit ? "commit;" : "rollback;");
  return lines.join("\n");
}

function fieldList(
  counts: Partial<Record<CustomerImportField, number>>,
): string {
  const parts = (Object.entries(counts) as [CustomerImportField, number][])
    .filter(([, n]) => n > 0)
    .map(([f, n]) => `${CUSTOMER_IMPORT_FIELD_LABELS[f]} ${n}`);
  return parts.length ? parts.join("、") : "無";
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.DATABASE_URL;
  if (!url)
    usage("請以環境變數 DATABASE_URL 提供連線字串（身分需為 postgres）");
  const env = pgEnv(url);

  const sheets = readWorkbook(XLSX, new Uint8Array(readFileSync(args.file)));
  const sheet = pickSheet(sheets, args.sheet);
  const parsed = parseCustomerSheet(sheet.grid);
  if (!parsed.ok) usage(parsed.error);
  console.log(
    `工作表「${sheet.name}」：標題列第 1 列；資料列 ${parsed.rows.length + parsed.errors.length} 列` +
      (parsed.missingHeaders.length
        ? `；找不到的選填欄（不匯入）：${parsed.missingHeaders.join("、")}`
        : "；欄位全部對到"),
  );

  const who = psql(
    env,
    "select session_user || '|' || (to_regclass('public.mx_customers') is not null)::text" +
      " || '|' || exists (select 1 from information_schema.columns where table_schema = 'public'" +
      " and table_name = 'mx_customers' and column_name = 'source')::text;",
  ).trim();
  const [sessionUser, hasTable, hasSource] = who.split("|");
  console.log(`DB 身分：${sessionUser}`);
  if (hasTable !== "true" || hasSource !== "true") {
    console.error(
      "mx_customers.source 不存在：請先套用 0035_customer_source.sql。",
    );
    process.exit(1);
  }

  const existingJson = psql(
    env,
    `select coalesce(json_agg(json_build_object(
        'id', id, 'code', code, 'name', name, 'tax_id', tax_id, 'payment_terms', payment_terms,
        'contact_person', contact_person, 'mail_recipient', mail_recipient, 'phone', phone, 'fax', fax,
        'address', address, 'delivery_address', delivery_address, 'email', email, 'note', note,
        'source', source, 'erp_active', erp_active) order by id), '[]'::json) from mx_customers;`,
  );
  const existing = JSON.parse(existingJson.trim()) as ExistingCustomer[];

  const plan = buildCustomerImportPlan(parsed.rows, existing);
  const s = summarizeCustomerImport(plan, parsed.errors, existing.length);

  console.log(`\n既有客戶 ${existing.length} 筆；檔案有效 ${s.rows} 列：`);
  console.log(`  新增 ${s.insert}、補欄位 ${s.fill}、不變 ${s.unchanged}`);
  console.log(`  補欄位明細：${fieldList(s.filledByField)}`);
  console.log(
    `  衝突（既有值不同、未覆蓋）${s.conflictRows} 列：${fieldList(s.conflictsByField)}`,
  );
  for (const r of plan.filter((p) => p.conflicts.length > 0)) {
    console.log(
      `    第 ${r.line} 列：${r.conflicts.map((f) => CUSTOMER_IMPORT_FIELD_LABELS[f]).join("、")}`,
    );
  }
  console.log(`  來源 FB ${s.fb}`);
  console.log(`  Email 格式待確認（原文已寫入備註）${s.emailInvalid}`);
  console.log(`  統一編號非 8 位數字（照原文保存）${s.taxIdNonStandard}`);
  console.log(
    `  對到但 ERP 停用中（不改 erp_active）${s.matchedErpInactive}；既有客戶不在檔案中（不受影響）${s.existingUnmatched}`,
  );
  console.log(`  錯誤列（略過）${s.errors.length}`);
  for (const e of s.errors) console.log(`    第 ${e.line} 列：${e.reason}`);

  const ops = customerImportOps(plan);
  if (ops.inserts.length + ops.updates.length === 0) {
    console.log("\n沒有需要寫入的資料（全部不變）。");
    return;
  }

  const out = psql(env, buildSql(ops, args.apply)).trim();
  console.log(`\n${out.split("\n").join("；")}`);
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
