# 變頻空壓機規格區改版：HP↔造氣量 連動下拉

**日期**：2026-06-26
**範圍**：僅「變頻空壓機」分類的商品內頁 SPECIFICATIONS 區；其他 5 個分類維持現狀。

## 背景與問題

目前所有商品的規格存在 `products.spec`（扁平 `Record<string, string|number|null>`），前台用 `SpecTable` 渲染成兩欄表格，Hero 上方「規格亮點」(`MetricsBox`) 抓 `spec` 前 4 筆，後台用「每行 `key=value`」textarea 編輯。

變頻空壓機的規格本質不同：同一機種有**多個馬力數**，每個馬力數對應不同的**造氣量**。扁平表格無法表達這種一對多關係。需求是讓前台用下拉選單選不同馬力數、即時看到對應造氣量。

AM3 永磁式螺旋變頻空壓機的對照數據（來源：`old_website_data/upload/網站商品AM3 馬力數對應造氣量.xlsx`）：

| 馬力數 HP | 造氣量 m³/min |
|---|---|
| 10 | 1.094 |
| 20 | 2.372 |
| 30 | 3.905 |
| 50 | 6.58 |
| 75 | 11.39 |
| 100 | 15.18 |
| 215 | 32.66 |

## 已確認的決定

1. **5 個規格項目名稱固定**（馬力數 HP / 造氣量 / 壓力範圍 / 冷卻方式 / 潤滑方式），後台只改值、不改名稱。
2. **Hero 規格亮點**：變頻空壓機顯示「馬力/造氣量範圍 + 固定項」。
3. **儲存**：新增獨立 jsonb 欄位 `hp_output`，不污染現有 `spec` 與泛用型別。
4. AM3 直接填入 Excel 7 組數據；其餘 4 台變頻空壓機 `hp_output` 留空，前台有資料才顯示。
5. 其他分類前台與後台**皆不更動**。

## 資料模型

新增欄位（migration `supabase/migrations/0008_*.sql`）：

```sql
alter table products
  add column hp_output jsonb not null default '[]'::jsonb;
```

形狀（陣列，順序即顯示順序，但前台會依 hp 數值排序）：

```json
[
  { "hp": "10", "output": "1.094" },
  { "hp": "20", "output": "2.372" }
]
```

- `hp`：馬力數（純數字字串，前台顯示時附固定後綴 `HP`）。
- `output`：造氣量（純數字字串，單位 `m³/min` 由欄位標題承載）。
- 3 個固定單值（壓力範圍 / 冷卻方式 / 潤滑方式）**仍存在扁平 `spec`**，不動結構。

**型別**（`frontend/src/lib/types.ts`）：

```ts
export interface HpOutputRow {
  hp: string;
  output: string;
}
// Product 介面新增：
hp_output: HpOutputRow[];
```

## 元件與資料流

### 後台 `ProductForm.tsx`
- 將 `category` 改為受控狀態（`useState`）。
- **僅當** `category === "變頻空壓機"` 時，多顯示一個 textarea：
  - 名稱：「馬力數 ↔ 造氣量 對照表」
  - 格式：每行一筆 `馬力數=造氣量`，例如 `10=1.094`
  - `name="hp_output"`，`defaultValue` 由 `product.hp_output` 反序列化成多行文字。
  - 同時把規格表 textarea 的 placeholder 換成引導 3 個固定項（壓力範圍 / 冷卻方式 / 潤滑方式）。
- 其他分類：此欄位不渲染，表單外觀與行為完全不變。

### 後台 `actions.ts`
- 新增 `parseHpOutput(raw: string): HpOutputRow[]`：逐行切 `=`，左為 `hp`、右為 `output`，皆 trim，空行/無等號略過。
- `buildValues()` 加 `hp_output: parseHpOutput(str(formData, "hp_output"))`。
- 非變頻空壓機分類表單不送 `hp_output` 欄位 → `parseHpOutput("")` 回 `[]`，安全。

### 前台 `CompressorSpecTable`（新 client 元件）
- Props：`spec: ProductSpec`、`variants: HpOutputRow[]`。
- 依 `hp` 數值升冪排序 variants。
- 沿用 `SpecTable` 的表格視覺（深藍表頭、交替列）：
  - 第 1 列「馬力數」：`<select>`，選項為各 `hp`（顯示 `${hp} HP`），預設選最小。
  - 第 2 列「造氣量」：隨選取連動顯示 `${output} m³/min`。
  - 其後依序渲染扁平 `spec` 的剩餘列（壓力範圍 / 冷卻方式 / 潤滑方式）。
- `"use client"`（select 需互動）。

### 前台 `products/[slug]/page.tsx`
- SPECIFICATIONS 區分流：
  - `category === "變頻空壓機"` 且 `hp_output.length > 0` → `CompressorSpecTable`。
  - 否則維持現狀：`spec` 非空 → `SpecTable`；皆空 → 「規格資料建置中。」。
- `deriveMetrics`：變頻空壓機特例 —
  - `馬力數`：`{最小hp}–{最大hp} HP`
  - `造氣量`：`{最小output}–{最大output} m³/min`
  - 再補 `spec` 的壓力範圍 / 冷卻方式（湊滿至多 4 格）。
  - 無 `hp_output` 時 fallback 回現有邏輯。
  - 其他分類邏輯不變。

## 資料填入（AM3）

1. `supabase/seed_products.py`：AM3 加上 `hp_output`（7 組），其 `spec` 移除「設計馬力 / 排氣量範圍」，保留壓力範圍 / 冷卻方式 / 潤滑方式。
2. 線上 Supabase 既有 AM3 列：執行一次性 `UPDATE`（設 `hp_output`、調整 `spec`），讓現有資料即時生效。
3. 其餘屬「變頻空壓機」分類的機種（AM3 以外）`hp_output` 一律留 `[]`，前台有資料才顯示。

## 邊界與錯誤處理

- `hp_output` 為空陣列 → 變頻空壓機商品退回顯示「規格資料建置中。」（若 spec 也空）。
- `parseHpOutput` 對壞輸入寬容：略過空行與無 `=` 的行，不丟例外。
- 排序時 `hp` 以 `Number()` 解析；無法解析者排在後面，仍可顯示。

## 測試

- `parseHpOutput`：多行、含空白、無等號行、空字串 → 期望輸出。
- `CompressorSpecTable`：給定 variants，預設選最小 HP、切換 select 後造氣量列更新、3 個固定列照常顯示。
- `deriveMetrics`：變頻空壓機產生範圍字串；非變頻空壓機行為不變。

## 不做（YAGNI）

- 不做項目名稱可改 UI（已確認名稱固定）。
- 不改其他 5 個分類的前台 / 後台。
- 不做多軸（除馬力數外）的連動。
