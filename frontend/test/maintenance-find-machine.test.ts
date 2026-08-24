import { describe, it, expect, vi, beforeEach } from "vitest";

// #165 的核心：客戶範圍內的機台比對。這支測試釘住的是「比不到 / 比錯」各自的代價：
//   * 比不到（false negative）→ 匯入時多開一張重複卡；
//   * 比錯（false positive）→ 把維護列附加到同客戶的另一台機器上。
// 特別針對既有資料：現有卡幾乎清一色只有機號（machine_no 為 null），而辨識 prompt
// 現在會積極抓出卡上手寫的「A機」——「有代號就只比代號」會讓每次重拍都變重複卡。
const getServerSupabase = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase-server", () => ({ getServerSupabase }));

import {
  findMachine,
  findMachineAcrossCustomers,
  findMachineByTag,
} from "@/lib/admin/maintenance";

type Row = Record<string, unknown>;
type Call = { method: string; args: unknown[] };

/** 假 client：所有查詢都回同一批列，並記下 filter 呼叫供斷言。 */
function fakeSupabase(rows: Row[]) {
  const calls: Call[] = [];
  const builder: Record<string, unknown> = {
    then: (resolve: (r: { data: unknown; error: null }) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve),
  };
  for (const m of ["select", "eq", "is", "ilike", "limit", "order"]) {
    builder[m] = (...args: unknown[]) => {
      calls.push({ method: m, args });
      return builder;
    };
  }
  getServerSupabase.mockResolvedValue({ from: () => builder });
  return calls;
}

/** 一列 mx_machines（含 join 的客戶）。 */
function row(
  id: string,
  machine_no: string | null,
  serial_no: string | null,
): Row {
  return {
    id,
    machine_no,
    serial_no,
    card_type: "compressor",
    customer_id: "cust-1",
    mx_customers: { name: "兆利科技股份有限公司", code: "KC054" },
  };
}

beforeEach(() => {
  getServerSupabase.mockReset();
});

describe("findMachine — 客戶範圍內的比對", () => {
  it("查詢一律框在該客戶、該卡別、未封存", async () => {
    const calls = fakeSupabase([]);
    await findMachine({
      customerId: "cust-1",
      machineNo: "A機",
      cardType: "filter",
    });
    expect(calls).toContainEqual({ method: "is", args: ["archived_at", null] });
    expect(calls).toContainEqual({
      method: "eq",
      args: ["customer_id", "cust-1"],
    });
    expect(calls).toContainEqual({
      method: "eq",
      args: ["card_type", "filter"],
    });
  });

  it("客戶未定 / 兩段皆空 → 不查 DB，直接回 null", async () => {
    fakeSupabase([row("m-1", "A機", "AD480")]);
    expect(await findMachine({ customerId: "", machineNo: "A機" })).toBeNull();
    expect(
      await findMachine({ customerId: "cust-1", machineNo: " ", serialNo: "" }),
    ).toBeNull();
    expect(getServerSupabase).not.toHaveBeenCalled();
  });

  it("有代號 → 以代號比對（不分大小寫、去頭尾空白，同 0019 的索引）", async () => {
    fakeSupabase([row("m-1", "A機", "AD480"), row("m-2", "b機", "AD480")]);
    const hit = await findMachine({
      customerId: "cust-1",
      machineNo: " B機 ",
      serialNo: "AD480",
    });
    expect(hit?.id).toBe("m-2");
  });

  it("既有卡只有機號、照片卻讀出了代號 → 仍要比到那張卡，不可多開一張", async () => {
    // 這是既有資料的常態：DB 裡 machine_no 是 null，辨識 prompt 現在會抓到「A機」。
    fakeSupabase([row("m-1", null, "J751307001")]);
    const hit = await findMachine({
      customerId: "cust-1",
      machineNo: "A機",
      serialNo: "J751307001",
    });
    expect(hit?.id).toBe("m-1");
  });

  it("代號比不到時，只退回比對「沒有代號」的卡", async () => {
    // 同客戶兩台 AD480，靠 A機／B機 區分。照片是還沒建卡的「C機」，
    // 退回比機號若把 A機 那張認成同一台，B 機的維護列就寫到 A 機去了。
    fakeSupabase([row("m-1", "A機", "AD480"), row("m-2", "B機", "AD480")]);
    const hit = await findMachine({
      customerId: "cust-1",
      machineNo: "C機",
      serialNo: "AD480",
    });
    expect(hit).toBeNull();
  });

  it("沒有代號 → 以機號比對，並優先挑同樣沒有代號的那張", async () => {
    fakeSupabase([row("m-1", "A機", "AD480"), row("m-2", null, "AD480")]);
    const hit = await findMachine({ customerId: "cust-1", serialNo: "ad480" });
    expect(hit?.id).toBe("m-2");
  });

  // ── confident 旗標：命中「能不能當成確定是同一台」 ──────────────
  // 比不到只是多開一張重複卡（看得見、刪得掉）；比錯是把維護列靜靜接到同客戶的
  // 另一台機器上（看不出來）。分不出來的情況一律 confident=false，UI 不預設附加。

  it("代號命中 → confident（代號在同一客戶、同一卡別內唯一）", async () => {
    fakeSupabase([row("m-1", "A機", "J751307001")]);
    const hit = await findMachine({ customerId: "cust-1", machineNo: "A機" });
    expect(hit?.confident).toBe(true);
  });

  it("空壓機卡：照片有代號、只比到沒代號的同機號卡 → confident（原廠序號唯一）", async () => {
    fakeSupabase([row("m-1", null, "J751307001")]);
    const hit = await findMachine({
      customerId: "cust-1",
      machineNo: "A機",
      serialNo: "J751307001",
      cardType: "compressor",
    });
    expect(hit?.id).toBe("m-1");
    expect(hit?.confident).toBe(true);
  });

  it("過濾卡：照片有代號、只比到沒代號的同型號卡 → 命中但 not confident", async () => {
    // 這是 #165 驗收「同客戶兩台 AD480 靠 A機／B機 區分」的**過渡狀態**：
    // 舊卡還沒補代號，照片是另一台的 B機。m-1 可能就是這台（還沒補代號），
    // 也可能是另一台 AD480 —— 資料上分不出來，不可預設附加。
    fakeSupabase([row("m-1", null, "AD480")]);
    const hit = await findMachine({
      customerId: "cust-1",
      machineNo: "B機",
      serialNo: "AD480",
      cardType: "filter",
    });
    expect(hit?.id).toBe("m-1");
    expect(hit?.confident).toBe(false);
  });

  it("過濾卡：照片沒代號、比到唯一一張同型號卡（沒代號）→ confident", async () => {
    // 既有資料的常態：客戶只有一張 AD480 卡、還沒補代號，照片也沒讀到代號。
    // 資料裡沒有任何「還有第二台」的跡象 → 這一步不該讓員工多按一下。
    fakeSupabase([row("m-1", null, "AD480")]);
    const hit = await findMachine({
      customerId: "cust-1",
      serialNo: "AD480",
      cardType: "filter",
    });
    expect(hit?.id).toBe("m-1");
    expect(hit?.confident).toBe(true);
  });

  it("過濾卡：照片沒代號、同型號底下另有「有代號」的卡 → 挑沒代號那張但 not confident", async () => {
    // 過渡狀態：客戶兩台 AD480，一張已補「A機」、一張還沒補代號。
    // 照片沒讀到代號**不代表**這台沒有代號（代號常手寫在卡邊，漏讀是常態），
    // 所以照片可能正是 A機 那台。此時預設附加就會把 A機 的維護列靜靜接到另一張卡上。
    fakeSupabase([row("m-1", "A機", "AD480"), row("m-2", null, "AD480")]);
    const hit = await findMachine({
      customerId: "cust-1",
      serialNo: "AD480",
      cardType: "filter",
    });
    expect(hit?.id).toBe("m-2");
    expect(hit?.confident).toBe(false);
  });

  it("空壓機卡：照片沒代號、同機號底下另有「有代號」的卡 → 仍 confident（原廠序號＝同一台）", async () => {
    fakeSupabase([
      row("m-1", "A機", "J751307001"),
      row("m-2", null, "J751307001"),
    ]);
    const hit = await findMachine({
      customerId: "cust-1",
      serialNo: "J751307001",
      cardType: "compressor",
    });
    expect(hit?.id).toBe("m-2");
    expect(hit?.confident).toBe(true);
  });

  it("照片沒代號、只剩多張有代號的同機號卡 → 取第一張但 not confident", async () => {
    // 同客戶兩台 AD480（A機／B機）都已建卡，照片沒讀到代號：取哪一張都是擲骰子。
    fakeSupabase([row("m-1", "A機", "AD480"), row("m-2", "B機", "AD480")]);
    const hit = await findMachine({
      customerId: "cust-1",
      serialNo: "AD480",
      cardType: "filter",
    });
    expect(hit?.id).toBe("m-1");
    expect(hit?.confident).toBe(false);
  });

  it("空壓機卡：照片沒代號、只有一張同機號的有代號卡 → confident", async () => {
    fakeSupabase([row("m-1", "A機", "J751307001")]);
    const hit = await findMachine({
      customerId: "cust-1",
      serialNo: "J751307001",
      cardType: "compressor",
    });
    expect(hit?.id).toBe("m-1");
    expect(hit?.confident).toBe(true);
  });

  it("命中結果帶回客戶資訊（join 可能是物件或陣列）", async () => {
    const r = row("m-1", "A機", "AD480");
    r.mx_customers = [{ name: "兆利科技股份有限公司", code: "KC054" }];
    fakeSupabase([r]);
    const hit = await findMachine({ customerId: "cust-1", machineNo: "A機" });
    expect(hit).toMatchObject({
      id: "m-1",
      customer_id: "cust-1",
      customer_name: "兆利科技股份有限公司",
      customer_code: "KC054",
    });
  });
});

describe("findMachineAcrossCustomers — 只比機號", () => {
  it("以機號跨客戶粗篩後再精確比對", async () => {
    const calls = fakeSupabase([row("m-9", "A機", "AD480")]);
    const hit = await findMachineAcrossCustomers({ serialNo: " AD480 " });
    expect(hit?.id).toBe("m-9");
    expect(calls).toContainEqual({
      method: "ilike",
      args: ["serial_no", "ad480"],
    });
    // 別的客戶的卡永遠只是提示，不是「確定是同一台」。
    expect(hit?.confident).toBe(false);
  });

  it("沒有機號 → 不查 DB（代號跨客戶必然重複，拿它比等於亂猜）", async () => {
    fakeSupabase([row("m-9", "A機", null)]);
    expect(await findMachineAcrossCustomers({ serialNo: "" })).toBeNull();
    expect(getServerSupabase).not.toHaveBeenCalled();
  });
});

// 建卡 / 改卡的衝突預檢。比對範圍**必須**與 0019 的 mx_machines_customer_tag_key
// (customer_id, card_type, lower(btrim(machine_no))) 一致 —— 少帶卡別就會擋下
// DB 其實接受的資料（乾燥機卡沿用空壓機的「A機」）。
describe("findMachineByTag — 預檢範圍是 (客戶, 卡別, 代號)", () => {
  it("查詢框在該客戶、該卡別、未封存", async () => {
    const calls = fakeSupabase([]);
    await findMachineByTag("cust-1", "A機", "filter");
    expect(calls).toContainEqual({ method: "is", args: ["archived_at", null] });
    expect(calls).toContainEqual({
      method: "eq",
      args: ["customer_id", "cust-1"],
    });
    expect(calls).toContainEqual({
      method: "eq",
      args: ["card_type", "filter"],
    });
  });

  it("同客戶同卡別的同代號 → 命中且 confident", async () => {
    fakeSupabase([row("m-1", " a機 ", "J751307001")]);
    const hit = await findMachineByTag("cust-1", "A機", "compressor");
    expect(hit?.id).toBe("m-1");
    expect(hit?.confident).toBe(true);
  });

  it("編輯既有卡時排除自己", async () => {
    fakeSupabase([row("m-1", "A機", "J751307001")]);
    expect(
      await findMachineByTag("cust-1", "A機", "compressor", "m-1"),
    ).toBeNull();
  });

  it("沒有代號 → 不查 DB", async () => {
    fakeSupabase([row("m-1", "A機", "J751307001")]);
    expect(await findMachineByTag("cust-1", " ", "compressor")).toBeNull();
    expect(getServerSupabase).not.toHaveBeenCalled();
  });
});
