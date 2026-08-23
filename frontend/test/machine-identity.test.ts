import { describe, it, expect } from "vitest";
import {
  customerShortName,
  machineDisplayName,
  machineTagLabel,
  UNNAMED_MACHINE,
} from "@/lib/admin/machine-identity";

// 三段式識別「客戶-機台代號-機號」的顯示組字。客戶名稱正規化沿用 #157／PR #162
// 已審過三輪的規則，但**只用於顯示**，不寫進 DB。

describe("customerShortName", () => {
  it("去掉 (股) / 公司 等組織型態贅字", () => {
    expect(customerShortName("兆利科技股份有限公司")).toBe("兆利科技");
    expect(customerShortName("兆利科技(股)公司")).toBe("兆利科技");
    expect(customerShortName("兆利科技（股）公司")).toBe("兆利科技");
    expect(customerShortName("兆利實業有限公司")).toBe("兆利實業");
  });

  it("保留分廠括號，並去掉結尾的路線編號與空白", () => {
    // 卡片原文：和成欣業(股)公司(二廠) 25
    expect(customerShortName("和成欣業(股)公司(二廠) 25")).toBe(
      "和成欣業(二廠)",
    );
    // 卡片原文：本源興(股)公司 (三廠)25
    expect(customerShortName("本源興(股)公司 (三廠)25")).toBe("本源興(三廠)");
  });

  it("純英數名稱原樣保留，名稱本體的數字不會被誤刪", () => {
    expect(customerShortName("AIRTAC")).toBe("AIRTAC");
    expect(customerShortName("3M")).toBe("3M");
    expect(customerShortName("ABC123")).toBe("ABC123");
  });

  it("短名自身不含連字號（連字號是三段識別的分隔符）", () => {
    expect(customerShortName("A-ONE 精密")).toBe("AONE精密");
  });

  it("本體過長時只截短本體，保留結尾的分廠括號", () => {
    expect(customerShortName("超勁賀空壓科技實業發展中心(三廠)")).toBe(
      "超勁賀空壓科技實業發展中(三廠)",
    );
  });

  it("截斷以字元（code point）為單位，不會把 CJK 擴充區的字剖成半個", () => {
    // 「𠮷」是 surrogate pair（UTF-16 佔 2 格）。本體給 13 個字，確保真的走到
    // 截斷分支；用 String#slice 會在第 12 個 UTF-16 格切斷、留下半個而變亂碼。
    const out = customerShortName(`試${"𠮷".repeat(12)}公司`);
    expect(out).toBe(`試${"𠮷".repeat(11)}`);
    expect(Array.from(out)).toHaveLength(12);
    // 配對掉所有 surrogate pair 後不應再剩落單的 surrogate。
    const paired = out.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "");
    expect(/[\uD800-\uDFFF]/.test(paired)).toBe(false);
  });

  it("本體長度剛好等於上限時不截斷", () => {
    const out = customerShortName(`試${"𠮷".repeat(11)}公司`);
    expect(out).toBe(`試${"𠮷".repeat(11)}`);
  });

  it("空字串 / 只有贅字 / null 一律回空字串", () => {
    expect(customerShortName("")).toBe("");
    expect(customerShortName("   ")).toBe("");
    expect(customerShortName("股份有限公司")).toBe("");
    expect(customerShortName(null)).toBe("");
    expect(customerShortName(undefined)).toBe("");
  });
});

describe("machineDisplayName", () => {
  it("三段齊全 → 客戶-代號-機號", () => {
    expect(
      machineDisplayName("兆利科技股份有限公司", {
        machine_no: "A機",
        serial_no: "100HA",
      }),
    ).toBe("兆利科技-A機-100HA");
  });

  it("接受客戶物件（頁面多半直接把 customer 傳進來）", () => {
    expect(
      machineDisplayName(
        { name: "和成欣業(股)公司(二廠) 25" },
        { machine_no: "A01 銅器部", serial_no: "J751307001" },
      ),
    ).toBe("和成欣業(二廠)-A01 銅器部-J751307001");
  });

  it("既有卡只有機號、沒有代號 → 不留多餘連字號", () => {
    expect(
      machineDisplayName("兆利科技", {
        machine_no: null,
        serial_no: "J751307001",
      }),
    ).toBe("兆利科技-J751307001");
    expect(
      machineDisplayName("兆利科技", {
        machine_no: "  ",
        serial_no: "J751307001",
      }),
    ).toBe("兆利科技-J751307001");
  });

  it("只有代號、沒有機號（過濾卡常見）→ 不留多餘連字號", () => {
    expect(
      machineDisplayName("兆利科技", { machine_no: "1號機", serial_no: null }),
    ).toBe("兆利科技-1號機");
  });

  it("客戶名稱正規化後為空 → 只出機台的兩段", () => {
    expect(
      machineDisplayName("公司", { machine_no: "A機", serial_no: "AD480" }),
    ).toBe("A機-AD480");
    expect(
      machineDisplayName(null, { machine_no: "A機", serial_no: "AD480" }),
    ).toBe("A機-AD480");
  });

  it("三段全空 → 佔位字串（DB 的 identity check 保證不會發生）", () => {
    expect(machineDisplayName(null, {})).toBe(UNNAMED_MACHINE);
    expect(machineDisplayName("", { machine_no: "", serial_no: "" })).toBe(
      UNNAMED_MACHINE,
    );
  });

  it("不同客戶的同代號 / 同機號各自組出可區分的識別", () => {
    const a = machineDisplayName("兆利科技", {
      machine_no: "A機",
      serial_no: "AD480",
    });
    const b = machineDisplayName("和成欣業(股)公司", {
      machine_no: "A機",
      serial_no: "AD480",
    });
    expect(a).not.toBe(b);
  });
});

describe("machineTagLabel", () => {
  it("不含客戶的兩段識別", () => {
    expect(machineTagLabel({ machine_no: "A機", serial_no: "100HA" })).toBe(
      "A機-100HA",
    );
    expect(machineTagLabel({ serial_no: "J751307001" })).toBe("J751307001");
    expect(machineTagLabel({ machine_no: "B機" })).toBe("B機");
  });
});
