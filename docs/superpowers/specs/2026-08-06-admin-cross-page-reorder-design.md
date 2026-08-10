# 後台清單：跨頁排序 + 分頁列改版

日期：2026-08-06
狀態：設計已核准，待實作

## 問題

後台清單同時具備「分頁」與「拖拉排序」時，無法把後面頁次的項目移到前面頁次。

根因：[`AdminTable`](../../../frontend/src/components/admin/AdminTable.tsx) 只渲染當前頁的 `pageRows`，
HTML5 drag-and-drop 的 drop target 必須存在於 DOM 中，因此第 4 頁的列永遠找不到第 1 頁的落點。

### 受影響範圍（分頁 + 拖拉並存）

| 頁面 | 路徑 | reorder action |
| --- | --- | --- |
| 商品介紹 | `frontend/src/app/admin/(protected)/products/page.tsx` | `reorderProductsAction` |
| 最新消息 | `frontend/src/app/admin/(protected)/news/page.tsx` | `reorderNewsAction` |
| 節能實績 | `frontend/src/app/admin/(protected)/cases/page.tsx` | `reorderCasesAction` |
| 公司活動 → 交機影片 | `frontend/src/app/admin/(protected)/events/page.tsx` | `reorderEventsAction` |

### 相關但不受影響

- **服務項目**（`services/page.tsx`）用舊的 `ReorderableTable`：有拖拉但無分頁，故不會卡住；
  但也少了搜尋 / 欄位排序。本次一併統一到 `AdminTable`。
- **活動相簿**（`events/page.tsx` 第二張表）：有分頁但無 `onReorder`，不受影響。
- **相簿照片**（`AlbumPhotos.tsx`）、**商品圖片**（`ProductImagesField.tsx`）：
  用上移 / 下移按鈕、無分頁，不受影響，**不在本次範圍**。

## 關鍵前提

server 端一次給出完整清單（例：`listAllProductsForAdmin()`），分頁純粹是 client 端在 render 時 `slice`。
因此任何一列的全域索引隨時都算得出來，而 `reorderRows(table, orderedIds, tags)` 本來就接受
「完整 id 陣列」並重新編號為 0,1,2…。

**結論：後端與 5 個 server action 完全不用改，只動共用元件與新增純函式。**

## 方案：剪下-貼上式跨頁移動

### UI 流程

1. 每列 grip 欄旁新增一顆「移動」鈕 → 進入移動模式（`movingKey` state）。
2. 移動模式下，表格上方出現提示條（`role="status"`）：
   `移動中：《商品 A》 → 請選擇插入位置` ＋ `移到最前面` `移到最後面` `取消 (Esc)`。
3. 每列的 grip 欄換成兩顆插入鈕：`插入到此列上方` / `插入到此列下方`。
   移動中的那一列半透明並標示「移動中」，不顯示插入鈕。
4. **翻頁、改每頁筆數、搜尋、欄位排序都不中斷移動模式。**
   要把第 4 頁的項目移到第 1 頁，可以翻頁，也可以直接搜尋目標列。
   - 搜尋 / 排序狀態下仍安全，因為插入位置綁定的是**某一具體列**
     （該列在手動全序中的位置），而非「第 N 筆」，語意唯一確定。
5. 拖拉維持現狀（僅手動模式啟用），作為同頁微調用。
6. 確認後呼叫既有 `onReorder(新的完整順序)`，沿用現有樂觀更新 / 失敗還原 / `router.refresh()`。

### 為什麼不選其他方案

- **手動模式下「顯示全部」**：改動最小，但資料量會持續成長，整頁過長仍難操作。
- **只加「置頂 / 置底」**：無法精準插到「第 2 頁第 5 筆之後」。
- **拖曳時自動翻頁**：HTML5 DnD 跨頁狀態保存 tricky、觸控支援差、拖很多頁仍累。

（置頂 / 置底仍以快捷鈕形式保留在移動模式提示條上。）

## 分頁列改版

現況只有「上一頁 / 下一頁 + 第 X / Y 頁」文字。改為：

```
共 87 筆              « ‹  1 … 4 [5] 6 7 … 9  › »              10 筆/頁
```

- **首頁 / 末頁**鈕：`ChevronsLeft` / `ChevronsRight`，位於第一 / 最後頁時 disabled。
- **頁碼視窗**：最多顯示 5 個連續頁碼，當前頁盡量置中；
  視窗未觸及頭尾時補上固定的第 1 頁 / 最後一頁按鈕與 `…` 省略號。
  總頁數 ≤ 7 時直接全列出、不出現 `…`。
- 當前頁按鈕用 primary 底色 ＋ `aria-current="page"`；其餘為可點的 ghost 按鈕。
- 窄螢幕 `flex-wrap`。
- **不加**「跳到第 N 頁」輸入框（YAGNI；頁碼視窗＋首末鍵已覆蓋）。

## 元件與檔案

### 新增 `frontend/src/lib/admin/table.ts`（純函式，可測）

```ts
// 把 movingKey 移動到 targetKey 的前 / 後，回傳新的 key 順序。
// position: "before" | "after"；movingKey === targetKey 時回傳原陣列。
export function moveItem(
  keys: string[],
  movingKey: string,
  targetKey: string,
  position: "before" | "after",
): string[];

// 置頂 / 置底
export function moveToEdge(
  keys: string[],
  movingKey: string,
  edge: "start" | "end",
): string[];

// 分頁視窗：回傳 (number | "…")[]
export function pageWindow(
  current: number,
  total: number,
  span?: number,
): (number | "ellipsis")[];
```

`moveItem` 需正確處理「往後移」時先移除元素造成的索引位移。

### 修改 `frontend/src/components/admin/AdminTable.tsx`

- 新增 state：`movingKey: string | null`。
- 新增移動鈕、提示條、插入鈕、Esc 取消。
- 分頁列改用 `pageWindow` 渲染。
- 既有拖拉、搜尋、欄位排序、每頁筆數行為不變。

### 修改 `frontend/src/app/admin/(protected)/services/page.tsx`

改用 `AdminTable`（補 `sortValues` / `search`），刪除
`frontend/src/components/admin/ReorderableTable.tsx`。

## 測試

新增 `frontend/test/admin-table-move.test.ts`（vitest，風格對齊 `crud-reorder.test.ts`）：

- `moveItem`：往前移、往後移（驗證 splice 索引位移）、
  相鄰列移動、`movingKey === targetKey` no-op、key 不存在時回傳原陣列。
- `moveToEdge`：置頂、置底、已在該端點時 no-op。
- `pageWindow`：總頁數 ≤ span、當前頁在頭 / 中 / 尾、
  總頁數 = 1、視窗剛好觸及頭尾（不應出現多餘 `…`）。

無障礙 / 手動驗收：五張表各測一次「把最後一頁的項目移到第一頁最前面」。

## 驗收標準

- [ ] products / news / cases / events(交機影片) / services 皆可跨頁把任一列移到任意位置。
- [ ] 移動模式在翻頁 / 搜尋 / 排序 / 改每頁筆數後仍保持。
- [ ] Esc 或「取消」可離開移動模式。
- [ ] 分頁列顯示頁碼、可直接跳頁，並有首頁 / 末頁鈕。
- [ ] `npm run format:check && npm run lint && npm run typecheck && npm run test` 全綠。
- [ ] `ReorderableTable.tsx` 已刪除且無殘留 import。
