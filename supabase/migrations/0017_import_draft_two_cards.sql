-- 0017_import_draft_two_cards.sql
-- 拍照辨識分流（#158）：一張照片可同時匯入「空壓機卡」與「過濾系統（乾燥機）卡」，
-- 因此一筆 mx_import_drafts 稽核草稿需要能關聯到兩個 machine。
-- 依賴 0011（mx_import_drafts / is_office() fail-closed RLS）、0015（card_type / 過濾卡資料模型）。
-- 與 0014（service_type）、0016 互不相干，可任意先後套用。
-- 套用：Supabase Dashboard → SQL Editor 貼上執行。

-- ============================================================
-- 取捨：machine_ids uuid[] vs 另開 mx_import_draft_machines 關聯表
--
-- 選 uuid[]，理由：
--   1. 一筆草稿最多兩張卡（空壓機 + 過濾系統），不會成長為多對多。
--   2. 只有「由 draft 看它建了哪些卡」這個方向的讀取，不需要反查
--      「某台機器來自哪些 draft」，用不到 join 表的索引優勢。
--   3. 0011 的 RLS 是 fail-closed（沒有 policy = 讀不到任何列）。多一張表就多一份
--      必須手動補上的 enable row level security + is_office() policy，
--      漏掉會變成「不報錯但永遠讀不到」的靜默故障。加欄位則自動沿用 mx_import_drafts
--      既有的 office policy，沒有這個風險。
--
-- 代價：陣列沒有 FK，卡片被永久刪除後 machine_ids 內會殘留失效 uuid。
--       稽核用途可接受（本來就是保存「當時匯入了什麼」的快照）；
--       需要 FK 語意的主卡仍走既有的 machine_id 欄（on delete set null）。
-- ============================================================
alter table mx_import_drafts
  add column machine_ids uuid[] not null default '{}';

comment on column mx_import_drafts.machine_ids is
  '本次匯入實際寫入的所有 mx_machines.id（空壓機卡 + 過濾系統卡，最多兩筆）。無 FK，僅稽核用。';

comment on column mx_import_drafts.machine_id is
  '主卡 id（有空壓機卡時為空壓機卡，否則為過濾系統卡）。沿用 0011 的 FK，供既有查詢相容。';

-- 既有已 committed 的草稿回填：把單一 machine_id 併進陣列。
update mx_import_drafts
set machine_ids = array[machine_id]
where machine_id is not null and machine_ids = '{}';

-- 註：mx_import_drafts 的 RLS 與 office policy 已在 0011 建立，
--     新增欄位自動沿用，這裡不需要（也不應該）重建 policy。
