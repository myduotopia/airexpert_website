# ERP 模組（進銷存・廠商採購・應收應付對帳・機器零件庫存）設計規格

- 日期：2026-09-15
- 狀態：設計已核可，待拆 issue 實作
- 參考單據：勁賀空壓「客戶銷貨單 S11509047」、「廠商採購單 P11509008」（現行千奧 ERP 列印）

## 1. 目標與範圍

在 airexpert 後台（`/admin/erp`）建立基本 ERP，最終**完全取代**現行千奧 ERP。

### 1.1 本期要做

| 模組 | 內容 |
|---|---|
| 權限 | 模組授權 `erp`，初期僅 `office@airexpert.com.tw` |
| 基本資料 | 品項（整機／零件耗材／服務／費用）、倉庫、廠商、客戶（共用 `mx_customers` 並擴充） |
| 採購 | 採購單 P → 進貨單 I（可分批、驗收入庫）→ 進退單 PR |
| 銷售 | 報價單 Q → 銷貨單 S → 銷退單 SR；銷貨過帳自動建立保養卡機台 |
| 庫存 | 各倉庫存量、機號（逐台）追蹤、調撥單 T、盤點調整單 A、庫存異動明細、低庫存清單、移動加權平均成本 |
| 應收應付 | 收款／付款（現金／匯款／支票含票號票期）、沖銷單據、預收預付、月結對帳單 |
| 列印 | A4 列印：報價、銷貨、採購、進貨、對帳單（版面參考現行單據） |
| 報表 | 銷售與毛利（依客戶／品項／業務）、應收帳齡、應付總表 |

### 1.2 本期不做（明確排除）

- 千奧 ERP 舊資料匯入（之後另開專案；資料在客戶公司內部）
- 電子發票串接（發票號碼手填）
- 客戶訂單／訂金單（訂金以「預收款」處理）
- 庫存保留／預約（如「預轉華淨科技」先寫在備註）
- 保養紀錄耗用零件自動扣庫存
- 會計總帳（傳票、科目、損益表）
- 後台 UI 管理模組授權（本期以 migration seed 授權；之後可在「人員管理」加開關）

## 2. 架構

**Next.js server actions ＋ Postgres（plpgsql）函式**，與保養卡模組相同模式；不使用 FastAPI。

- 讀取：server component 以 `getServerSupabase()`（使用者 session，受 RLS 約束）查詢，集中在 `frontend/src/lib/erp/*.ts`（server-only）。
- 一般 CRUD（草稿單據、基本資料）：server action → `getServerSupabase()`，RLS 把關。
- **會動庫存或金額的操作一律呼叫 RPC**（單一交易、原子性）：
  - `erp_post_document(p_doc_id uuid)` 過帳
  - `erp_void_document(p_doc_id uuid, p_reason text)` 作廢
  - `erp_post_payment(p_payment jsonb)` / `erp_void_payment(p_payment_id uuid, p_reason text)`
  - `erp_next_doc_no(p_prefix text, p_date date)` 取號（過帳或存草稿時取）
- RPC 皆 `security invoker`（RLS 仍生效），函式開頭 `if not has_module('erp') then raise exception 'forbidden'`。
- 金額與稅額的「前端即時試算」用 TS 純函式 `frontend/src/lib/erp/calc.ts`；**DB 過帳時以 SQL 重新計算為準**，兩者邏輯一致並各自有測試。
- 日期：DB 存西元 `date`；顯示／輸入沿用 `frontend/src/lib/admin/minguo.ts`（民國制）。

### 2.0 RPC／View 介面契約（前後端共同依據）

| 函式 | 回傳 |
|---|---|
| `erp_next_doc_no(p_prefix text, p_date date)` | `text` |
| `erp_post_document(p_doc_id uuid)` | `jsonb {doc_no, warnings: text[], mx_machine_ids: uuid[]}` |
| `erp_void_document(p_doc_id uuid, p_reason text)` | `jsonb {warnings: text[]}` |
| `erp_post_payment(p_payment jsonb)` | `jsonb {id, doc_no}`；payload `{direction, pay_date, customer_id?, vendor_id?, method, amount, check_no?, check_due_date?, bank?, check_status?, note?, allocations: [{document_id, amount}]}` |
| `erp_allocate_payment(p_payment_id uuid, p_allocations jsonb)` | `void` |
| `erp_void_payment(p_payment_id uuid, p_reason text)` | `void` |

錯誤：`raise exception '<code>' using errcode = 'P0001', detail = '<中文訊息>'` → supabase-js `error.message = code`、`error.details = 中文訊息`。

Views（`security_invoker = true`）：
- `erp_document_balances(document_id, doc_type, doc_no, doc_date, customer_id, vendor_id, total_twd, allocated, outstanding)`：已過帳 S/SR/I/PR；SR/PR 的 total_twd 為負值。
- `erp_party_balances(party_type 'customer'|'vendor', party_id, balance, unallocated)`
- `erp_purchase_line_progress(line_id, document_id, item_id, qty, received_qty, remaining_qty)`
- `erp_purchase_progress(document_id, status 'open'|'partial'|'closed')`

### 2.1 目錄配置

```
supabase/migrations/0020_erp_foundation.sql      # 權限 + 全部 erp_* 表 + RPC + seed
supabase/tests/erp_posting_test.sql              # begin; … 斷言 … rollback;
frontend/src/lib/admin/auth.ts                   # + getCurrentModules / requireModule
frontend/src/lib/admin/nav-config.ts             # + modules 欄位、group、navForUser
frontend/src/lib/erp/                            # server-only 查詢 + 純函式
  types.ts  calc.ts  doc-no.ts  queries/*.ts
frontend/src/components/erp/                     # 共用 UI
  ItemPicker  CustomerPicker  VendorPicker  WarehousePicker  SerialPicker
  DocumentLinesEditor  DocumentHeaderFields  DocStatusBadge  MoneyText  RocDateInput
frontend/src/app/admin/(protected)/erp/
  layout.tsx                                     # requireModule('erp')
  page.tsx                                       # ERP 總覽
  items/ warehouses/ vendors/ customers/
  quotes/ sales/ sales-returns/
  purchases/ receipts/ purchase-returns/
  inventory/ (存量) inventory/serials/ inventory/moves/ transfers/ adjustments/
  collections/ (收款) disbursements/ (付款) statements/
  reports/
  print/[docId]/ print/statement/
```

## 3. 權限

### 3.1 DB

```sql
create table admin_module_grants (
  user_id    uuid not null references auth.users(id) on delete cascade,
  module     text not null check (module in ('erp')),
  created_at timestamptz not null default now(),
  primary key (user_id, module)
);
alter table admin_module_grants enable row level security;
create policy "read own grants" on admin_module_grants
  for select to authenticated using (user_id = auth.uid());
-- 寫入僅 service_role / SQL Editor

create or replace function has_module(p_module text) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from admin_module_grants g
                 where g.user_id = auth.uid() and g.module = p_module);
$$;
revoke execute on function has_module(text) from public, anon;
grant execute on function has_module(text) to authenticated;

-- seed：僅 office@airexpert.com.tw
insert into admin_module_grants (user_id, module)
select id, 'erp' from auth.users where lower(email) = 'office@airexpert.com.tw'
on conflict do nothing;
```

- 所有 `erp_*` 表：`enable row level security` + `"erp all <t>" for all to authenticated using (has_module('erp')) with check (has_module('erp'))`。
- `mx_customers`：既有 `"office all mx_customers"` 保留，新增 `"erp all mx_customers"`（`has_module('erp')`）。`mx_machines` 同理新增 erp policy（銷貨過帳要寫入機台、ERP 客戶頁要讀機台）。

### 3.2 前端

- `auth.ts` 新增：
  - `export type AdminModule = "erp"`
  - `getCurrentModules = cache(async (): Promise<AdminModule[]>)`：讀 `admin_module_grants`。
  - `requireModule(module: AdminModule): Promise<void>`：無授權 `redirect("/admin")`（已登入後台者回總覽，不是登入頁）。
- `(protected)/erp/layout.tsx` 呼叫 `requireModule("erp")`；**每個 ERP server action 開頭也要呼叫**（layout 不保護 action）。
- `nav-config.ts`：
  - `AdminNavItem` 新增 `modules?: AdminModule[]` 與 `group?: string`。
  - 新增 `navForUser(role, modules)`：有 `modules` 的項目 → 只要使用者擁有其中任一模組即可見（**忽略 roles**）；無 `modules` 的項目 → 沿用 `navForRole` 規則。
  - `navForRole` 保留（向下相容），ERP 項目不出現在其結果中。
  - `AdminSidebar` 依 `group` 顯示分組標題「ERP」。
- `(protected)/layout.tsx` 取 `getCurrentModules()` 傳給 sidebar。

## 4. 資料模型

以下為欄位語意草稿（`uuid pk` = `uuid primary key default gen_random_uuid()`）；migration 內建表順序須依 FK 相依：warehouses → vendors → items → documents → lines → serials → line_serials → stock → payments。unique 含運算式者以 unique index 實作。
金額 `numeric(14,2)`、數量 `numeric(12,3)`、單位成本 `numeric(14,4)`。所有表有 `created_at`、可變動表有 `updated_at`、`created_by uuid default auth.uid()`。

### 4.1 基本資料

```sql
create table erp_warehouses (
  id uuid pk, code text not null, name text not null,
  is_default boolean not null default false, active boolean not null default true, note text
);  -- unique lower(btrim(code)); 至多一個 is_default（partial unique）
-- seed：('MAIN','總倉', is_default=true)

create table erp_items (
  id uuid pk,
  code text not null,                      -- 產品編號 ALH-15AI；unique lower(btrim(code))
  name text not null,                      -- 品名規格
  kind text not null check (kind in ('machine','part','service','expense')),
                                           -- 整機 / 零件耗材 / 服務 / 費用
  unit text not null default '台',
  track_serial boolean not null default false,  -- 整機預設 true；service/expense 不得為 true
  track_stock  boolean not null default true,   -- service/expense 強制 false
  mx_card_type text check (mx_card_type in ('compressor','filter')),
                                           -- 非 null → 銷貨過帳時建立保養卡機台
  brand text, model text,                  -- model 帶入 mx_machines.model
  sale_price numeric(14,2), purchase_price numeric(14,2),  -- 預設帶入單價
  avg_cost numeric(14,4) not null default 0,               -- 移動加權平均（全公司）
  safety_stock numeric(12,3) not null default 0,
  default_vendor_id uuid references erp_vendors(id),
  product_id uuid references products(id) on delete set null,  -- 選填，連官網商品
  active boolean not null default true, note text
);

create table erp_vendors (
  id uuid pk, code text not null,          -- KA405；unique lower(btrim(code))
  name text not null, tax_id text, contact_person text, phone text, fax text,
  email text, address text, currency text not null default 'TWD',
  payment_terms text,                      -- 自由文字：月結30天、票期60天…
  active boolean not null default true, note text
);

-- mx_customers 擴充
alter table mx_customers
  add column tax_id text,                  -- 統一編號
  add column invoice_title text,           -- 發票抬頭
  add column delivery_address text,        -- 送貨地址（address 為聯絡地址）
  add column payment_terms text,
  add column sales_rep text,               -- 業務
  add column erp_active boolean not null default true;
create unique index mx_customers_code_key on mx_customers (lower(btrim(code)))
  where code is not null and btrim(code) <> '';   -- 現有 4 筆已確認無重複
```

### 4.2 單據

```sql
create table erp_documents (
  id uuid pk,
  doc_type text not null check (doc_type in ('Q','P','I','PR','S','SR','T','A')),
  doc_no text,                             -- 取號後填入；unique (doc_no)
  doc_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft','posted','voided')),
  customer_id uuid references mx_customers(id) on delete restrict,  -- Q/S/SR
  vendor_id   uuid references erp_vendors(id)  on delete restrict,  -- P/I/PR
  warehouse_id    uuid references erp_warehouses(id),  -- I/PR/S/SR/A 出入倉；T 為來源倉
  to_warehouse_id uuid references erp_warehouses(id),  -- 僅 T
  source_doc_id uuid references erp_documents(id),     -- Q→S、P→I、S→SR、I→PR
  -- 表頭快照（列印用，客戶/廠商資料之後改動不影響舊單）
  party_name text, party_tax_id text, party_contact text, party_phone text, party_address text,
  sales_rep text,
  tax_type text not null default 'excluded' check (tax_type in ('excluded','included','exempt')),
  tax_rate numeric(5,4) not null default 0.05,
  currency text not null default 'TWD', exchange_rate numeric(12,6) not null default 1,
  amount_untaxed numeric(14,2) not null default 0,
  tax_amount     numeric(14,2) not null default 0,
  total_amount   numeric(14,2) not null default 0,   -- 以單據幣別
  total_twd      numeric(14,2) not null default 0,   -- 應收應付以此計
  invoice_no text,
  expected_date date,                      -- P：交貨日期；Q：報價有效期限
  note text,                               -- 備註（如「備庫 / 預轉華淨科技」）
  posted_at timestamptz, posted_by uuid,
  voided_at timestamptz, voided_by uuid, void_reason text,
  -- 約束
  check (doc_type not in ('Q','S','SR') or customer_id is not null),
  check (doc_type not in ('P','I','PR') or vendor_id is not null),
  check (doc_type <> 'T' or (warehouse_id is not null and to_warehouse_id is not null
                             and warehouse_id <> to_warehouse_id))
);

create table erp_document_lines (
  id uuid pk,
  document_id uuid not null references erp_documents(id) on delete cascade,
  line_no int not null,
  line_type text not null check (line_type in ('item','discount','note')),
  item_id uuid references erp_items(id) on delete restrict,   -- line_type='item' 必填
  description text,                        -- 品名規格（預設帶品項名稱，可改）
  qty numeric(12,3) not null default 0,    -- A 單可為負（盤虧）
  unit_price numeric(14,2) not null default 0,
  amount numeric(14,2) not null default 0, -- item: qty*unit_price；discount: 負數；note: 0
  unit_cost numeric(14,4),                 -- 過帳時寫入：S/SR/PR/T/A 取當下成本；I 取進價*匯率
  source_line_id uuid references erp_document_lines(id),  -- I 行 → P 行（分批到貨）；SR 行 → S 行
  serial_nos text[],                       -- 入庫「新機號」（I、A 盤盈）：草稿時序號尚未存在，過帳時建立 erp_serials 並寫入 line_serials
  unique (document_id, line_no)
);
-- 既有機號（S、SR、PR、T、A 盤虧）草稿時即寫 erp_document_line_serials
-- erp_document_line_serials 另有 mx_machine_id、mx_machine_created（S 過帳時記錄建立或連結的保養卡機台，
-- 作廢只刪除「本單建立」且無保養紀錄的機台）

-- 實作補充（migration 0020 header 有完整列表）：
-- · 入庫新機號與既有機號（任何狀態）重複 → serial_unavailable，不重用舊列
-- · SR/PR 超過來源行數量 → validation；I 超過 P 行未到貨量 → over_receipt
-- · 作廢的反向異動日期 = 作廢當日；S/I/SR/PR 有沖銷皆擋作廢
-- · 沖銷後 outstanding 必須介於 0 與單據總額之間；Σ沖銷介於 0 與收付款金額之間

create table erp_document_line_serials (
  line_id uuid not null references erp_document_lines(id) on delete cascade,
  serial_id uuid not null references erp_serials(id) on delete restrict,
  primary key (line_id, serial_id)
);

create table erp_doc_sequences (
  prefix text not null, period text not null,   -- period = 民國年月 '11509'
  last_no int not null default 0,
  primary key (prefix, period)
);
```

**單號規則**：`prefix + 民國年(3) + 月(2) + 流水號(3，超過 999 自然變 4 位)`。
例：`S11509047`、`P11509008`、`SR11509001`。收款 `RC`、付款 `PM`。
取號時機：**過帳時**（草稿沒有單號，避免作廢草稿造成跳號）；報價單 Q 於「確認」（= post）時取號。
`erp_next_doc_no` 以 `insert … on conflict do update set last_no = last_no + 1 returning` 保證併發安全。

### 4.3 庫存

```sql
create table erp_serials (
  id uuid pk,
  item_id uuid not null references erp_items(id),
  serial_no text not null,                 -- 機號，如 26-PM15060010
  status text not null check (status in ('in_stock','sold','returned_to_vendor','written_off')),
  warehouse_id uuid references erp_warehouses(id),   -- in_stock 時必填
  customer_id uuid references mx_customers(id),      -- sold 時
  unit_cost numeric(14,4),                 -- 該台進貨成本
  in_doc_id uuid references erp_documents(id), out_doc_id uuid references erp_documents(id),
  mx_machine_id uuid references mx_machines(id) on delete set null,
  unique (item_id, lower(btrim(serial_no)))   -- 以 unique index 實作
);

create table erp_stock_levels (
  item_id uuid references erp_items(id), warehouse_id uuid references erp_warehouses(id),
  qty numeric(12,3) not null default 0,
  primary key (item_id, warehouse_id)
);

create table erp_stock_moves (             -- 庫存帳（只增不改）
  id uuid pk, moved_at timestamptz not null default now(), move_date date not null,
  item_id uuid not null, warehouse_id uuid not null,
  qty numeric(12,3) not null,              -- 入 +、出 −
  unit_cost numeric(14,4) not null,
  document_id uuid not null references erp_documents(id),
  line_id uuid references erp_document_lines(id),
  is_reversal boolean not null default false
);
```

### 4.4 應收應付

```sql
create table erp_payments (
  id uuid pk,
  direction text not null check (direction in ('in','out')),  -- in=收款(客戶) out=付款(廠商)
  doc_no text unique,                      -- RC11509001 / PM11509001
  pay_date date not null,
  customer_id uuid references mx_customers(id), vendor_id uuid references erp_vendors(id),
  method text not null check (method in ('cash','transfer','check','other')),
  amount numeric(14,2) not null check (amount > 0),   -- TWD
  check_no text, check_due_date date, bank text,
  check_status text check (check_status in ('pending','cleared','bounced')),
  status text not null default 'posted' check (status in ('posted','voided')),
  voided_at timestamptz, void_reason text, note text,
  check ((direction = 'in' and customer_id is not null and vendor_id is null)
      or (direction = 'out' and vendor_id is not null and customer_id is null)),
  check (method <> 'check' or (check_no is not null and check_due_date is not null))
);

create table erp_payment_allocations (
  id uuid pk,
  payment_id uuid not null references erp_payments(id) on delete cascade,
  document_id uuid not null references erp_documents(id),   -- S/SR（收款）或 I/PR（付款）
  amount numeric(14,2) not null            -- 對 SR/PR（退款沖銷）可為負
);
```

未沖銷金額 = `payment.amount − sum(allocations)` → 即**預收／預付**，可於之後沖到新單據（如「09/02 已匯訂金 $70,000」先登收款、銷貨單過帳後沖銷）。

View（`security_invoker = true`）：
- `erp_document_balances`：每張已過帳 S/SR/I/PR 的 `total_twd`、`allocated`、`outstanding`。
- `erp_party_balances`：每客戶／廠商的應收（付）餘額、未沖銷預收（付）。

## 5. 過帳規則（`erp_post_document`）

共通：
1. 鎖定單據 `select … for update`；必須 `status='draft'`，否則 raise。
2. 驗證：至少一行；`item` 行需 `item_id` 且 `qty <> 0`；`track_serial` 品項（Q、P 除外）需 `qty` 為正整數且序號數 = qty。
3. 以 SQL 重算金額（§5.1），寫回表頭與各行 `amount`。
4. 取號、`status='posted'`、`posted_at/by`。
5. 快照客戶／廠商資料到 `party_*`（草稿時也可先帶入，過帳時若空則補）。

### 5.1 稅額計算（TS `calc.ts` 與 SQL 一致）

- `subtotal = Σ amount`（item：`round(qty × unit_price, 2)`；discount：使用者輸入負數；note：0）
- `excluded`（外加）：`amount_untaxed = subtotal`；`tax = round(subtotal × rate)`；`total = subtotal + tax`
- `included`（內含）：`total = subtotal`；`amount_untaxed = round(total / (1 + rate))`；`tax = total − amount_untaxed`
- `exempt`：`tax = 0`；`total = amount_untaxed = subtotal`
- TWD 取整數（`round(x, 0)`）；外幣取 2 位。`total_twd = round(total × exchange_rate, 0)`。
- 範例：S11509047 行合計 195,000+50,000+20,000+8,000−38,000 = 235,000（該單據為內含或免稅，總計 235,000）。

### 5.2 各單別的庫存與成本效果

僅 `track_stock = true` 的 `item` 行產生庫存異動。成本以 **TWD、全公司（不分倉）移動加權平均**。
記號：`Q0` = 過帳前全倉總量、`C0` = 過帳前 `avg_cost`。

| 單別 | 庫存 | 成本 | 序號 | 其他 |
|---|---|---|---|---|
| Q 報價 | 無 | 無 | 可不選 | 僅定稿、取號 |
| P 採購 | 無 | 無 | 無 | 行的「已到貨量」= Σ 對應 I 行 qty（view 計算），狀態：未到貨／部分到貨／已結案 |
| I 進貨 | `warehouse_id` +qty | `in_cost = unit_price × exchange_rate`（行上若有折扣行則按金額比例分攤）；`C1 = (Q0·C0 + qty·in_cost) / (Q0 + qty)`；若 `Q0 < 0` 或 `Q0 + qty ≤ 0` → `C1 = in_cost` | 建立 `erp_serials`（in_stock、unit_cost=in_cost），序號於此單輸入 | 若 `source_line_id` 指向 P 行，不得超收（raise） |
| PR 進退 | −qty | `C1 = (Q0·C0 − qty·ret_cost) / (Q0 − qty)`，`ret_cost` = 原進貨行 `unit_cost`（無來源行則用 `C0`）；`Q0 − qty ≤ 0` → `C1 = C0` | 序號須 in_stock → `returned_to_vendor` | |
| S 銷貨 | −qty | `unit_cost = C0`（寫入行，毛利用），avg 不變 | 序號須 in_stock 且在該倉 → `sold`、`customer_id`；**若品項 `mx_card_type` 非 null，建立 `mx_machines`**（customer_id、card_type、serial_no、model=item.model ?? item.name、purchased_at=doc_date），寫回 `erp_serials.mx_machine_id` | 若同客戶已有相同 (card_type, serial_no) 的未封存機台 → 直接連結不重建 |
| SR 銷退 | +qty | 入庫成本 = 原銷貨行 `unit_cost`（無來源行用 `C0`），依 I 公式重算 avg | 序號須 sold 且 `customer_id` 相同 → `in_stock`、清 `customer_id`；**不刪除保養卡機台**（保留歷史） | |
| T 調撥 | 來源倉 −qty、目的倉 +qty | 不變 | 序號須在來源倉 → 改 `warehouse_id` | |
| A 盤點調整 | ±qty | 盤盈（+）以 `C0` 入帳，avg 不變；盤虧（−）以 `C0` 出帳 | 盤盈需輸入新序號（建立 in_stock）；盤虧需選 in_stock 序號 → `written_off` | 行需填原因（description） |

**負庫存**：出庫（S、PR、T 來源倉、A 盤虧）後該倉 qty < 0 → raise `insufficient_stock`，錯誤訊息帶品項代碼與倉庫。

### 5.3 作廢（`erp_void_document`）

- 只能作廢 `posted`；草稿直接刪除（server action `deleteDraft`）。
- Q：直接 voided。
- P：若已有已過帳 I 引用 → raise（需先作廢進貨單）。
- S/I：若有 `erp_payment_allocations` → raise（需先作廢或調整收付款）；若有已過帳 SR/PR 引用 → raise。
- 庫存：對該單所有 `erp_stock_moves` 寫入反向列（`is_reversal = true`），更新 `erp_stock_levels`；負庫存檢查同過帳。
- 成本：以反向公式回推（I 作廢 = 視同 PR 以原 `unit_cost` 出；SR 作廢 = 視同 S 以原 `unit_cost` 出並重算 avg；S 作廢 = 視同 SR；PR 作廢 = 視同 I）。此為近似法（中間若有其他異動不重播），**本期接受**，於 spec 註明。
- 序號：狀態回復到過帳前（I 作廢 → 序號必須仍 in_stock 才可作廢，刪除該序號；S 作廢 → 序號回 in_stock、原倉；由 S 建立的 `mx_machines` 若無任何 `mx_records` 則刪除，有紀錄則保留並清 `erp_serials.mx_machine_id` 連結、回傳警告）。
- 寫入 `status='voided'`、`voided_at/by`、`void_reason`（必填）。單號保留不重用。

### 5.4 收付款

- `erp_post_payment(p jsonb)`：建立 payment（取號 RC/PM）+ allocations；驗證每筆 allocation 的單據屬於同一客戶／廠商、單別正確（收款 → S/SR、付款 → I/PR）、`status='posted'`、沖銷後 `outstanding` 不得反向超沖（S：沖後 ≥ 0；SR：沖後 ≤ 0）、`Σ allocations ≤ amount`（允許小於 → 餘額為預收付）。
- 之後補沖銷：`erp_allocate_payment(p_payment_id, p_allocations jsonb)`，規則同上。
- `erp_void_payment`：刪除 allocations、`status='voided'`。
- 支票狀態更新（兌現／退票）為一般 update；退票不自動沖回，UI 提示使用者作廢該收款。

### 5.5 月結對帳單

- 參數：客戶或廠商、期間（預設上個月 1 日～月底，可自訂起訖）。
- 期初餘額 = 起日前已過帳單據 `total_twd`（S、I 為 +；SR、PR 為 −）− 起日前已過帳收付款 `amount`。
- 本期明細：期間內已過帳單據（日期、單號、摘要、金額）與收付款（日期、單號、方式／票號票期、金額），依日期排序，逐列累計餘額。
- 期末餘額 = 期初 + 本期單據 − 本期收付款。
- 作廢單據不列入。頁面提供「列印」（見 §7）。

## 6. 畫面

所有列表：搜尋（單號／客戶／廠商／品項）、日期區間（民國）、狀態篩選、分頁（每頁 50）。
所有表單：民國日期輸入、金額千分位顯示、儲存草稿／過帳／作廢（作廢需填原因，二次確認）。

| 路由 | 功能 |
|---|---|
| `/admin/erp` | 總覽卡片：本月銷貨額、本月毛利、應收總額、應付總額、低庫存品項數、7 日內到期支票 |
| `/admin/erp/items` | 品項列表／新增／編輯；顯示各倉存量與平均成本 |
| `/admin/erp/warehouses` | 倉庫 CRUD（有庫存或異動的倉庫只能停用不能刪） |
| `/admin/erp/vendors` | 廠商 CRUD；詳情頁：應付餘額、近期單據 |
| `/admin/erp/customers` | 客戶列表（共用 mx_customers）；編輯含 ERP 欄位；詳情頁：應收餘額、預收、近期單據、名下保養卡機台連結 |
| `/admin/erp/quotes` | 報價單；「轉銷貨單」按鈕（複製表頭與行為 S 草稿，`source_doc_id`） |
| `/admin/erp/sales` | 銷貨單；可從報價單帶入；序號選擇；過帳後顯示已建立的保養卡機台連結 |
| `/admin/erp/sales-returns` | 銷退單；從銷貨單帶入可退行與序號 |
| `/admin/erp/purchases` | 採購單；到貨進度；「轉進貨單」（帶入未到貨數量） |
| `/admin/erp/receipts` | 進貨單；序號輸入（每台一格，可貼上多行） |
| `/admin/erp/purchase-returns` | 進退單 |
| `/admin/erp/inventory` | 存量表（品項 × 倉庫），低於安全存量標紅；篩選 kind |
| `/admin/erp/inventory/serials` | 機號清單（狀態、倉庫／客戶、進出單據） |
| `/admin/erp/inventory/moves` | 庫存異動明細（依品項／倉庫／日期） |
| `/admin/erp/transfers` | 調撥單 |
| `/admin/erp/adjustments` | 盤點調整單 |
| `/admin/erp/collections` | 收款：新增時列出該客戶未沖銷單據供勾選沖銷；列表顯示未沖銷餘額；支票狀態 |
| `/admin/erp/disbursements` | 付款（同上，廠商） |
| `/admin/erp/statements` | 對帳單：選客戶／廠商 + 期間 → 預覽 → 列印 |
| `/admin/erp/reports` | 報表（§8） |
| `/admin/erp/print/[docId]` | 單據 A4 列印頁 |
| `/admin/erp/print/statement` | 對帳單列印頁（query：party, from, to） |

側欄（`group: "ERP"`，`modules: ["erp"]`）：總覽、銷售（報價／銷貨／銷退）、採購（採購／進貨／進退）、庫存、收付款、對帳單、報表、基本資料。為避免側欄過長，每個主項進入後以頁內 tab 切換子單別。

視覺：沿用後台現有樣式（非前台 V3.08 設計稿，不需讀 pen）。

## 7. 列印

- 無 sidebar 的 print layout，`@page { size: A4; margin: 12mm }`，瀏覽器列印（不產生 PDF 檔）。
- 表頭：公司名「勁賀空壓科技有限公司」、LOGO、服務專線 02-2675-9977、傳真 02-2675-9955、LINE@air9977（取自 `site_settings`，無則用常數）；單據名稱、單號、民國日期、頁次。
- 銷貨／報價：客戶名稱、客戶編號、統編、電話、聯絡人、送貨地址；明細欄：產品編號、品名規格（序號行以「機號*xxxx」顯示於品項下）、數量、單價、金額；合計／稅額／總計；「**貨款未全部兌現前，貨物所有權仍歸本公司所有**」；業務；簽認處。
- 採購／進貨：廠商編號、名稱、聯絡人、地址、電話、傳真、採購日期、交貨日期、幣別、匯率；合計金額／營業稅／總計金額；備註；主管／承辦人／請購人簽名欄。
- 明細超過一頁自動分頁，每頁重複表頭，總計只印在最後一頁。

## 8. 報表

- 銷售毛利：期間內已過帳 S − SR，依客戶／品項／業務彙總：數量、銷售額（未稅）、成本（Σ qty × unit_cost）、毛利、毛利率。
- 應收帳齡：各客戶未沖銷金額依單據日期分 0–30／31–60／61–90／>90 天；另列未沖銷預收。
- 應付總表：各廠商應付餘額、未沖銷預付。
- 皆可匯出 CSV（server action 回傳字串，client 以 Blob 下載）。

## 9. 錯誤處理

- RPC 以 `raise exception using errcode = 'P0001', message = '<code>', detail = '<人讀訊息>'`；code 列舉：`forbidden`、`not_draft`、`not_posted`、`validation`、`insufficient_stock`、`serial_unavailable`、`over_receipt`、`has_dependents`、`over_allocation`。
- TS `frontend/src/lib/erp/errors.ts` 將 code 對應中文訊息；server action 回傳 `{ ok: false, error: string }`（沿用保養卡 #171 的回傳錯誤模式，不 throw 到 error boundary）。
- 表單欄位受控，錯誤時保留使用者輸入。

## 10. 測試

- **Vitest（純函式）**：`calc.ts`（三種稅別、外幣、折扣行、四捨五入）、`doc-no.ts`（民國年月、流水號位數）、移動平均公式 `avg-cost.ts`（含 Q0≤0 邊界）、`nav-config`（`navForUser` 模組可見性；office 無 erp 授權時看不到）、`errors.ts` 對應。
- **Server action 測試**（mock supabase，沿用 `maintenance-*.test.ts` 模式）：未授權呼叫被拒、驗證錯誤回傳。
- **SQL 測試** `supabase/tests/erp_posting_test.sql`：`begin;` → 以 `set local role authenticated` + `request.jwt.claims` 模擬 office 使用者 → 建測試資料 → 過帳／作廢各單別 → `do $$ … assert … $$` 斷言庫存量、avg_cost、序號狀態、mx_machines 建立、餘額 → `rollback;`。於正式 DB 執行（全程 rollback，不留資料），執行前需使用者確認。
- **Migration**：`0020_erp_foundation.sql` 需可重複執行的 guard（`if not exists`）；由使用者確認後以 pooler 連線套用正式 DB。
- CI：push 前 `npm run format`、`lint`、`typecheck`、`test`、`build`。

## 11. 實作拆分（GitHub issues）

Epic #180；#1→#172、#2→#173、#3→#174、#4→#175、#5→#176、#6→#177、#7→#178、#8→#179。

```
Epic
 └ W0  #1 地基：權限 + migration 0020（全部表/RPC/view/seed）+ SQL 測試 + auth/nav + ERP layout
          + 共用元件（Pickers / DocumentLinesEditor / RocDateInput / MoneyText）+ lib/erp（types/calc/doc-no/errors）
 └ W1（並行，各自 worktree）
     #2 基本資料（品項、倉庫、廠商、客戶 ERP 欄位）
     #3 採購（P / I / PR + 序號入庫）
     #4 銷售（Q / S / SR + 序號出庫 + 保養卡機台串接）
     #5 庫存（存量、機號清單、異動明細、調撥 T、盤點 A、低庫存）
     #6 應收應付（收款、付款、沖銷、支票、對帳單頁）
 └ W2（並行）
     #7 列印（單據 A4 + 對帳單）
     #8 報表 + ERP 總覽卡片
```

- W0 必須先合併：W1 各 issue 只新增 `app/admin/(protected)/erp/<區>/`、`lib/erp/queries/<區>.ts`、`test/erp-<區>-*.test.ts`，**不改 migration、不改 nav-config、不改共用元件**（若需改共用元件，於 PR 說明並由 orchestrator 協調）。
- W0 在 nav-config 一次加好所有 ERP 項目，尚未完成的區段 `enabled: false`，各 W1 PR 只把自己那行改 `true`（衝突極小，合併時手動解）。
- 若 W1 發現 schema 需要調整 → 另開 `0021_erp_*.sql`，不改 0020。
