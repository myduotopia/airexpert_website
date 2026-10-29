import { describe, it, expect } from "vitest";
import {
  cnNumberToInt,
  parseReminderText,
  ruleKey,
  type ParsedReminderRule,
} from "@/lib/erp/reminders/parse-note";

// 提醒事項（#274）：廠商備註／付款條件 → 到期規則的解析器測試。資料全為虛構。

/** 只取比對用欄位（kind／日／星期／月／標題）。 */
function brief(r: ParsedReminderRule) {
  return {
    kind: r.kind,
    day: r.dayOfMonth,
    weekday: r.weekday,
    month: r.month,
    title: r.title,
  };
}
function rulesOf(note: string | null, terms?: string | null) {
  return parseReminderText(note, terms).rules.map(brief);
}
const monthly = (day: number, title: string) => ({
  kind: "monthly",
  day,
  weekday: null,
  month: null,
  title,
});
const weekly = (weekday: number, title: string) => ({
  kind: "weekly",
  day: null,
  weekday,
  month: null,
  title,
});
const yearly = (month: number, day: number, title: string) => ({
  kind: "yearly",
  day,
  weekday: null,
  month,
  title,
});

describe("中文數字", () => {
  it.each([
    ["五", 5],
    ["十", 10],
    ["十五", 15],
    ["二十", 20],
    ["二十五", 25],
    ["廿五", 25],
    ["三十", 30],
    ["卅一", 31],
    ["三十一", 31],
    ["12", 12],
  ])("%s → %d", (s, n) => {
    expect(cnNumberToInt(s)).toBe(n);
  });
  it("無法辨識 → null", () => {
    expect(cnNumberToInt("十十")).toBeNull();
    expect(cnNumberToInt("百")).toBeNull();
    expect(cnNumberToInt("")).toBeNull();
  });
});

describe("每月固定日", () => {
  const cases: [string, ReturnType<typeof monthly>[]][] = [
    ["每月10號匯款", [monthly(10, "匯款")]],
    ["每月10日付款", [monthly(10, "付款")]],
    ["每個月 10 號要匯款", [monthly(10, "匯款")]],
    ["每 月 25 日 請款", [monthly(25, "請款")]],
    ["每月5、20號請款", [monthly(5, "請款"), monthly(20, "請款")]],
    ["每月5號、20號請款", [monthly(5, "請款"), monthly(20, "請款")]],
    ["每月5號及20號對帳", [monthly(5, "對帳"), monthly(20, "對帳")]],
    ["每月5號對帳，20號請款", [monthly(5, "對帳"), monthly(20, "請款")]],
    ["匯款日：每月15號", [monthly(15, "匯款")]],
    ["每月10日前匯款", [monthly(10, "匯款")]],
    ["每月１０號匯款", [monthly(10, "匯款")]],
    ["每月十號匯款", [monthly(10, "匯款")]],
    ["每月二十日付款", [monthly(20, "付款")]],
    ["每月三十一日請款", [monthly(31, "請款")]],
    ["每月廿五號對帳", [monthly(25, "對帳")]],
    ["每月10號", [monthly(10, "到期事項")]],
    ["每月10號寄對帳單", [monthly(10, "對帳")]],
    ["每月10號電匯", [monthly(10, "匯款")]],
    ["每月25日結帳，月結30天", [monthly(25, "結帳")]],
    ["每月10號匯款 5000元", [monthly(10, "匯款")]],
    ["每月10號匯款，票期30日", [monthly(10, "匯款")]],
    ["每月5號對帳，月結25日", [monthly(5, "對帳")]],
  ];
  it.each(cases)("%s", (note, expected) => {
    expect(rulesOf(note)).toEqual(expected);
  });
});

describe("月底", () => {
  it.each([
    ["月底匯款", [monthly(-1, "匯款")]],
    ["每月月底對帳", [monthly(-1, "對帳")]],
    ["每月底請款", [monthly(-1, "請款")]],
    ["每個月最後一天付款", [monthly(-1, "付款")]],
    ["每月15日及月底請款", [monthly(15, "請款"), monthly(-1, "請款")]],
    ["每月10號匯款，月底對帳", [monthly(10, "匯款"), monthly(-1, "對帳")]],
  ])("%s", (note, expected) => {
    expect(rulesOf(note)).toEqual(expected);
  });
});

describe("每週", () => {
  it.each([
    ["每週三送貨", [weekly(3, "送貨")]],
    ["每周五對帳", [weekly(5, "對帳")]],
    ["每星期一叫貨", [weekly(1, "叫貨")]],
    ["每禮拜二請款", [weekly(2, "請款")]],
    ["每週日盤點", [weekly(0, "盤點")]],
    ["每週一、四叫貨", [weekly(1, "叫貨"), weekly(4, "叫貨")]],
    ["每週二及週五送貨", [weekly(2, "送貨"), weekly(5, "送貨")]],
  ])("%s", (note, expected) => {
    expect(rulesOf(note)).toEqual(expected);
  });
});

describe("每年", () => {
  it.each([
    ["每年3月15日繳款", [yearly(3, 15, "繳款")]],
    ["每年十二月二十五號對帳", [yearly(12, 25, "對帳")]],
    ["每年 2/29 結帳", [yearly(2, 29, "結帳")]],
  ])("%s", (note, expected) => {
    expect(rulesOf(note)).toEqual(expected);
  });
});

describe("不應解析成規則（負面案例）", () => {
  it.each([
    "月結30天",
    "票期60天",
    "月結30日",
    "票期30日",
    "月結 60 天，開 30 天期票",
    "收貨後7日內付款",
    "地址：台北市中山路10號",
    "新北市板橋區文化路一段 25 號 3 樓",
    "電話 02-2345-6789",
    "每週一次對帳",
    "每月結算一次",
    "每月32號匯款",
    "每月1號至10號請款",
    "每月1至10號送貨",
    "每週一至週五送貨",
    "月結次月底付款",
    "10號匯款",
    "每年13月5日對帳",
    "每年2月30日對帳",
    "",
  ])("%s", (note) => {
    expect(rulesOf(note)).toEqual([]);
  });

  it("付款條件欄的「月結30天」「票期60天」也不產生規則", () => {
    expect(rulesOf(null, "月結30天，票期60天")).toEqual([]);
    expect(parseReminderText(null, "月結30天，票期60天").unparsed).toEqual([]);
  });
});

describe("待確認（疑似日期但無法解析）", () => {
  it.each([
    ["每月1號至10號請款"],
    ["月結次月底付款"],
    ["10號匯款"],
    ["每週一次對帳"],
    ["每月結算一次"],
    ["每週一至週五送貨"],
    ["每季對帳"],
    ["月初請款"],
  ])("%s → 列入待確認", (note) => {
    expect(parseReminderText(note).unparsed).toEqual([note]);
  });

  it.each([
    "月結30天",
    "票期60天",
    "月結30日",
    "票期30日",
    "收貨後7日內付款",
    "30日期票",
    "地址：台北市中山路10號",
    "請開三聯式發票",
    "帳號 012-345678",
  ])("%s → 不列入", (note) => {
    expect(parseReminderText(note).unparsed).toEqual([]);
  });

  it("同一段有可解析與不可解析的日期：規則照建，該段也列入待確認", () => {
    const r = parseReminderText("每月5號對帳，次月10號付款");
    expect(r.rules.map(brief)).toEqual([monthly(5, "對帳")]);
    expect(r.unparsed).toEqual(["每月5號對帳，次月10號付款"]);
  });
});

describe("備註格式（【欄名】內容，#273 匯入格式）", () => {
  it("逐行解析；匯款帳號、送貨地址整行略過", () => {
    const note = [
      "【備註】每月10號匯款",
      "【備註一】月底對帳",
      "【匯款帳號】台灣銀行 中山分行 帳號 012-34-567890 每月10號",
      "【送貨地址】台北市中山路10號3樓",
      "【備註二】每週三送貨",
    ].join("\n");
    const r = parseReminderText(note);
    expect(r.rules.map(brief)).toEqual([
      monthly(10, "匯款"),
      monthly(-1, "對帳"),
      weekly(3, "送貨"),
    ]);
    expect(r.unparsed).toEqual([]);
    expect(r.rules.map((x) => x.sourceText)).toEqual([
      "每月10號匯款",
      "月底對帳",
      "每週三送貨",
    ]);
  });

  it("欄位內容跨行時，後續行沿用同一欄（地址的第二行也略過）", () => {
    const note =
      "【送貨地址】台北市中山路10號\n2樓之3 5號門\n【備註】每月5號請款";
    expect(rulesOf(note)).toEqual([monthly(5, "請款")]);
    expect(parseReminderText(note).unparsed).toEqual([]);
  });

  it("以句號、分號分段", () => {
    expect(rulesOf("每月10號匯款。每週五對帳；月底請款")).toEqual([
      monthly(10, "匯款"),
      weekly(5, "對帳"),
      monthly(-1, "請款"),
    ]);
  });

  it("備註與付款條件一起解析；同一規則只出現一次（依日期與標題去重）", () => {
    const r = parseReminderText("每月10號匯款", "月結30天，每月10日匯款");
    expect(r.rules.map(brief)).toEqual([monthly(10, "匯款")]);
    expect(r.rules[0].sourceText).toBe("每月10號匯款");
  });

  it("付款條件的規則以「付款條件：」標示來源", () => {
    const r = parseReminderText(null, "每月25日請款");
    expect(r.rules[0].sourceText).toBe("付款條件：每月25日請款");
  });

  it("同一日不同事項為兩條規則", () => {
    expect(rulesOf("每月10號匯款，每月10號對帳")).toEqual([
      monthly(10, "匯款"),
      monthly(10, "對帳"),
    ]);
  });
});

describe("規則識別鍵", () => {
  it("由週期與標題組成，與原文無關（備註改寫但意思相同 → 同一條）", () => {
    const a = parseReminderText("每月10號匯款").rules[0];
    const b = parseReminderText("每個月 10 日 要匯款給廠商").rules[0];
    expect(a.key).toBe(b.key);
    expect(a.key).toBe("m:10:匯款");
    expect(ruleKey({ kind: "monthly", dayOfMonth: -1, title: "對帳" })).toBe(
      "m:-1:對帳",
    );
    expect(ruleKey({ kind: "weekly", weekday: 3, title: "送貨" })).toBe(
      "w:3:送貨",
    );
    expect(
      ruleKey({ kind: "yearly", month: 3, dayOfMonth: 15, title: "繳款" }),
    ).toBe("y:3-15:繳款");
  });
});

describe("review 修正：誤判與 #273 匯入格式", () => {
  it("不緊接「每月」的日期，其後須緊接事項（型號、倉別、分機不算）", () => {
    expect(rulesOf("每月10號送貨 共2箱 每箱5號電池")).toEqual([
      monthly(10, "送貨"),
    ]);
    expect(rulesOf("每月訂貨2次 3號鋼瓶")).toEqual([]);
    expect(rulesOf("每月10號匯款2萬元，3號倉")).toEqual([monthly(10, "匯款")]);
    expect(rulesOf("每月10號匯款（第2批20號再匯）")).toEqual([
      monthly(10, "匯款"),
    ]);
    // 原本支援的寫法不受影響
    expect(rulesOf("每月5號對帳，20號請款")).toEqual([
      monthly(5, "對帳"),
      monthly(20, "請款"),
    ]);
    expect(rulesOf("每月5號對帳，20號前付款")).toEqual([
      monthly(5, "對帳"),
      monthly(20, "付款"),
    ]);
  });

  it("特定月份的月底（10 月底、十二月底、本月底）不是每月月底，列入待確認", () => {
    for (const s of [
      "10月底前交貨",
      "10 月底前交貨",
      "十二月底結清",
      "本月底匯款",
    ]) {
      const r = parseReminderText(s);
      expect(r.rules, s).toEqual([]);
      expect(r.unparsed, s).toEqual([s]);
    }
    expect(rulesOf("當月底匯款")).toEqual([monthly(-1, "匯款")]);
    expect(rulesOf("每個月底匯款")).toEqual([monthly(-1, "匯款")]);
  });

  it("「 / 」（匯入時儲存格內的換行）視同換行：每月的前後文不跨到另一行", () => {
    const r = parseReminderText("【備註】每月25號匯款 / 聯絡人分機12號");
    expect(r.rules.map(brief)).toEqual([monthly(25, "匯款")]);
    expect(r.rules[0].sourceText).toBe("每月25號匯款");
    expect(rulesOf("【備註一】每月10號匯款 / 每月20號對帳")).toEqual([
      monthly(10, "匯款"),
      monthly(20, "對帳"),
    ]);
  });

  it("匯款帳號、送貨地址整行略過；其後無欄名的續行不建規則但列入待確認", () => {
    const note = [
      "【備註】每月10號匯款",
      "【匯款帳號】台銀 012-34567890 每月 10號",
      "【送貨地址】台中市中區民生路10號 每月5號",
      "每月20號對帳",
    ].join("\n");
    const r = parseReminderText(note);
    expect(r.rules.map(brief)).toEqual([monthly(10, "匯款")]);
    expect(r.unparsed).toEqual(["每月20號對帳"]);
  });
});
