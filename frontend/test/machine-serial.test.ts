import { describe, it, expect } from "vitest";
import {
  customerSerialPrefix,
  buildPrefixedSerial,
  parsePrefixedSerial,
} from "@/lib/admin/machine-serial";

describe("customerSerialPrefix", () => {
  it("去掉 (股) / 公司 等組織型態贅字", () => {
    expect(customerSerialPrefix("兆利科技股份有限公司")).toBe("兆利科技");
    expect(customerSerialPrefix("兆利科技(股)公司")).toBe("兆利科技");
    expect(customerSerialPrefix("兆利科技（股）公司")).toBe("兆利科技");
    expect(customerSerialPrefix("兆利實業有限公司")).toBe("兆利實業");
  });

  it("保留分廠括號，並去掉結尾的路線編號與空白", () => {
    // 卡片原文：和成欣業(股)公司(二廠) 25
    expect(customerSerialPrefix("和成欣業(股)公司(二廠) 25")).toBe(
      "和成欣業(二廠)",
    );
    // 卡片原文：本源興(股)公司 (三廠)25
    expect(customerSerialPrefix("本源興(股)公司 (三廠)25")).toBe(
      "本源興(三廠)",
    );
  });

  it("純英數名稱原樣保留，名稱本體的數字不會被誤刪", () => {
    expect(customerSerialPrefix("AIRTAC")).toBe("AIRTAC");
    expect(customerSerialPrefix("3M")).toBe("3M");
    expect(customerSerialPrefix("ABC123")).toBe("ABC123");
  });

  it("前綴自身不含連字號（連字號保留給前綴與機號的分隔）", () => {
    expect(customerSerialPrefix("A-ONE 精密")).toBe("AONE精密");
  });

  it("本體過長時只截短本體，保留結尾的分廠括號", () => {
    expect(customerSerialPrefix("超勁賀空壓科技實業發展中心(三廠)")).toBe(
      "超勁賀空壓科技實業發展中(三廠)",
    );
  });

  it("空字串 / 只有贅字時回空字串", () => {
    expect(customerSerialPrefix("")).toBe("");
    expect(customerSerialPrefix("   ")).toBe("");
    expect(customerSerialPrefix("股份有限公司")).toBe("");
  });
});

describe("buildPrefixedSerial", () => {
  it("組出「客戶名稱-機號」", () => {
    expect(buildPrefixedSerial("兆利科技股份有限公司", "A")).toBe("兆利科技-A");
    expect(buildPrefixedSerial("和成欣業(股)公司(二廠) 25", "1")).toBe(
      "和成欣業(二廠)-1",
    );
    expect(buildPrefixedSerial("本源興(股)公司 (三廠)25", "A機")).toBe(
      "本源興(三廠)-A機",
    );
  });

  it("suffix 為空時回「前綴-」，供表單把游標停在連字號後方", () => {
    expect(buildPrefixedSerial("兆利科技", "")).toBe("兆利科技-");
    expect(buildPrefixedSerial("兆利科技", "   ")).toBe("兆利科技-");
  });

  it("已含同一前綴時不重複加（不分大小寫）", () => {
    expect(buildPrefixedSerial("兆利科技", "兆利科技-A")).toBe("兆利科技-A");
    expect(buildPrefixedSerial("AIRTAC", "airtac-1")).toBe("airtac-1");
    // 只打了客戶名稱、還沒打機號 → 補上分隔的連字號。
    expect(buildPrefixedSerial("兆利科技", "兆利科技")).toBe("兆利科技-");
  });

  it("去掉使用者已打的前導連字號與全形連字號", () => {
    expect(buildPrefixedSerial("兆利科技", "-A")).toBe("兆利科技-A");
    expect(buildPrefixedSerial("兆利科技", "－A")).toBe("兆利科技-A");
  });

  it("客戶名稱正規化後為空時，原樣回傳 suffix", () => {
    expect(buildPrefixedSerial("", "A")).toBe("A");
    expect(buildPrefixedSerial("公司", "1號機")).toBe("1號機");
  });

  it("既有原廠機號加前綴也不會壞掉（仍可原樣沿用）", () => {
    expect(buildPrefixedSerial("", "J751307001")).toBe("J751307001");
  });
});

describe("parsePrefixedSerial", () => {
  it("拆出「前綴-機號代號」", () => {
    expect(parsePrefixedSerial("兆利科技-A")).toEqual({
      prefix: "兆利科技",
      suffix: "A",
    });
    expect(parsePrefixedSerial("和成欣業(二廠)-1")).toEqual({
      prefix: "和成欣業(二廠)",
      suffix: "1",
    });
    expect(parsePrefixedSerial("本源興-1號機")).toEqual({
      prefix: "本源興",
      suffix: "1號機",
    });
    expect(parsePrefixedSerial("本源興－A機")).toEqual({
      prefix: "本源興",
      suffix: "A機",
    });
  });

  it("既有原廠機號不受影響（沒有前綴）", () => {
    expect(parsePrefixedSerial("J751307001")).toEqual({
      prefix: null,
      suffix: "J751307001",
    });
  });

  it("過濾器型號不會被誤判成前綴", () => {
    expect(parsePrefixedSerial("LM-P-010")).toEqual({
      prefix: null,
      suffix: "LM-P-010",
    });
    expect(parsePrefixedSerial("AL-010N")).toEqual({
      prefix: null,
      suffix: "AL-010N",
    });
  });

  it("空字串 / 開頭就是連字號時不算前綴", () => {
    expect(parsePrefixedSerial("")).toEqual({ prefix: null, suffix: "" });
    expect(parsePrefixedSerial("-A")).toEqual({ prefix: null, suffix: "-A" });
  });

  it("與 buildPrefixedSerial 對稱：組出來的機號拆得回原前綴", () => {
    const name = "和成欣業(股)公司(二廠) 25";
    const serial = buildPrefixedSerial(name, "1");
    expect(parsePrefixedSerial(serial)).toEqual({
      prefix: customerSerialPrefix(name),
      suffix: "1",
    });
  });
});
