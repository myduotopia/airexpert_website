# 行政「空壓機保養記錄卡」後台 MVP 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓行政人員以「office」專屬帳號登入官網後台，透過手動輸入或拍照 AI 辨識，把空壓機保養資料存入數位化的「女生卡」，免去紙本重複謄寫。

**Architecture:** 沿用現有後台三件套 —— `admin_profiles.role` + security-definer RPC + RLS 做角色隔離；Next.js App Router server component 頁面 + server actions 做 CRUD；前端現有 Gemini（`gemini.ts`）薄封裝做 vision 辨識，不動 FastAPI backend。三層資料模型（`mx_customers` → `mx_machines` → `mx_records`），以機號 `serial_no` 為唯一鍵供辨識比對。

**Tech Stack:** Next.js 16（App Router, TS, Tailwind）、Supabase（Postgres + RLS + Auth admin API + Storage 簽名直傳）、Gemini 2.5 Flash（vision, `responseMimeType: application/json`）、vitest。

**設計來源：** [docs/superpowers/specs/2026-07-25-office-maintenance-card-mvp-design.md](../specs/2026-07-25-office-maintenance-card-mvp-design.md)

---

## Issue 對應總表

本計畫拆成 3 個 GitHub issue，依序相依（Issue 1 → 2 → 3），各自可獨立交付、測試、開 PR：

| Issue | 標題 | 產出 | 相依 |
|---|---|---|---|
| **#A（[#117](https://github.com/myduotopia/airexpert_website/issues/117)）** | office 角色 + 資料表 + RLS 骨架 | 行政帳號登入只見「保養記錄卡」；admin 讀不到；空資料表就緒 | — |
| **#B（[#118](https://github.com/myduotopia/airexpert_website/issues/118)）** | 保養卡手動 CRUD（列表 / 建卡 / 詳情 / 維護列） | 純手動輸入的完整女生卡（不含 AI） | #117 |
| **#C（[#119](https://github.com/myduotopia/airexpert_website/issues/119)）** | 拍照 AI 辨識 + Review 匯入 | 拍男生卡 → Gemini 擷取 → review 編輯 → 存檔匯入 | #118 |

> 檔案結構總覽：
> - Migration：`supabase/migrations/0011_office_maintenance.sql`（#A）
> - 角色 plumbing：`lib/admin/auth.ts`、`lib/admin/nav-config.ts`、`app/admin/(protected)/layout.tsx`、`app/admin/(protected)/page.tsx`、`app/admin/(protected)/staff/*`（#A）
> - DAL：`lib/admin/maintenance.ts`（#B 建立，#C 擴充）
> - 純函式：`lib/admin/maintenance-normalize.ts`（#C；解析 / 比對 / 正規化，好單測）
> - AI：`lib/ai/gemini.ts` 內新增 `extractMaintenanceCard()`（#C）
> - 頁面：`app/admin/(protected)/maintenance/**`（#B / #C）
> - 元件：`components/admin/maintenance/**`（#B / #C）

---

# Issue #A — office 角色 + 資料表 + RLS 骨架

**目標：** 建好資料庫結構與角色隔離。完成後：admin 能在「人員管理」建 office 帳號；office 登入後側欄只有「保養記錄卡」一項，且 `/admin` 會導到 `/admin/maintenance`（本 issue 先放佔位頁）；admin / seo_manager 完全讀不到 `mx_*` 表。

## Task A1: 資料庫 migration（表 + RPC + RLS）

**Files:**
- Create: `supabase/migrations/0011_office_maintenance.sql`

Migration 採 Supabase Dashboard → SQL Editor 手動套用（沿用 0001–0010 慣例）。RPC 鏡像 [0005_seo_roles.sql](../../../supabase/migrations/0005_seo_roles.sql) 的 `is_seo_manager()` 安全設定。

- [ ] **Step 1: 撰寫 migration SQL**

```sql
-- 0011_office_maintenance.sql
-- 行政「空壓機保養記錄卡」MVP：新增 office 角色 RPC + 三層資料模型 + 辨識稽核表。
-- 依賴 0002（admin_profiles / is_admin）、0005（is_seo_manager 樣式）。
-- 套用：Supabase Dashboard → SQL Editor 貼上執行。

-- ============================================================
-- 角色判斷：is_office()（鏡像 is_seo_manager 的安全設定）
-- ============================================================
create or replace function is_office()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from admin_profiles p
    where p.id = auth.uid() and p.role = 'office'
  );
$$;

revoke execute on function is_office() from public, anon;
grant execute on function is_office() to authenticated;

-- ============================================================
-- 資料表（三層 + 辨識稽核）。前綴 mx_ 與 CMS 表區隔。
-- ============================================================
create table mx_customers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table mx_machines (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references mx_customers(id) on delete cascade,
  card_no      text,
  serial_no    text not null,
  location     text,
  purchased_at date,
  model        text,
  horsepower   text,
  voltage      text,
  created_at   timestamptz not null default now()
);

-- 機號唯一：供拍照辨識比對；大小寫 / 前後空白正規化後唯一。
create unique index mx_machines_serial_no_key
  on mx_machines (lower(btrim(serial_no)));

create index mx_machines_customer_id_idx on mx_machines (customer_id);

create table mx_records (
  id            uuid primary key default gen_random_uuid(),
  machine_id    uuid not null references mx_machines(id) on delete cascade,
  service_date  date,
  hours         text,
  oil           text,
  oil_filter    text,
  air_filter    text,
  oil_separator text,
  inverter      text,
  filter_system text,
  technician    text,
  note          text,
  source        text not null default 'manual' check (source in ('manual','photo')),
  created_at    timestamptz not null default now()
);

create index mx_records_machine_id_idx on mx_records (machine_id);

create table mx_import_drafts (
  id          uuid primary key default gen_random_uuid(),
  created_by  uuid,
  photo_path  text,
  raw_output  jsonb,
  status      text not null default 'pending'
               check (status in ('pending','committed','discarded')),
  machine_id  uuid references mx_machines(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- RLS：四表僅對 is_office() 開 SELECT/INSERT/UPDATE/DELETE。
-- 無 admin / seo_manager policy → fail-closed（方案 B 資料隔離）。
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'mx_customers','mx_machines','mx_records','mx_import_drafts'
  ]
  loop
    execute format('alter table %I enable row level security;', t);
    execute format(
      'create policy "office all %1$s" on %1$I for all to authenticated using (is_office()) with check (is_office());',
      t
    );
  end loop;
end $$;

-- 備註：office 帳號由後台「人員管理」以 service_role 建立（同 seo_manager）。
--       service_role 繞過 RLS（部署層固有），故 admin 隔離為 UI+RLS 層級，非加密隔離。
```

- [ ] **Step 2: 套用到 Supabase 並人工驗證**

在 Supabase Dashboard → SQL Editor 執行上述 SQL。接著在 SQL Editor 驗證：

```sql
-- 應回 4 張表
select tablename from pg_tables where tablename like 'mx_%' order by 1;
-- 應回 is_office
select proname from pg_proc where proname = 'is_office';
-- 應對每張 mx_ 表各回一條 policy
select tablename, policyname from pg_policies where tablename like 'mx_%' order by 1;
```

Expected：4 張表、`is_office` 存在、4 條 `office all …` policy。

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0011_office_maintenance.sql
git commit -m "feat(db): office 角色 RPC + 保養卡三層資料表 + RLS (#A)"
```

## Task A2: `AdminRole` 型別加入 office

**Files:**
- Modify: `frontend/src/lib/admin/auth.ts`

- [ ] **Step 1: 擴充型別與角色判斷**

`auth.ts` 中把 `AdminRole` 從 `"admin" | "seo_manager"` 改為包含 `"office"`，並讓 `getCurrentUserRole()` 接受它：

```ts
/** 後台角色。null = 未登入或非後台人員。 */
export type AdminRole = "admin" | "seo_manager" | "office";
```

同檔 `getCurrentUserRole()` 結尾的角色白名單判斷改為：

```ts
  const role = data.role as string;
  return role === "admin" || role === "seo_manager" || role === "office"
    ? (role as AdminRole)
    : null;
```

- [ ] **Step 2: 型別檢查**

Run: `cd frontend && npx tsc --noEmit`
Expected：PASS（新增 union 成員不會破壞既有 `requireRole(['admin', ...])` 呼叫）。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/admin/auth.ts
git commit -m "feat(auth): AdminRole 加入 office (#A)"
```

## Task A3: 側欄導覽 + 保護殼層放行 office

**Files:**
- Modify: `frontend/src/lib/admin/nav-config.ts`
- Modify: `frontend/src/app/admin/(protected)/layout.tsx`

- [ ] **Step 1: nav-config 加入「保養記錄卡」（僅 office）**

在 [nav-config.ts](../../../frontend/src/lib/admin/nav-config.ts) 的 `ADMIN_NAV` 陣列**最後**加一項（`navForRole()` 已是通用過濾，無需改動）：

```ts
  {
    key: "maintenance",
    label: "保養記錄卡",
    href: "/admin/maintenance",
    enabled: true,
    roles: ["office"],
  },
```

> 因標了 `roles: ["office"]`，admin / seo_manager 側欄不會出現此項（對齊方案 B）。

- [ ] **Step 2: 保護殼層放行 office**

[layout.tsx](../../../frontend/src/app/admin/(protected)/layout.tsx) 目前是 `requireRole(["admin", "seo_manager"])`，會把 office 導回登入。改為：

```ts
  const role = await requireRole(["admin", "seo_manager", "office"]);
```

其餘不動（`AdminSidebar` 已用 `navForRole(role)` 過濾，office 只會看到自己那一項）。

- [ ] **Step 3: 型別檢查**

Run: `cd frontend && npx tsc --noEmit`
Expected：PASS。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/admin/nav-config.ts "frontend/src/app/admin/(protected)/layout.tsx"
git commit -m "feat(admin): office 側欄項與殼層放行 (#A)"
```

## Task A4: `/admin` 總覽對 office 導向保養卡 + 佔位頁

**Files:**
- Modify: `frontend/src/app/admin/(protected)/page.tsx`
- Create: `frontend/src/app/admin/(protected)/maintenance/page.tsx`

- [ ] **Step 1: 總覽頁對 office redirect**

在 [page.tsx](../../../frontend/src/app/admin/(protected)/page.tsx) 元件函式**最前面**（其他資料查詢之前）加入角色判斷。先確認檔案頂部有 import；若無則補：

```ts
import { redirect } from "next/navigation";
import { getCurrentUserRole } from "@/lib/admin/auth";
```

在 default export 的 async 元件函式體第一行：

```ts
  const role = await getCurrentUserRole();
  if (role === "office") redirect("/admin/maintenance");
```

- [ ] **Step 2: 保養卡佔位頁（本 issue 先最小化，#B 取代）**

```tsx
// frontend/src/app/admin/(protected)/maintenance/page.tsx
import { requireRole } from "@/lib/admin/auth";

export const metadata = { title: "保養記錄卡 · 後台" };

export default async function MaintenancePage() {
  await requireRole(["office"]);
  return (
    <div className="mx-auto max-w-[1040px]">
      <h1 className="text-ink text-[24px] font-bold">保養記錄卡</h1>
      <p className="text-text-muted mt-1 text-[14px]">功能建置中。</p>
    </div>
  );
}
```

- [ ] **Step 3: 型別檢查**

Run: `cd frontend && npx tsc --noEmit`
Expected：PASS。

- [ ] **Step 4: Commit**

```bash
git add "frontend/src/app/admin/(protected)/page.tsx" "frontend/src/app/admin/(protected)/maintenance/page.tsx"
git commit -m "feat(admin): office 登入導向保養卡 + 佔位頁 (#A)"
```

## Task A5: 「人員管理」支援建立 office 帳號

現有 [staff/actions.ts](../../../frontend/src/app/admin/(protected)/staff/actions.ts) 的 `createSeoManager` 寫死 `role:'seo_manager'`。改為可指定角色（`seo_manager` | `office`），並讓 UI 可選。移除同理放寬。

**Files:**
- Modify: `frontend/src/app/admin/(protected)/staff/actions.ts`
- Modify: `frontend/src/app/admin/(protected)/staff/CreateSeoManagerForm.tsx`
- Modify: `frontend/src/app/admin/(protected)/staff/page.tsx`

- [ ] **Step 1: actions 泛化角色**

在 [staff/actions.ts](../../../frontend/src/app/admin/(protected)/staff/actions.ts)：新增可建立角色白名單，改讀表單的 `role` 欄位。

```ts
const CREATABLE_ROLES = ["seo_manager", "office"] as const;
type CreatableRole = (typeof CREATABLE_ROLES)[number];

function parseRole(v: FormDataEntryValue | null): CreatableRole | null {
  const s = String(v ?? "");
  return (CREATABLE_ROLES as readonly string[]).includes(s)
    ? (s as CreatableRole)
    : null;
}
```

`createSeoManager` 內、`isValidEmail` 檢查後，插入角色解析並改寫 insert：

```ts
  const role = parseRole(fd.get("role"));
  if (!role) {
    return { error: "請選擇角色。" };
  }
```

把後面 `.insert({ id: created.user.id, email, role: "seo_manager" })` 的 `role: "seo_manager"` 改為 `role`。

`removeSeoManager` 內把「只能移除 seo_manager」放寬為可移除非 admin：

```ts
  if (target.role === "admin") {
    return { ok: false, error: "不可移除管理員帳號。" };
  }
```

（原本檢查 `target.role !== "seo_manager"` 的整段以上式取代。）

- [ ] **Step 2: 表單加角色下拉**

在 [CreateSeoManagerForm.tsx](../../../frontend/src/app/admin/(protected)/staff/CreateSeoManagerForm.tsx) 的 email 欄位**之前**加一個角色選擇欄位：

```tsx
      <div className="flex flex-col gap-1.5">
        <label htmlFor="role" className="text-ink text-[14px] font-medium">
          角色
        </label>
        <select
          id="role"
          name="role"
          defaultValue="office"
          className="border-border focus:border-primary h-11 rounded-lg border px-3 text-[15px] outline-none"
        >
          <option value="office">行政（保養記錄卡）</option>
          <option value="seo_manager">SEO 代管</option>
        </select>
      </div>
```

- [ ] **Step 3: 列表顯示 office 標籤 + 列出 office 帳號**

在 [staff/page.tsx](../../../frontend/src/app/admin/(protected)/staff/page.tsx)：`roleLabel()` 加一行；並把只列 seo_manager 的 `managers` 過濾放寬為列出所有非 admin 帳號。

```ts
  if (role === "office") return "行政";
```

把 `const managers = profiles.filter((p) => p.role === "seo_manager");` 改為：

```ts
  const managers = profiles.filter((p) => p.role !== "admin");
```

並視情況調整頁面說明文字（把「代管帳號」措辭改為「代管 / 行政帳號」）。

- [ ] **Step 4: 型別檢查**

Run: `cd frontend && npx tsc --noEmit`
Expected：PASS。

- [ ] **Step 5: 手動驗證（本地或 preview）**

以 admin 登入 → 人員管理 → 角色選「行政」建一個 office 帳號 → 登出 → 以該帳號登入 → 應只見側欄「保養記錄卡」、落地在 `/admin/maintenance`；手動打 `/admin/products` 應被 `requireRole` 導回登入。

- [ ] **Step 6: Commit**

```bash
git add "frontend/src/app/admin/(protected)/staff"
git commit -m "feat(admin): 人員管理可建立 office 行政帳號 (#A)"
```

---

# Issue #B — 保養卡手動 CRUD

**目標：** 純手動輸入的完整女生卡：列表（搜尋/排序）、建新卡、卡詳情（基本資訊可編輯 + 維護紀錄表格可增/改/刪列）。不含 AI。完成後行政可完全靠打字維護資料。

## Task B1: DAL — `lib/admin/maintenance.ts`

一般讀寫走登入者 session（靠 office RLS 擋）。用現有 `getServerSupabase()`（session 綁定）而非 service_role。

**Files:**
- Create: `frontend/src/lib/admin/maintenance.ts`
- Create: `frontend/src/lib/admin/maintenance.test.ts`（型別/純轉換測試）

- [ ] **Step 1: 定義型別與 DAL**

```ts
// frontend/src/lib/admin/maintenance.ts
// 保養卡 DAL — SERVER ONLY。讀寫走登入者 session，靠 mx_* 的 office RLS 擋。
import "server-only";
import { getServerSupabase } from "../supabase-server";

export interface MxCustomer {
  id: string;
  name: string;
}

export interface MxMachine {
  id: string;
  customer_id: string;
  card_no: string | null;
  serial_no: string;
  location: string | null;
  purchased_at: string | null; // yyyy-mm-dd
  model: string | null;
  horsepower: string | null;
  voltage: string | null;
  created_at: string;
}

export interface MxRecord {
  id: string;
  machine_id: string;
  service_date: string | null;
  hours: string | null;
  oil: string | null;
  oil_filter: string | null;
  air_filter: string | null;
  oil_separator: string | null;
  inverter: string | null;
  filter_system: string | null;
  technician: string | null;
  note: string | null;
  source: "manual" | "photo";
  created_at: string;
}

/** 機器 + 客戶名 + 最後保養日（列表用）。 */
export interface MxMachineListItem extends MxMachine {
  customer_name: string;
  last_service_date: string | null;
}

export async function listMachines(): Promise<MxMachineListItem[]> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("mx_machines")
    .select(
      "*, mx_customers(name), mx_records(service_date)",
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(`讀取保養卡失敗：${error.message}`);
  return (data ?? []).map((m: Record<string, unknown>) => {
    const records = (m.mx_records as { service_date: string | null }[]) ?? [];
    const last =
      records
        .map((r) => r.service_date)
        .filter((d): d is string => !!d)
        .sort()
        .at(-1) ?? null;
    const { mx_customers, mx_records, ...machine } = m;
    return {
      ...(machine as unknown as MxMachine),
      customer_name:
        (mx_customers as { name: string } | null)?.name ?? "（未命名客戶）",
      last_service_date: last,
    };
  });
}

export async function getMachine(
  id: string,
): Promise<{ machine: MxMachine; customer: MxCustomer; records: MxRecord[] } | null> {
  const supabase = await getServerSupabase();
  const { data: machine, error } = await supabase
    .from("mx_machines")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`讀取保養卡失敗：${error.message}`);
  if (!machine) return null;

  const [{ data: customer }, { data: records }] = await Promise.all([
    supabase
      .from("mx_customers")
      .select("id, name")
      .eq("id", (machine as MxMachine).customer_id)
      .maybeSingle(),
    supabase
      .from("mx_records")
      .select("*")
      .eq("machine_id", id)
      .order("service_date", { ascending: false, nullsFirst: false }),
  ]);

  return {
    machine: machine as MxMachine,
    customer: (customer as MxCustomer) ?? { id: "", name: "（未命名客戶）" },
    records: (records as MxRecord[]) ?? [],
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/admin/maintenance.ts
git commit -m "feat(maintenance): 保養卡 DAL (#B)"
```

## Task B2: 純函式 — 表單 → payload 正規化（TDD）

把「表單字串 → DB 欄位」的清洗抽成純函式，好單測（空字串轉 null、trim）。

**Files:**
- Create: `frontend/src/lib/admin/maintenance-normalize.ts`
- Create: `frontend/src/lib/admin/maintenance-normalize.test.ts`

- [ ] **Step 1: 寫失敗測試**

```ts
// frontend/src/lib/admin/maintenance-normalize.test.ts
import { describe, it, expect } from "vitest";
import { cleanText, machinePayloadFromForm, recordPayloadFromForm } from "./maintenance-normalize";

describe("cleanText", () => {
  it("trims and maps empty to null", () => {
    expect(cleanText("  A ")).toBe("A");
    expect(cleanText("   ")).toBeNull();
    expect(cleanText(null)).toBeNull();
  });
});

describe("machinePayloadFromForm", () => {
  it("requires serial_no, cleans fields", () => {
    const fd = new FormData();
    fd.set("serial_no", " B072303002 ");
    fd.set("model", "PMV10");
    fd.set("horsepower", "");
    const out = machinePayloadFromForm(fd);
    expect(out.serial_no).toBe("B072303002");
    expect(out.model).toBe("PMV10");
    expect(out.horsepower).toBeNull();
  });

  it("throws when serial_no missing", () => {
    expect(() => machinePayloadFromForm(new FormData())).toThrow(/機號/);
  });
});

describe("recordPayloadFromForm", () => {
  it("cleans all maintenance columns", () => {
    const fd = new FormData();
    fd.set("hours", " 8342 ");
    fd.set("oil", "V190");
    const out = recordPayloadFromForm(fd);
    expect(out.hours).toBe("8342");
    expect(out.oil).toBe("V190");
    expect(out.technician).toBeNull();
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd frontend && npx vitest run src/lib/admin/maintenance-normalize.test.ts`
Expected：FAIL（模組不存在）。

- [ ] **Step 3: 實作純函式**

```ts
// frontend/src/lib/admin/maintenance-normalize.ts
// 表單字串 → DB payload 的清洗（純函式，無 I/O，好單測）。

export function cleanText(v: FormDataEntryValue | string | null): string | null {
  const s = (typeof v === "string" ? v : (v as string | null) ?? "").trim();
  return s === "" ? null : s;
}

export interface MachinePayload {
  serial_no: string;
  card_no: string | null;
  location: string | null;
  purchased_at: string | null;
  model: string | null;
  horsepower: string | null;
  voltage: string | null;
}

export function machinePayloadFromForm(fd: FormData): MachinePayload {
  const serial = cleanText(fd.get("serial_no"));
  if (!serial) throw new Error("機號為必填。");
  return {
    serial_no: serial,
    card_no: cleanText(fd.get("card_no")),
    location: cleanText(fd.get("location")),
    purchased_at: cleanText(fd.get("purchased_at")),
    model: cleanText(fd.get("model")),
    horsepower: cleanText(fd.get("horsepower")),
    voltage: cleanText(fd.get("voltage")),
  };
}

export interface RecordPayload {
  service_date: string | null;
  hours: string | null;
  oil: string | null;
  oil_filter: string | null;
  air_filter: string | null;
  oil_separator: string | null;
  inverter: string | null;
  filter_system: string | null;
  technician: string | null;
  note: string | null;
}

export function recordPayloadFromForm(fd: FormData): RecordPayload {
  return {
    service_date: cleanText(fd.get("service_date")),
    hours: cleanText(fd.get("hours")),
    oil: cleanText(fd.get("oil")),
    oil_filter: cleanText(fd.get("oil_filter")),
    air_filter: cleanText(fd.get("air_filter")),
    oil_separator: cleanText(fd.get("oil_separator")),
    inverter: cleanText(fd.get("inverter")),
    filter_system: cleanText(fd.get("filter_system")),
    technician: cleanText(fd.get("technician")),
    note: cleanText(fd.get("note")),
  };
}
```

- [ ] **Step 4: 執行確認通過**

Run: `cd frontend && npx vitest run src/lib/admin/maintenance-normalize.test.ts`
Expected：PASS（3 個 describe 全綠）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/admin/maintenance-normalize.ts frontend/src/lib/admin/maintenance-normalize.test.ts
git commit -m "feat(maintenance): 表單→payload 正規化純函式 + 測試 (#B)"
```

## Task B3: server actions — 建卡 / 改卡 / 維護列增改刪

**Files:**
- Create: `frontend/src/app/admin/(protected)/maintenance/actions.ts`

- [ ] **Step 1: 撰寫 actions**

```ts
"use server";

// 保養卡 server actions（office only）。讀寫走登入者 session，靠 mx_* 的 office RLS 擋。
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/admin/auth";
import { getServerSupabase } from "@/lib/supabase-server";
import type { ActionResult } from "@/lib/admin/crud";
import {
  machinePayloadFromForm,
  recordPayloadFromForm,
} from "@/lib/admin/maintenance-normalize";

/** 找或建客戶（依 name 完全比對；不強制唯一）。回傳 customer id。 */
async function findOrCreateCustomer(
  supabase: Awaited<ReturnType<typeof getServerSupabase>>,
  name: string,
): Promise<string> {
  const clean = name.trim();
  const { data: existing } = await supabase
    .from("mx_customers")
    .select("id")
    .eq("name", clean)
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;
  const { data: created, error } = await supabase
    .from("mx_customers")
    .insert({ name: clean })
    .select("id")
    .single();
  if (error) throw new Error(`建立客戶失敗：${error.message}`);
  return (created as { id: string }).id;
}

/** 建立新卡（含客戶）。表單需帶 customer_name + 機器欄位。成功後導向卡詳情。 */
export async function createMachineAction(fd: FormData): Promise<void> {
  await requireRole(["office"]);
  const supabase = await getServerSupabase();

  const customerName = String(fd.get("customer_name") ?? "").trim();
  if (!customerName) throw new Error("客戶名稱為必填。");
  const payload = machinePayloadFromForm(fd);

  const customerId = await findOrCreateCustomer(supabase, customerName);
  const { data, error } = await supabase
    .from("mx_machines")
    .insert({ ...payload, customer_id: customerId })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("此機號已存在，請改用既有卡片。");
    throw new Error(`建立保養卡失敗：${error.message}`);
  }
  revalidatePath("/admin/maintenance");
  redirect(`/admin/maintenance/${(data as { id: string }).id}`);
}

/** 更新既有卡的基本資訊（含客戶名）。 */
export async function updateMachineAction(
  machineId: string,
  fd: FormData,
): Promise<ActionResult> {
  await requireRole(["office"]);
  const supabase = await getServerSupabase();

  const customerName = String(fd.get("customer_name") ?? "").trim();
  const payload = machinePayloadFromForm(fd);
  try {
    const patch: Record<string, unknown> = { ...payload };
    if (customerName) {
      patch.customer_id = await findOrCreateCustomer(supabase, customerName);
    }
    const { error } = await supabase
      .from("mx_machines")
      .update(patch)
      .eq("id", machineId);
    if (error) {
      if (error.code === "23505") return { ok: false, error: "此機號已存在。" };
      return { ok: false, error: error.message };
    }
    revalidatePath(`/admin/maintenance/${machineId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** 新增一列維護紀錄（手動；source='manual'）。 */
export async function addRecordAction(
  machineId: string,
  fd: FormData,
): Promise<void> {
  await requireRole(["office"]);
  const supabase = await getServerSupabase();
  const payload = recordPayloadFromForm(fd);
  const { error } = await supabase
    .from("mx_records")
    .insert({ ...payload, machine_id: machineId, source: "manual" });
  if (error) throw new Error(`新增維護紀錄失敗：${error.message}`);
  revalidatePath(`/admin/maintenance/${machineId}`);
  redirect(`/admin/maintenance/${machineId}`);
}

/** 更新一列維護紀錄。 */
export async function updateRecordAction(
  recordId: string,
  machineId: string,
  fd: FormData,
): Promise<ActionResult> {
  await requireRole(["office"]);
  const supabase = await getServerSupabase();
  const payload = recordPayloadFromForm(fd);
  const { error } = await supabase
    .from("mx_records")
    .update(payload)
    .eq("id", recordId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/maintenance/${machineId}`);
  return { ok: true };
}

/** 刪除一列維護紀錄（DeleteButton 以 bind 帶入 id）。 */
export async function deleteRecordAction(
  recordId: string,
  machineId: string,
): Promise<ActionResult> {
  await requireRole(["office"]);
  const supabase = await getServerSupabase();
  const { error } = await supabase.from("mx_records").delete().eq("id", recordId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/maintenance/${machineId}`);
  return { ok: true };
}
```

- [ ] **Step 2: 型別檢查**

Run: `cd frontend && npx tsc --noEmit`
Expected：PASS。（確認 `ActionResult` 由 `@/lib/admin/crud` 匯出；若形狀不符，沿用該檔實際型別。）

- [ ] **Step 3: Commit**

```bash
git add "frontend/src/app/admin/(protected)/maintenance/actions.ts"
git commit -m "feat(maintenance): 建卡/改卡/維護列 CRUD server actions (#B)"
```

## Task B4: 元件 — 基本資訊表單 + 維護列表單

**Files:**
- Create: `frontend/src/components/admin/maintenance/CardBasicForm.tsx`
- Create: `frontend/src/components/admin/maintenance/RecordForm.tsx`

> 兩者皆為受控/半受控表單，接受 `defaultValues`（給編輯與 #C 的 AI 預填共用）。沿用 [CreateSeoManagerForm.tsx](../../../frontend/src/app/admin/(protected)/staff/CreateSeoManagerForm.tsx) 的 input 樣式（`border-border focus:border-primary h-11 rounded-lg border px-3`）。

- [ ] **Step 1: CardBasicForm**

```tsx
"use client";
// 保養卡「基本資訊」欄位群。可獨立提交（建卡/改卡），或被 ImportReview 內嵌。
import type { ReactNode } from "react";

export interface CardBasicValues {
  customer_name?: string;
  card_no?: string;
  serial_no?: string;
  location?: string;
  purchased_at?: string;
  model?: string;
  horsepower?: string;
  voltage?: string;
}

const FIELDS: { name: keyof CardBasicValues; label: string; type?: string }[] = [
  { name: "customer_name", label: "客戶名稱" },
  { name: "serial_no", label: "機號" },
  { name: "card_no", label: "卡號" },
  { name: "location", label: "使用地點" },
  { name: "purchased_at", label: "購買時間", type: "date" },
  { name: "model", label: "機型" },
  { name: "horsepower", label: "馬力" },
  { name: "voltage", label: "電壓" },
];

export function CardBasicFields({ values }: { values?: CardBasicValues }): ReactNode {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {FIELDS.map((f) => (
        <div key={f.name} className="flex flex-col gap-1.5">
          <label htmlFor={f.name} className="text-ink text-[14px] font-medium">
            {f.label}
            {(f.name === "customer_name" || f.name === "serial_no") && (
              <span className="text-red-500"> *</span>
            )}
          </label>
          <input
            id={f.name}
            name={f.name}
            type={f.type ?? "text"}
            required={f.name === "customer_name" || f.name === "serial_no"}
            defaultValue={values?.[f.name] ?? ""}
            className="border-border focus:border-primary h-11 rounded-lg border px-3 text-[15px] outline-none"
          />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: RecordForm 欄位群**

```tsx
"use client";
// 維護紀錄一列的欄位群。可獨立提交（新增/編輯列），或被 ImportReview 逐列內嵌。
import type { ReactNode } from "react";

export interface RecordValues {
  service_date?: string;
  hours?: string;
  oil?: string;
  oil_filter?: string;
  air_filter?: string;
  oil_separator?: string;
  inverter?: string;
  filter_system?: string;
  technician?: string;
  note?: string;
}

const FIELDS: { name: keyof RecordValues; label: string; type?: string }[] = [
  { name: "service_date", label: "日期", type: "date" },
  { name: "hours", label: "時數" },
  { name: "oil", label: "專用油" },
  { name: "oil_filter", label: "機油濾清器" },
  { name: "air_filter", label: "空氣濾清器" },
  { name: "oil_separator", label: "油氣分離器" },
  { name: "inverter", label: "變頻器" },
  { name: "filter_system", label: "過濾系統" },
  { name: "technician", label: "維護員" },
  { name: "note", label: "備註" },
];

export function RecordFields({ values }: { values?: RecordValues }): ReactNode {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {FIELDS.map((f) => (
        <div key={f.name} className="flex flex-col gap-1.5">
          <label htmlFor={f.name} className="text-ink text-[14px] font-medium">
            {f.label}
          </label>
          <input
            id={f.name}
            name={f.name}
            type={f.type ?? "text"}
            defaultValue={values?.[f.name] ?? ""}
            className="border-border focus:border-primary h-11 rounded-lg border px-3 text-[15px] outline-none"
          />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: 型別檢查**

Run: `cd frontend && npx tsc --noEmit`
Expected：PASS。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/admin/maintenance/CardBasicForm.tsx frontend/src/components/admin/maintenance/RecordForm.tsx
git commit -m "feat(maintenance): 基本資訊/維護列欄位群元件 (#B)"
```

## Task B5: 頁面 — 列表 / 建卡 / 詳情 / 新增維護列

**Files:**
- Replace: `frontend/src/app/admin/(protected)/maintenance/page.tsx`（取代 A4 佔位）
- Create: `frontend/src/app/admin/(protected)/maintenance/new/page.tsx`
- Create: `frontend/src/app/admin/(protected)/maintenance/[machineId]/page.tsx`
- Create: `frontend/src/app/admin/(protected)/maintenance/[machineId]/records/new/page.tsx`

- [ ] **Step 1: 列表頁（AdminTable 搜尋/排序）**

沿用 [products/page.tsx](../../../frontend/src/app/admin/(protected)/products/page.tsx) 的 `AdminTable` 用法。

```tsx
import Link from "next/link";
import { requireRole } from "@/lib/admin/auth";
import { listMachines } from "@/lib/admin/maintenance";
import {
  AdminTable,
  type AdminColumn,
  type AdminRow,
} from "@/components/admin/AdminTable";

export const metadata = { title: "保養記錄卡 · 後台" };

const DATE_FMT = new Intl.DateTimeFormat("zh-TW", {
  dateStyle: "medium",
  timeZone: "Asia/Taipei",
});
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : DATE_FMT.format(d);
}

export default async function MaintenanceListPage() {
  await requireRole(["office"]);
  const machines = await listMachines();

  const columns: AdminColumn[] = [
    { header: "機號", sortable: true },
    { header: "客戶", sortable: true },
    { header: "機型", sortable: true },
    { header: "最後保養日", sortable: true },
  ];
  const rows: AdminRow[] = machines.map((m) => ({
    key: m.id,
    cells: [
      <Link
        key="serial"
        href={`/admin/maintenance/${m.id}`}
        className="text-ink hover:text-primary-deep font-medium"
      >
        {m.serial_no}
      </Link>,
      m.customer_name,
      m.model ?? "—",
      fmtDate(m.last_service_date),
    ],
    sortValues: [m.serial_no, m.customer_name, m.model, m.last_service_date],
    search: `${m.serial_no} ${m.customer_name} ${m.model ?? ""}`.toLowerCase(),
  }));

  return (
    <div className="mx-auto max-w-[1040px]">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-ink text-[24px] font-bold">保養記錄卡</h1>
          <p className="text-text-muted mt-1 text-[14px]">共 {machines.length} 張卡。</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/maintenance/import"
            className="border-border hover:bg-surface-muted inline-flex h-10 items-center rounded-lg border px-4 text-[14px] font-semibold"
          >
            拍照辨識
          </Link>
          <Link
            href="/admin/maintenance/new"
            className="bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-semibold text-white"
          >
            新增保養卡
          </Link>
        </div>
      </div>
      <AdminTable
        rows={rows}
        columns={columns}
        searchPlaceholder="搜尋機號 / 客戶…"
        empty="尚無保養卡，點右上角建立第一張。"
      />
    </div>
  );
}
```

> 注意：`AdminTable` 的 `onReorder` 為選填；保養卡不需拖曳排序，故省略。若該元件要求必填，改傳 `onReorder={undefined}` 或依其型別調整。

- [ ] **Step 2: 建卡頁**

```tsx
// maintenance/new/page.tsx
import { requireRole } from "@/lib/admin/auth";
import { CardBasicFields } from "@/components/admin/maintenance/CardBasicForm";
import { createMachineAction } from "../actions";

export const metadata = { title: "新增保養卡 · 後台" };

export default async function NewMachinePage() {
  await requireRole(["office"]);
  return (
    <div className="mx-auto max-w-[800px]">
      <h1 className="text-ink mb-6 text-[24px] font-bold">新增保養卡</h1>
      <form action={createMachineAction} className="flex flex-col gap-6">
        <CardBasicFields />
        <button
          type="submit"
          className="bg-primary hover:bg-primary-deep h-11 self-start rounded-lg px-6 text-[15px] font-semibold text-white"
        >
          建立
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: 卡詳情頁（基本資訊 + 維護列表格）**

```tsx
// maintenance/[machineId]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/admin/auth";
import { getMachine } from "@/lib/admin/maintenance";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { DeleteButton } from "@/components/admin/DeleteButton";
import type { MxRecord } from "@/lib/admin/maintenance";
import { deleteRecordAction } from "../actions";

export const metadata = { title: "保養卡 · 後台" };

export default async function MachineDetailPage({
  params,
}: {
  params: Promise<{ machineId: string }>;
}) {
  await requireRole(["office"]);
  const { machineId } = await params;
  const data = await getMachine(machineId);
  if (!data) notFound();
  const { machine, customer, records } = data;

  const columns: Column<MxRecord>[] = [
    { header: "日期", cell: (r) => r.service_date ?? "—" },
    { header: "時數", cell: (r) => r.hours ?? "—" },
    { header: "專用油", cell: (r) => r.oil ?? "—" },
    { header: "機油濾", cell: (r) => r.oil_filter ?? "—" },
    { header: "空氣濾", cell: (r) => r.air_filter ?? "—" },
    { header: "油氣分離", cell: (r) => r.oil_separator ?? "—" },
    { header: "變頻器", cell: (r) => r.inverter ?? "—" },
    { header: "過濾系統", cell: (r) => r.filter_system ?? "—" },
    { header: "維護員", cell: (r) => r.technician ?? "—" },
    {
      header: "",
      cell: (r) => (
        <DeleteButton onDelete={deleteRecordAction.bind(null, r.id, machineId)} />
      ),
      className: "text-right whitespace-nowrap",
    },
  ];

  return (
    <div className="mx-auto max-w-[1100px]">
      <h1 className="text-ink text-[24px] font-bold">
        {machine.serial_no}
        <span className="text-text-muted ml-2 text-[16px] font-normal">
          {customer.name}
        </span>
      </h1>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-[14px] sm:grid-cols-4">
        <div><dt className="text-text-muted">機型</dt><dd className="text-ink">{machine.model ?? "—"}</dd></div>
        <div><dt className="text-text-muted">馬力</dt><dd className="text-ink">{machine.horsepower ?? "—"}</dd></div>
        <div><dt className="text-text-muted">電壓</dt><dd className="text-ink">{machine.voltage ?? "—"}</dd></div>
        <div><dt className="text-text-muted">使用地點</dt><dd className="text-ink">{machine.location ?? "—"}</dd></div>
        <div><dt className="text-text-muted">購買時間</dt><dd className="text-ink">{machine.purchased_at ?? "—"}</dd></div>
        <div><dt className="text-text-muted">卡號</dt><dd className="text-ink">{machine.card_no ?? "—"}</dd></div>
      </dl>

      <div className="mt-8 mb-4 flex items-center justify-between">
        <h2 className="text-ink text-[18px] font-bold">維護紀錄（{records.length}）</h2>
        <Link
          href={`/admin/maintenance/${machineId}/records/new`}
          className="bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-semibold text-white"
        >
          新增維護紀錄
        </Link>
      </div>
      <DataTable rows={records} columns={columns} getKey={(r) => r.id} empty="尚無維護紀錄。" />
    </div>
  );
}
```

- [ ] **Step 4: 新增維護列頁**

```tsx
// maintenance/[machineId]/records/new/page.tsx
import { requireRole } from "@/lib/admin/auth";
import { RecordFields } from "@/components/admin/maintenance/RecordForm";
import { addRecordAction } from "../../../actions";

export const metadata = { title: "新增維護紀錄 · 後台" };

export default async function NewRecordPage({
  params,
}: {
  params: Promise<{ machineId: string }>;
}) {
  await requireRole(["office"]);
  const { machineId } = await params;
  const action = addRecordAction.bind(null, machineId);
  return (
    <div className="mx-auto max-w-[900px]">
      <h1 className="text-ink mb-6 text-[24px] font-bold">新增維護紀錄</h1>
      <form action={action} className="flex flex-col gap-6">
        <RecordFields />
        <button
          type="submit"
          className="bg-primary hover:bg-primary-deep h-11 self-start rounded-lg px-6 text-[15px] font-semibold text-white"
        >
          儲存
        </button>
      </form>
    </div>
  );
}
```

> 相對路徑核對：`records/new/page.tsx` 距 `maintenance/actions.ts` 為 `../../../actions`（records → [machineId] → maintenance）。實作時以編輯器確認 import 能解析；若 IDE 報錯即依實際層級調整。

- [ ] **Step 5: 型別檢查 + 手動驗證**

Run: `cd frontend && npx tsc --noEmit`
Expected：PASS。
手動：以 office 登入 → 新增保養卡 → 進詳情 → 新增維護紀錄 → 列表可搜尋機號 → 刪一列維護紀錄成功。

- [ ] **Step 6: Commit**

```bash
git add "frontend/src/app/admin/(protected)/maintenance"
git commit -m "feat(maintenance): 列表/建卡/詳情/維護列頁面 (#B)"
```

---

# Issue #C — 拍照 AI 辨識 + Review 匯入

**目標：** 行政拍男生卡 → Gemini vision 擷取結構化資料 → Review 可編輯畫面（以機號比對現有卡：命中附加 / 未命中建卡）→ 存檔匯入。稽核寫 `mx_import_drafts`。

## Task C1: 純函式 — 機號比對 + 辨識 JSON 正規化（TDD）

**Files:**
- Modify: `frontend/src/lib/admin/maintenance-normalize.ts`
- Modify: `frontend/src/lib/admin/maintenance-normalize.test.ts`

- [ ] **Step 1: 追加失敗測試**

在 `maintenance-normalize.test.ts` 追加：

```ts
import { normalizeSerial, parseExtraction } from "./maintenance-normalize";

describe("normalizeSerial", () => {
  it("lowercases and trims for matching", () => {
    expect(normalizeSerial("  B072303002 ")).toBe("b072303002");
    expect(normalizeSerial(null)).toBe("");
  });
});

describe("parseExtraction", () => {
  it("coerces AI json into typed draft, dropping empty rows", () => {
    const raw = {
      basic: { customer_name: "念德鋼鐵", serial_no: "B072303002", model: "PMV10" },
      records: [
        { service_date: "2024-06-12", hours: "8342", technician: "陳" },
        { service_date: "", hours: "", technician: "" }, // 全空 → 丟棄
      ],
    };
    const out = parseExtraction(raw);
    expect(out.basic.serial_no).toBe("B072303002");
    expect(out.records).toHaveLength(1);
    expect(out.records[0].hours).toBe("8342");
  });

  it("tolerates missing fields and non-array records", () => {
    const out = parseExtraction({});
    expect(out.basic.serial_no).toBe("");
    expect(out.records).toEqual([]);
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd frontend && npx vitest run src/lib/admin/maintenance-normalize.test.ts`
Expected：FAIL（`normalizeSerial` / `parseExtraction` 未定義）。

- [ ] **Step 3: 實作**

在 `maintenance-normalize.ts` 追加（沿用既有 `cleanText`）：

```ts
/** 機號比對用正規化：lower + trim。與 migration 的 unique index lower(btrim()) 對齊。 */
export function normalizeSerial(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

export interface ExtractedDraft {
  basic: {
    customer_name: string;
    serial_no: string;
    card_no: string;
    location: string;
    purchased_at: string;
    model: string;
    horsepower: string;
    voltage: string;
  };
  records: RecordPayload[];
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** 把 Gemini 回傳的 JSON 物件安全轉成型別化 draft；全空的維護列丟棄。 */
export function parseExtraction(raw: unknown): ExtractedDraft {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const b = (obj.basic ?? {}) as Record<string, unknown>;
  const rawRecords = Array.isArray(obj.records) ? obj.records : [];

  const records: RecordPayload[] = rawRecords
    .map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      return {
        service_date: cleanText(str(o.service_date)),
        hours: cleanText(str(o.hours)),
        oil: cleanText(str(o.oil)),
        oil_filter: cleanText(str(o.oil_filter)),
        air_filter: cleanText(str(o.air_filter)),
        oil_separator: cleanText(str(o.oil_separator)),
        inverter: cleanText(str(o.inverter)),
        filter_system: cleanText(str(o.filter_system)),
        technician: cleanText(str(o.technician)),
        note: cleanText(str(o.note)),
      };
    })
    .filter((r) => Object.values(r).some((v) => v !== null));

  return {
    basic: {
      customer_name: str(b.customer_name),
      serial_no: str(b.serial_no),
      card_no: str(b.card_no),
      location: str(b.location),
      purchased_at: str(b.purchased_at),
      model: str(b.model),
      horsepower: str(b.horsepower),
      voltage: str(b.voltage),
    },
    records,
  };
}
```

- [ ] **Step 4: 執行確認通過**

Run: `cd frontend && npx vitest run src/lib/admin/maintenance-normalize.test.ts`
Expected：PASS（全部 describe 綠）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/admin/maintenance-normalize.ts frontend/src/lib/admin/maintenance-normalize.test.ts
git commit -m "feat(maintenance): 機號正規化 + 辨識 JSON 解析純函式 + 測試 (#C)"
```

## Task C2: Gemini vision 擷取 `extractMaintenanceCard()`

**Files:**
- Modify: `frontend/src/lib/ai/gemini.ts`

沿用 [gemini.ts](../../../frontend/src/lib/ai/gemini.ts) 既有的 `getAiConfig()`（key/model）、`fetchGeminiWithRetry()`（重試/退避）。新增帶 image part 的擷取函式，回傳原始 JSON 物件（解析交給 `parseExtraction`）。

- [ ] **Step 1: 新增函式**

在 `gemini.ts` 末尾加入：

```ts
/**
 * 以 Gemini vision 從「男生卡」照片擷取保養資料，回傳原始 JSON 物件。
 * imageBase64 為不含 data: 前綴的 base64；mimeType 例 "image/jpeg"。
 * 解析/清洗交給 lib/admin/maintenance-normalize.parseExtraction。
 */
export async function extractMaintenanceCard(
  imageBase64: string,
  mimeType: string,
): Promise<{ raw: unknown; model: string }> {
  const { apiKey, model } = await getAiConfig();
  if (!apiKey) throw new Error(NO_KEY_ERROR);

  const prompt = `你是資料輸入助理。這是一張手寫的「空壓機保養記錄卡」照片（繁體中文 + 數字）。
請擷取內容並回傳「純 JSON 物件」，格式：
{
  "basic": {
    "customer_name": "客戶名稱", "serial_no": "機號", "card_no": "卡號(如KC054)",
    "location": "使用地點", "purchased_at": "購買時間(YYYY-MM-DD，不確定就留空)",
    "model": "機型", "horsepower": "馬力", "voltage": "電壓"
  },
  "records": [
    { "service_date": "日期(YYYY-MM-DD)", "hours": "時數", "oil": "專用油",
      "oil_filter": "機油濾清器", "air_filter": "空氣濾清器", "oil_separator": "油氣分離器",
      "inverter": "變頻器", "filter_system": "過濾系統", "technician": "維護員", "note": "備註" }
  ]
}
規則：
- 看不清楚或空白的欄位一律回空字串 ""，絕對不要猜測或編造。
- records 逐列輸出（表格每一橫列一筆），保留原始順序。
- 日期盡量正規化為 YYYY-MM-DD；無法判斷則原樣填字串。`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [
      {
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: imageBase64 } },
        ],
      },
    ],
    generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
  };

  const data = await fetchGeminiWithRetry(url, body);
  const text: string =
    (data as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
      ?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("辨識結果非 JSON，無法解析，請改用手動輸入。");
  }
  return { raw, model };
}
```

- [ ] **Step 2: 型別檢查**

Run: `cd frontend && npx tsc --noEmit`
Expected：PASS。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/ai/gemini.ts
git commit -m "feat(ai): Gemini vision 擷取保養卡 extractMaintenanceCard (#C)"
```

## Task C3: server actions — 辨識 + 匯入 + 稽核

**Files:**
- Modify: `frontend/src/app/admin/(protected)/maintenance/actions.ts`
- Modify: `frontend/src/lib/admin/maintenance.ts`（加 `findMachineBySerial`）

- [ ] **Step 1: DAL 加機號查卡**

在 `maintenance.ts` 追加（供比對命中判斷；用 session supabase）：

```ts
import { normalizeSerial } from "./maintenance-normalize";

/** 依機號（正規化後）找現有卡；命中回 {id, serial_no, customer_name}，否則 null。 */
export async function findMachineBySerial(
  serial: string,
): Promise<{ id: string; serial_no: string; customer_name: string } | null> {
  const norm = normalizeSerial(serial);
  if (!norm) return null;
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("mx_machines")
    .select("id, serial_no, mx_customers(name)")
    .ilike("serial_no", serial.trim());
  if (error) throw new Error(`查詢機號失敗：${error.message}`);
  const hit = (data ?? []).find(
    (m: { serial_no: string }) => normalizeSerial(m.serial_no) === norm,
  );
  if (!hit) return null;
  const h = hit as { id: string; serial_no: string; mx_customers: { name: string } | null };
  return { id: h.id, serial_no: h.serial_no, customer_name: h.mx_customers?.name ?? "" };
}
```

- [ ] **Step 2: 辨識 action（存稽核草稿）**

在 `maintenance/actions.ts` 追加。照片以 base64 由前端帶入（前端已壓縮，見 C4）：

```ts
import { requireRole } from "@/lib/admin/auth";
import { getServerSupabase } from "@/lib/supabase-server";
import { extractMaintenanceCard } from "@/lib/ai/gemini";
import { parseExtraction, type ExtractedDraft } from "@/lib/admin/maintenance-normalize";
import { findMachineBySerial } from "@/lib/admin/maintenance";
import { getCurrentUserRole } from "@/lib/admin/auth";

export type ExtractResult =
  | {
      ok: true;
      draft: ExtractedDraft;
      match: { id: string; serial_no: string; customer_name: string } | null;
      draftId: string;
    }
  | { ok: false; error: string };

/** 拍照辨識：Gemini 擷取 → 稽核草稿 → 機號比對。photoPath 為已存 Storage 的原圖 path。 */
export async function extractCardFromImageAction(input: {
  imageBase64: string;
  mimeType: string;
  photoPath: string;
}): Promise<ExtractResult> {
  await requireRole(["office"]);
  const supabase = await getServerSupabase();
  try {
    const { raw } = await extractMaintenanceCard(input.imageBase64, input.mimeType);
    const draft = parseExtraction(raw);

    const { data: user } = await supabase.auth.getUser();
    const { data: draftRow } = await supabase
      .from("mx_import_drafts")
      .insert({
        created_by: user.user?.id ?? null,
        photo_path: input.photoPath,
        raw_output: raw,
        status: "pending",
      })
      .select("id")
      .single();

    const match = await findMachineBySerial(draft.basic.serial_no);
    return {
      ok: true,
      draft,
      match,
      draftId: (draftRow as { id: string } | null)?.id ?? "",
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
```

- [ ] **Step 3: 匯入 commit action**

行政 review 後送回（可能已修改）的基本資訊 + 維護列 JSON。命中既有卡→只 insert 維護列；否則→建客戶+卡再 insert。

```ts
export interface CommitImportInput {
  draftId: string;
  machineId: string | null; // 命中既有卡則帶 id；否則 null → 依 basic 建卡
  basic: {
    customer_name: string;
    serial_no: string;
    card_no: string;
    location: string;
    purchased_at: string;
    model: string;
    horsepower: string;
    voltage: string;
  };
  records: RecordPayload[];
}

export async function commitImportAction(
  input: CommitImportInput,
): Promise<ActionResult & { machineId?: string }> {
  await requireRole(["office"]);
  const supabase = await getServerSupabase();
  try {
    let machineId = input.machineId;

    if (!machineId) {
      const serial = input.basic.serial_no.trim();
      if (!serial) return { ok: false, error: "機號為必填。" };
      const customerId = await findOrCreateCustomer(
        supabase,
        input.basic.customer_name || "（未命名客戶）",
      );
      const { data: machine, error: mErr } = await supabase
        .from("mx_machines")
        .insert({
          customer_id: customerId,
          serial_no: serial,
          card_no: input.basic.card_no || null,
          location: input.basic.location || null,
          purchased_at: input.basic.purchased_at || null,
          model: input.basic.model || null,
          horsepower: input.basic.horsepower || null,
          voltage: input.basic.voltage || null,
        })
        .select("id")
        .single();
      if (mErr) {
        if (mErr.code === "23505")
          return { ok: false, error: "此機號已存在，請改為附加到現有卡。" };
        return { ok: false, error: mErr.message };
      }
      machineId = (machine as { id: string }).id;
    }

    if (input.records.length > 0) {
      const { error: rErr } = await supabase.from("mx_records").insert(
        input.records.map((r) => ({ ...r, machine_id: machineId, source: "photo" as const })),
      );
      if (rErr) return { ok: false, error: `匯入維護紀錄失敗：${rErr.message}` };
    }

    await supabase
      .from("mx_import_drafts")
      .update({ status: "committed", machine_id: machineId })
      .eq("id", input.draftId);

    revalidatePath("/admin/maintenance");
    return { ok: true, machineId };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
```

> 註：`RecordPayload` 由 `@/lib/admin/maintenance-normalize` 匯入（在檔案頂部 import 中補上）。

- [ ] **Step 4: 型別檢查**

Run: `cd frontend && npx tsc --noEmit`
Expected：PASS。

- [ ] **Step 5: Commit**

```bash
git add "frontend/src/app/admin/(protected)/maintenance/actions.ts" frontend/src/lib/admin/maintenance.ts
git commit -m "feat(maintenance): 辨識/匯入/稽核 server actions + 機號比對 (#C)"
```

## Task C4: 拍照上傳 + Review 匯入頁

**Files:**
- Create: `frontend/src/app/admin/(protected)/maintenance/import/page.tsx`
- Create: `frontend/src/components/admin/maintenance/ImportReview.tsx`
- Create: `frontend/src/lib/admin/image-compress.ts`（client 端縮圖，純瀏覽器）

- [ ] **Step 1: client 端壓縮工具**

```ts
// frontend/src/lib/admin/image-compress.ts
"use client";
// 瀏覽器端把照片縮到長邊 <= maxEdge 並轉 JPEG base64，避開 Server Action 4.5MB 上限。

export interface CompressedImage {
  base64: string; // 不含 data: 前綴
  mimeType: "image/jpeg";
  dataUrl: string; // 供預覽
}

export async function compressImage(
  file: File,
  maxEdge = 1600,
  quality = 0.8,
): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("無法建立畫布");
  ctx.drawImage(bitmap, 0, 0, w, h);
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  return { base64: dataUrl.split(",")[1] ?? "", mimeType: "image/jpeg", dataUrl };
}
```

- [ ] **Step 2: ImportReview 客戶端元件**

串起：選檔 → 壓縮 → 呼叫辨識 action → 顯示比對結果 + 可編輯 `CardBasicFields`/逐列 `RecordFields` → 呼叫 commit action。原圖上傳沿用 `createMediaUploadUrl`（[storage.ts](../../../frontend/src/lib/admin/storage.ts)，folder 用 `maintenance`）。

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { compressImage } from "@/lib/admin/image-compress";
import { createMediaUploadUrl } from "@/lib/admin/storage";
import { CardBasicFields } from "./CardBasicForm";
import { RecordFields } from "./RecordForm";
import {
  extractCardFromImageAction,
  commitImportAction,
  type ExtractResult,
} from "@/app/admin/(protected)/maintenance/actions";
import type { ExtractedDraft } from "@/lib/admin/maintenance-normalize";

export function ImportReview() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<ExtractResult, { ok: true }> | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const img = await compressImage(file);
      setPreview(img.dataUrl);

      // 原圖上傳 Storage（稽核）。以壓縮後 JPEG 直傳。
      const blob = await (await fetch(img.dataUrl)).blob();
      const signed = await createMediaUploadUrl({
        folder: "maintenance",
        filename: "card.jpg",
        contentType: "image/jpeg",
        size: blob.size,
      });
      let photoPath = "";
      if (signed.ok) {
        await fetch(signed.url, {
          method: "PUT",
          headers: { "content-type": "image/jpeg" },
          body: blob,
        });
        photoPath = signed.path;
      }

      const res = await extractCardFromImageAction({
        imageBase64: img.base64,
        mimeType: img.mimeType,
        photoPath,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onSave(fd: FormData) {
    if (!result) return;
    setBusy(true);
    setError(null);
    try {
      const basic = {
        customer_name: String(fd.get("customer_name") ?? ""),
        serial_no: String(fd.get("serial_no") ?? ""),
        card_no: String(fd.get("card_no") ?? ""),
        location: String(fd.get("location") ?? ""),
        purchased_at: String(fd.get("purchased_at") ?? ""),
        model: String(fd.get("model") ?? ""),
        horsepower: String(fd.get("horsepower") ?? ""),
        voltage: String(fd.get("voltage") ?? ""),
      };
      // 逐列收集：欄位以 records[i][field] 命名
      const records = collectRecords(fd, result.draft.records.length);
      const out = await commitImportAction({
        draftId: result.draftId,
        machineId: result.match?.id ?? null,
        basic,
        records,
      });
      if (!out.ok) {
        setError(out.error);
        return;
      }
      router.push(`/admin/maintenance/${out.machineId}`);
    } finally {
      setBusy(false);
    }
  }

  if (!result) {
    return (
      <div className="flex flex-col gap-4">
        <label className="border-border hover:bg-surface-muted flex h-40 cursor-pointer items-center justify-center rounded-xl border border-dashed text-[15px]">
          {busy ? "辨識中…" : "點此拍照 / 選擇男生卡照片"}
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} disabled={busy} />
        </label>
        {error && <p className="text-[14px] text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <form action={onSave} className="flex flex-col gap-6">
      {preview && <img src={preview} alt="男生卡" className="max-h-64 self-start rounded-lg border" />}
      <div className="rounded-lg bg-surface-muted p-3 text-[14px]">
        {result.match
          ? `比對到既有卡：機號 ${result.match.serial_no}／客戶 ${result.match.customer_name}。將附加 ${result.draft.records.length} 列維護紀錄。`
          : `未比對到既有卡，將建立新卡。請確認基本資訊。`}
      </div>

      {!result.match && (
        <section>
          <h2 className="text-ink mb-3 text-[16px] font-bold">基本資訊</h2>
          <CardBasicFields values={result.draft.basic} />
        </section>
      )}

      <section>
        <h2 className="text-ink mb-3 text-[16px] font-bold">維護紀錄（{result.draft.records.length}）</h2>
        <div className="flex flex-col gap-6">
          {result.draft.records.map((r, i) => (
            <fieldset key={i} className="border-border rounded-lg border p-4">
              <legend className="text-text-muted px-2 text-[13px]">第 {i + 1} 列</legend>
              <RecordFieldsIndexed index={i} values={r} />
            </fieldset>
          ))}
        </div>
      </section>

      {error && <p className="text-[14px] text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="bg-primary hover:bg-primary-deep h-11 self-start rounded-lg px-6 text-[15px] font-semibold text-white disabled:opacity-50"
      >
        {busy ? "儲存中…" : "確認並儲存到女生卡"}
      </button>
    </form>
  );
}
```

> `RecordFieldsIndexed` 與 `collectRecords`：把 `RecordFields` 的欄位名改成 `records[i][field]` 以便一次送多列。在同檔補這兩個 helper：

```tsx
import type { RecordValues } from "./RecordForm";
import type { RecordPayload } from "@/lib/admin/maintenance-normalize";

const RECORD_FIELDS: (keyof RecordValues)[] = [
  "service_date", "hours", "oil", "oil_filter", "air_filter",
  "oil_separator", "inverter", "filter_system", "technician", "note",
];
const RECORD_LABELS: Record<keyof RecordValues, string> = {
  service_date: "日期", hours: "時數", oil: "專用油", oil_filter: "機油濾清器",
  air_filter: "空氣濾清器", oil_separator: "油氣分離器", inverter: "變頻器",
  filter_system: "過濾系統", technician: "維護員", note: "備註",
};

function RecordFieldsIndexed({ index, values }: { index: number; values?: RecordValues }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {RECORD_FIELDS.map((f) => (
        <div key={f} className="flex flex-col gap-1.5">
          <label className="text-ink text-[14px] font-medium">{RECORD_LABELS[f]}</label>
          <input
            name={`records[${index}][${f}]`}
            type={f === "service_date" ? "date" : "text"}
            defaultValue={values?.[f] ?? ""}
            className="border-border focus:border-primary h-11 rounded-lg border px-3 text-[15px] outline-none"
          />
        </div>
      ))}
    </div>
  );
}

function collectRecords(fd: FormData, count: number): RecordPayload[] {
  const rows: RecordPayload[] = [];
  for (let i = 0; i < count; i++) {
    const get = (f: string) => {
      const v = String(fd.get(`records[${i}][${f}]`) ?? "").trim();
      return v === "" ? null : v;
    };
    rows.push({
      service_date: get("service_date"), hours: get("hours"), oil: get("oil"),
      oil_filter: get("oil_filter"), air_filter: get("air_filter"),
      oil_separator: get("oil_separator"), inverter: get("inverter"),
      filter_system: get("filter_system"), technician: get("technician"), note: get("note"),
    });
  }
  return rows.filter((r) => Object.values(r).some((v) => v !== null));
}
```

- [ ] **Step 3: import 頁**

```tsx
// maintenance/import/page.tsx
import { requireRole } from "@/lib/admin/auth";
import { ImportReview } from "@/components/admin/maintenance/ImportReview";

export const metadata = { title: "拍照辨識 · 後台" };

export default async function ImportPage() {
  await requireRole(["office"]);
  return (
    <div className="mx-auto max-w-[1000px]">
      <h1 className="text-ink mb-2 text-[24px] font-bold">拍照辨識</h1>
      <p className="text-text-muted mb-6 text-[14px]">
        拍下男生卡，AI 會擷取內容供你確認、修改後再存入女生卡。
      </p>
      <ImportReview />
    </div>
  );
}
```

- [ ] **Step 4: 型別檢查**

Run: `cd frontend && npx tsc --noEmit`
Expected：PASS。（確認 `createMediaUploadUrl` 回傳含 `path`/`url`；若 signed upload 用法與 storage.ts 不同，依實際簽章調整 PUT 段。）

- [ ] **Step 5: 手動驗證**

以 office 登入 → 拍照辨識 → 選一張保養卡照片 → 應看到辨識預填的基本資訊 + 維護列，可修改 → 存檔 → 導到卡詳情，維護列已匯入、`source='photo'`；`mx_import_drafts` 有一筆 `status='committed'`。用既有機號的卡再辨識一次 → 應顯示「比對到既有卡…將附加」。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/admin/image-compress.ts frontend/src/components/admin/maintenance/ImportReview.tsx "frontend/src/app/admin/(protected)/maintenance/import/page.tsx"
git commit -m "feat(maintenance): 拍照上傳 + Review 匯入頁 (#C)"
```

## Task C5: 全套測試 + 格式 + 收尾

- [ ] **Step 1: 跑全套前端檢查（CI 對齊）**

Run:
```bash
cd frontend && npm run format && npx tsc --noEmit && npx eslint . && npx vitest run
```
Expected：全 PASS。（CI 會先跑 `format:check`，故先 `npm run format`；見專案記憶 ci-frontend-checks。）

- [ ] **Step 2: Commit（若 format 有變動）**

```bash
git add -A && git commit -m "chore(maintenance): format + 收尾 (#C)"
```

---

## Self-Review（作者自檢，已完成）

- **Spec 覆蓋**：§4 角色→A2/A3/A5；§4.1 隔離→A1 RLS；§5 資料表→A1；§6 AI→C1/C2/C3；§6.2 流程→C3/C4；§7 頁面→A4/B5/C4；§9 錯誤處理→C2（JSON/no-key）、B3/C3（23505 唯一鍵）；§10 測試→B2/C1；§11 邊界→C1（多列/全空列）、C3（比對）。全數對應到任務。
- **Placeholder 掃描**：無 TODO/TBD；每段 code step 皆含實際程式碼與指令。
- **型別一致**：`RecordPayload` / `ExtractedDraft` / `MxRecord` 於各任務名稱一致；`extractMaintenanceCard`→`parseExtraction`→`commitImportAction` 串接一致。
- **已知需實作時核對項**（非 placeholder，屬與既有程式碼對接的驗證點，已於步驟標註）：`ActionResult` 形狀、`AdminTable` 的 `onReorder` 是否必填、`createMediaUploadUrl` signed PUT 用法、`maintenance/[machineId]/records/new` 對 `actions.ts` 的相對路徑層數。
