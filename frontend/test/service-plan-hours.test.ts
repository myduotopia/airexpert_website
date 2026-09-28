import { describe, it, expect } from "vitest";

// 保養方案時數解析與「目前時數」（spec §5.1 / §5.2 / §8）。

import {
  latestHours,
  parseHours,
  readingFrom,
  sortReadings,
} from "@/lib/service-report/plan/hours";
import type { HoursReading } from "@/lib/service-report/plan/types";

describe("parseHours", () => {
  it("純數字與千分位逗號", () => {
    expect(parseHours("22278")).toBe(22278);
    expect(parseHours("22,278")).toBe(22278);
    expect(parseHours(" 0 ")).toBe(0);
  });

  it("去單位（小時 / 時 / H / h / hr / hrs）", () => {
    for (const t of [
      "22278小時",
      "22278時",
      "22278H",
      "22278 h",
      "22278hr",
      "22278HRS",
    ]) {
      expect(parseHours(t)).toBe(22278);
    }
  });

  it("全形數字轉半形", () => {
    expect(parseHours("２２２７８")).toBe(22278);
    expect(parseHours("２２，２７８小時")).toBe(22278);
  });

  it("耗材時數「已用/壽命」取前段", () => {
    expect(parseHours("0/1500")).toBe(0);
    expect(parseHours("1200/1500")).toBe(1200);
    expect(parseHours("１２００／１５００")).toBe(1200);
  });

  it("小數取整", () => {
    expect(parseHours("1234.6")).toBe(1235);
    expect(parseHours("1234.4")).toBe(1234);
  });

  it("看不懂或超出範圍一律 null（不猜）", () => {
    for (const t of [
      "",
      "   ",
      "abc",
      "-5",
      "1000001",
      "1,000,001",
      "換油",
      "/1500",
    ]) {
      expect(parseHours(t)).toBeNull();
    }
    expect(parseHours(null)).toBeNull();
    expect(parseHours(undefined)).toBeNull();
    expect(parseHours(12345)).toBeNull();
    expect(parseHours("1000000")).toBe(1000000);
  });
});

describe("readingFrom", () => {
  it("日期或時數不可用回 null", () => {
    expect(readingFrom("2026-09-15", "1,200", "record")).toEqual({
      date: "2026-09-15",
      hours: 1200,
      source: "record",
    });
    expect(readingFrom("2026-09-15", "換油", "record")).toBeNull();
    expect(readingFrom(null, "1200", "record")).toBeNull();
    expect(readingFrom("2026/09/15", "1200", "record")).toBeNull();
  });
});

const R = (
  date: string,
  hours: number,
  source: HoursReading["source"] = "record",
): HoursReading => ({ date, hours, source });

describe("latestHours", () => {
  it("取日期最新的一筆", () => {
    expect(latestHours([R("2026-08-01", 1000), R("2026-09-01", 1300)])).toEqual(
      R("2026-09-01", 1300),
    );
  });

  it("同日期以報告單優先（當次實際抄表）", () => {
    const r = latestHours([
      R("2026-09-01", 1300, "record"),
      R("2026-09-01", 1310, "report"),
    ]);
    expect(r).toEqual(R("2026-09-01", 1310, "report"));
    // 順序顛倒結果相同
    expect(
      latestHours([
        R("2026-09-01", 1310, "report"),
        R("2026-09-01", 1300, "record"),
      ]),
    ).toEqual(R("2026-09-01", 1310, "report"));
  });

  it("略過不合法的抄表；全空回 null", () => {
    expect(latestHours([])).toBeNull();
    expect(latestHours(null)).toBeNull();
    expect(
      latestHours([
        { date: "2026/09/01", hours: 99, source: "record" },
        { date: "2026-09-02", hours: Number.NaN, source: "record" },
        R("2026-08-01", 800),
      ]),
    ).toEqual(R("2026-08-01", 800));
  });
});

describe("sortReadings", () => {
  it("由舊到新，同日期報告單在後", () => {
    const sorted = sortReadings([
      R("2026-09-01", 1300, "report"),
      R("2026-08-01", 1000),
      R("2026-09-01", 1290, "record"),
    ]);
    expect(sorted.map((r) => [r.date, r.source])).toEqual([
      ["2026-08-01", "record"],
      ["2026-09-01", "record"],
      ["2026-09-01", "report"],
    ]);
  });
});
