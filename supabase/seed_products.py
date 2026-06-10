#!/usr/bin/env python3
"""Seed the `products` table from the old AirExpert site content (issue #10).

Idempotent: upserts on `slug`. Run with the backend venv:
    cd backend && .venv/bin/python ../supabase/seed_products.py

Reads SUPABASE_URL + SUPABASE_KEY (service_role) from backend/.env.
Images are intentionally left empty for now ([]); text + spec only.
"""

import pathlib
import sys

from supabase import create_client


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    env_path = pathlib.Path(__file__).resolve().parent.parent / "backend" / ".env"
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k] = v
    return env


# category, brand, slug, name, spec(dict)
PRODUCTS = [
    # ---- 變頻空壓機 ----
    ("變頻空壓機", "Hanbell 漢鐘", "am3", "AM3 永磁式螺旋變頻空壓機",
     {"設計馬力": "30~215 HP", "排氣量範圍": "3.9~30.6 m³/min", "壓力範圍": "5~8 kg/cm²G", "冷卻方式": "氣冷、水冷", "潤滑方式": "微油"}),
    ("變頻空壓機", "Kaishan 台灣開山", "appm", "APPM 永磁式螺旋變頻空壓機",
     {"設計馬力": "10~20 HP", "排氣量範圍": "1.04~2.23 m³/min", "冷卻方式": "氣冷"}),
    ("變頻空壓機", "Kaishan 台灣開山", "pmv", "PMV 永磁式螺旋變頻空壓機",
     {"設計馬力": "215~335 HP", "排氣量範圍": "34.3~52.5 m³/min"}),
    ("變頻空壓機", "Kaishan 台灣開山", "ay", "AY 乾式螺旋變頻空壓機",
     {"設計馬力": "75~180 HP", "排氣量範圍": "9.3~21.7 m³/min", "壓力範圍": "8~10 kg/cm²G", "潤滑方式": "無油"}),
    ("變頻空壓機", "LMF 阿拉瑪法", "krof", "KROF 乾式螺旋變頻空壓機",
     {"設計馬力": "60~200 HP", "排氣量範圍": "9.6~25.4 m³/min"}),
    ("變頻空壓機", "IR 英格索蘭", "nirvana", "Nirvana 乾式螺旋變頻空壓機",
     {"設計馬力": "50~200 HP", "排氣量範圍": "6.5~25.8 m³/min", "壓力範圍": "4.5~10 kg/cm²G"}),
    ("變頻空壓機", "HITACHI 日立", "sds-u", "SDS-U 乾式螺旋變頻空壓機",
     {"設計馬力": "125~600 HP", "排氣量範圍": "16.8~81.1 m³/min", "壓力範圍": "7~10 kg/cm²G"}),
    # ---- 變頻真空泵 ----
    ("變頻真空泵", "LMF 阿拉瑪法", "jnph", "JNPH 無油變頻真空泵",
     {"設計馬力": "50~110 HP", "抽速範圍": "35.4~92.2 m³/min", "真空度": "0.5 Torr", "冷卻方式": "氣冷、水冷", "潤滑方式": "無油"}),
    ("變頻真空泵", "Hanbell 漢鐘", "pa-vsd", "PA VSD+ 微油變頻真空泵",
     {"設計馬力": "7.5~120 HP", "抽速範圍": "8~90 m³/min", "真空度": "0.26 Torr", "冷卻方式": "氣冷", "潤滑方式": "微油"}),
    ("變頻真空泵", "Hanbell 漢鐘", "ps-pd", "PS/PD 乾式螺旋真空泵",
     {"設計馬力": "5~30 HP", "抽速範圍": "1.6~50 m³/min", "真空度": "≤ 7.5 × 10⁻⁴ Torr"}),
    ("變頻真空泵", "Kaishan 台灣開山", "krsv", "KRSV 微油變頻真空泵",
     {"設計馬力": "20~50 HP", "抽速範圍": "14.43~32.53 m³/min"}),
    # ---- 變頻鼓風機 ----
    ("變頻鼓風機", "Hanbell 漢鐘", "htb", "HTB 氣懸浮離心鼓風機",
     {"設計功率": "15~315 kW", "排氣量範圍": "12~328 m³/min", "壓力範圍": "0.4~1.0 bar", "冷卻方式": "氣冷", "潤滑方式": "無油"}),
    ("變頻鼓風機", "LMF 阿拉瑪法", "cf", "CF 磁懸浮離心鼓風機",
     {"設計功率": "55~400 kW", "排氣量範圍": "37~421 m³/min", "壓力範圍": "0.4~1.5 bar", "冷卻方式": "氣冷、水冷"}),
    # ---- 離心式空壓機 ----
    ("離心式空壓機", "Hanbell 漢鐘", "atc", "ATC 離心式空壓機",
     {"設計功率": "300~4500 kW", "排氣量範圍": "70~900 m³/min", "壓力範圍": "3.5~25 bar", "冷卻方式": "水冷", "潤滑方式": "無油"}),
    ("離心式空壓機", "LMF 阿拉瑪法", "model-h", "Model H 離心式空壓機",
     {"設計功率": "450~4000 kW", "排氣量範圍": "80~620 m³/min", "壓力範圍": "2.5~11.5 bar"}),
    # ---- 冷凍式乾燥機 ----
    ("冷凍式乾燥機", "Deltech", "pcm-d", "PCM-D 相變化儲能乾燥機",
     {"設計功率": "0.54~72 kW", "處理流量範圍": "2.7~399.2 m³/min", "壓力範圍": "3~16 bar", "冷卻方式": "氣冷", "露點控制": "4±2 ℃"}),
    ("冷凍式乾燥機", "LM", "lm", "LM 冷凍式乾燥機",
     {"設計功率": "0.57~2.86 kW", "處理流量範圍": "1.6~16 m³/min", "壓力範圍": "4~10 bar", "露點控制": "2~10 ℃"}),
    # ---- 吸附式乾燥機 ----
    ("吸附式乾燥機", "Everair 普力潔凈", "hoc-f", "HOC-F 壓縮熱回收吸附式乾燥機",
     {"處理流量範圍": "80~18000 m³/h", "壓力露點": "-40 ℃", "最大工作壓力": "10 bar"}),
    ("吸附式乾燥機", "LMF 阿拉瑪法", "lmf-dual-tower", "雙塔吸附式乾燥機",
     {"處理流量範圍": "72~18600 m³/h", "壓力露點": "-70 ℃"}),
]

LEGACY = {
    "變頻空壓機": "products-1.html", "變頻真空泵": "products-2.html",
    "變頻鼓風機": "products-3.html", "離心式空壓機": "products-8.html",
    "冷凍式乾燥機": "products-9.html", "吸附式乾燥機": "products-10.html",
}


def build_rows() -> list[dict]:
    rows = []
    for i, (category, brand, slug, name, spec) in enumerate(PRODUCTS):
        first_two = "、".join(f"{k} {v}" for k, v in list(spec.items())[:2])
        summary = f"{brand}，{first_two}。"
        rows.append({
            "slug": slug,
            "category": category,
            "brand": brand,
            "name": name,
            "summary": summary,
            "spec": spec,
            "images": [],
            "seo_title": f"{name}｜{brand}",
            "seo_description": summary,
            "sort_order": i,
            "status": "published",
            "legacy_path": LEGACY[category],
        })
    return rows


def main() -> int:
    env = load_env()
    url, key = env.get("SUPABASE_URL"), env.get("SUPABASE_KEY")
    if not url or not key:
        print("SUPABASE_URL / SUPABASE_KEY missing in backend/.env", file=sys.stderr)
        return 1
    sb = create_client(url, key)
    rows = build_rows()
    res = sb.table("products").upsert(rows, on_conflict="slug").execute()
    print(f"✅ upserted {len(res.data)} products across "
          f"{len(set(r['category'] for r in rows))} categories")
    for r in res.data:
        print(f"  - [{r['category']}] {r['name']} ({r['slug']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
