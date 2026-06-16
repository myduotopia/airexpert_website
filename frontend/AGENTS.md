<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# V2 頁面：實作前必讀設計稿

實作或修改任何 V2 前台頁面 / 元件前，**必須先用 `pencil` MCP 讀 `airexpert.pen` 對應 frame**
（先 `get_editor_state`，再讀該 tab 的 frame），以設計稿為唯一視覺依據，不得憑空詮釋設計。
每個 tab 對應哪一個 frame，見 `docs/design/v2-frame-map.md`。

資料一律走 `@/lib/data`（server-only，已依 domain 分檔於 `src/lib/data/*`）；
後台寫入走 `@/lib/supabase-admin`（service_role），並須先以 `@/lib/supabase-server` 驗證 admin 身分。
