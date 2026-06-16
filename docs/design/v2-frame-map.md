# V2 設計稿對照表（frame-map）

> 設計方向：**V3.08 Eco Green Light**（嚴格採用）。
> 設計檔：`airexpert.pen` —— **本機檔案、未進版控**（`*.pen` 為 gitignore）。本表的 **node id 為跨機器的穩定參照**。
> 用法：實作任一 V2 tab 前，用 `pencil` MCP 開啟本機 `airexpert.pen`，`get_editor_state` 後 `batch_get` 讀下表對應 frame 的 node id。

## 共用元件（V3.08）
| 元件 | node id |
|------|---------|
| Nav | `UrJQe`（DB2 Nav） |
| Footer | `LBdKX`（DB2 Footer） |
| Maintenance 頁 | `RaTdo`（V3.08 / 內容更新中） |

色票（自 frame 取樣）：主綠 `#2F8F5C`、深墨 `#16201A`、淺底 `#F1F6F1`、白 `#FFFFFF`、邊線 `#DCE8DD`、次文字 `#5C6B61`。

## tab → frame 對照
| Tab（issue） | V3.08 frame | node id | 主要區段 |
|--------------|-------------|---------|----------|
| 首頁 Home（#29） | V3.08 / Home | `hFFr2` | Hero `NPROb` / HeroImage `shOp7` / Stats `Y4KAZ` / Partners `GIRLN` / Overview `yOV21` / Tech `fWxGm` / NewsTeaser `eYVLQ` / CTABanner `fqhv8` |
| 商品介紹（#31） | V3.08 / Product | `eMCvR` | Breadcrumb `L7HCW` / Hero `dy6wv` / SpecSection `SD9t3` / Features `x36ZVd` / Applications `LWiou` / Related `S8s7Y`。**註：此為商品「詳情」版型；列表頁需以同設計語言延伸。** |
| 最新消息（#32） | V3.08 / News | `rhx08` | Hero `r4IZjR` / FilterRow `wyHNu` / FeaturedBlock `z6uuR2` / ArticleGrid `gTsaA` / Pagination `O4IBMk` / Newsletter `QuIZG`。**註：此為「列表」版型；文章詳情頁需延伸。** |

## ⚠️ 尚無 V3.08 設計的 tab（需先決定處理方式）
以下 5 個 tab 在 `airexpert.pen` 中**沒有** V3.08 對應 frame，實作前須補設計或約定延伸來源：

| Tab（issue） | 狀態 | 建議延伸來源 |
|--------------|------|--------------|
| 品牌介紹（#30） | 尚未設計 | 以 Product 詳情 `eMCvR` + V3.08 系統延伸 |
| 服務項目（#33） | 尚未設計 | 以 Overview/Tech 區段語言延伸 |
| 節能實績（#34） | 尚未設計 | 列表用 News `rhx08`、詳情用 Product `eMCvR` 延伸 |
| 公司活動（#35） | 尚未設計 | 以 News ArticleGrid 卡片 + 影片嵌入延伸 |
| 聯絡我們（#36） | 尚未設計 | 以 V3.08 系統 + 表單元件延伸 |

> **決議（#28）：先在 Pencil 補齊這 5 個 V3.08 screen，再開對應 tab。**
> 補齊後回填本表的 frame 名稱與 node id；在 screen 就緒前，不啟動 #30 / #33 / #34 / #35 / #36 的前端實作。
> 補設計為 PR-1/PR-2 之後的獨立工作項（可與後台地基並行）。
