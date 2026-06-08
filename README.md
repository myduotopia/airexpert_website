# AirExpert Website（超勁賀空壓 官網改版）

超勁賀空壓科技官方網站（airexpert.com.tw）改版重建專案。

## 技術架構

| 層 | 技術 | 部署 |
|----|------|------|
| 前端公開官網 | Next.js (App Router, TypeScript, Tailwind) | Vercel |
| 後端 + AI 服務 | Python FastAPI | GCP Cloud Run + Vertex AI |
| 資料 / Auth / 儲存 | Supabase | Tokyo (ap-northeast) |

混合雲：前端 Vercel（SEO/CDN/preview 最強），後端 AI 走 GCP（Vertex 同雲、低延遲）。

## 專案結構（monorepo）

```
frontend/   Next.js 前端（npm；ESLint + Prettier + tsc）
backend/    FastAPI 後端（Black + Flake8 + pytest）
.github/workflows/   CI（ci-backend / ci-frontend / claude-review）
.claude/skills/      開發用 skills（worktree / fix-workflow / fix-review + vercel 前端 skills）
```

## 開發

**前端**
```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
npm run lint && npm run typecheck && npm run format:check
```

**後端**
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
uvicorn app.main:app --reload   # http://localhost:8000
black --check . && flake8 . && pytest -q
```

## CI / 自動化

- PR 觸發 `CI Backend`（Test Backend）與 `CI Frontend`（Test Frontend）。
- **Code review 在本地執行**：用 `fix-review` skill 派本地 Claude code-review subagent，
  不需在 GitHub 加 `ANTHROPIC_API_KEY` secret 或 review workflow。
- skills：`fix-workflow`（自動修 CI）、`fix-review`（本地 code review + 修正）、`worktree`（隔離開發）。

## 舊站資料（不納入 git，見 `.gitignore`）

| 路徑 | 說明 |
|------|------|
| `old_website_data/` | 廠商提供的舊站原始檔 |
| `_mirror/` | wget 完整鏡像（離線可瀏覽原樣式） |
| `網站存檔/` | 依舊站 sitemap 分類整理的文章與圖片 |
| `organize.py` | 重整鏡像的腳本 |
