# AirExpert Website（超勁賀空壓 官網改版）

超勁賀空壓科技官方網站（airexpert.com.tw）改版重建專案。

## 專案現況

- 舊站為靜態 PHP/HTML 網站，內容已完整存檔於本地（未納入 git）。
- 新站規劃技術棧（討論中，暫定）：
  - 前端：React.js
  - 後端：Python
  - 資料庫：Supabase
  - 部署：Vercel / GCP（評估中，因後台將導入 AI 應用，可能採 GCP + Vertex AI）

## 本地資料（不納入 git，見 `.gitignore`）

下列為大型原始素材與工具，僅保留於本地端：

| 路徑 | 說明 |
|------|------|
| `old_website_data/` | 廠商提供的舊站原始檔（HTML/CSS/JS/圖片） |
| `_mirror/` | 以 wget 完整鏡像的舊站（可離線瀏覽原樣式） |
| `網站存檔/` | 依舊站選單(sitemap)分類整理的文章與圖片 |
| `organize.py` | 將鏡像重整成分類資料夾的腳本 |

## 開發

待技術架構定案後補上安裝、開發、部署說明。
