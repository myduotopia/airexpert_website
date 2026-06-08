# AirExpert Backend (FastAPI)

後台 API 與 AI 服務，部署於 GCP Cloud Run，使用 Vertex AI。

## 本地開發

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env          # 填入實際值
uvicorn app.main:app --reload # http://localhost:8000
```

## 品質檢查（與 CI 一致）

```bash
black --check .      # 格式
flake8 .             # lint
pytest -q            # 測試
```

格式化：`black .`
