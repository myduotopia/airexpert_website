// Designed sample / fallback content for the product detail page (frame eMCvR).
//
// Real product data is imported in issue #8. Until then — and for any published
// product whose optional fields are sparse — these provide the designed visual
// reference so the page never looks broken or empty. Pages prefer real data and
// fall back to these only when the corresponding field is missing.

import type { ComponentType } from "react";
import {
  ActivityIcon,
  ShieldCheckIcon,
  ThermometerIcon,
  VolumeXIcon,
  ZapIcon,
} from "./icons";

export type Feature = {
  icon: ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
};

/** KEY FEATURES · 核心優勢 — designed fallback set. */
export const SAMPLE_FEATURES: Feature[] = [
  {
    icon: ZapIcon,
    title: "高效節能",
    description: "變頻控制依需求調速，較定速機型節省可觀電費，降低營運成本。",
  },
  {
    icon: ShieldCheckIcon,
    title: "Class 0 無油認證",
    description: "通過 ISO 8573-1 Class 0 認證，提供製程所需的潔淨壓縮空氣。",
  },
  {
    icon: ActivityIcon,
    title: "智慧監控",
    description: "內建感測與遠端監控，即時掌握運轉狀態與保養時機。",
  },
  {
    icon: ThermometerIcon,
    title: "穩定溫控",
    description: "最佳化冷卻設計確保長時間運轉下的溫度穩定與壽命。",
  },
  {
    icon: VolumeXIcon,
    title: "低噪音運轉",
    description: "優化氣流與隔音結構，打造更友善的廠房工作環境。",
  },
];

/** 應用領域 — designed fallback pills. */
export const SAMPLE_APPLICATIONS: string[] = [
  "半導體製程",
  "生醫藥廠",
  "食品飲料",
  "汽車零組件",
  "精密機械",
];
