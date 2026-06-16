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
| 品牌介紹（#30） | V3.08 / Brands | `mbcZA` | Breadcrumb / Hero（單一品牌詳情，如開山 KAISHAN）/ SpecSection / Features / Related。由 Product 版型延伸；列表頁（KAISHAN/DELTECH 二品牌）以同語言延伸。 |
| 服務項目（#33） | V3.08 / Services | `HD4wR` | Breadcrumb / Hero（服務詳情，如節能方案）/ 內容區段 / Related。由 Product 版型延伸。 |
| 節能實績（#34） | V3.08 / Cases | `kF0HO` | Hero / FilterRow（全部/空壓機/乾燥機）/ FeaturedBlock / Grid / Pagination / Newsletter。由 News 列表版型延伸。 |
| 公司活動（#35） | V3.08 / Events | `D6tjZZ` | Hero / FilterRow（交機影片/活動花絮）/ Grid（影片/相簿卡片）/ Pagination。由 News 列表版型延伸。 |
| 聯絡我們（#36） | V3.08 / Contact | `LZMiB` | Hero / ContactBody `eulnT`（左 Form `tAR5G` 表單、右 Info `xFKMH` 南北服務中心）。自建。 |

## 設計補齊紀錄（#28，2026-06-17）
原本 V3.08 只有 Home / Product / News 三個 screen。已在 `airexpert.pen` 補齊上表後 5 個 tab 的 V3.08 screen（Brands/Services 由 Product 延伸、Cases/Events 由 News 延伸、Contact 自建表單頁），node id 已回填。

> 註：Brands/Services 目前為「詳情」版型（由 Product 複製），各 tab 的「列表/索引」版面於實作時依同設計語言延伸；Cases/Events 卡片內容於實作時改為實績/影片相簿欄位。8 個 tab 皆有 V3.08 設計可對照，可啟動前端實作。
