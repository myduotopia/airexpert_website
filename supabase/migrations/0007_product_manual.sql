-- AirExpert — 商品技術手冊 PDF（#84）
-- 商品內頁的「下載技術手冊 PDF」按鈕原為硬編 placeholder（href="#"）。
-- 為讓後台可逐一商品上傳 / 設定手冊檔，products 增加 manual_url 欄位，
-- 存放該商品技術手冊 PDF 的公開 URL（Supabase Storage media bucket，或手動貼入的外部網址）。
-- 前台僅在 manual_url 有值時才渲染下載按鈕；無值則不顯示。
-- 套用方式：Supabase Dashboard → SQL Editor 貼上執行（沿用 0001 / 0002 套路）。

alter table products add column if not exists manual_url text;
