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

  it("有代號 → 以代號比對（不分大小寫、去頭尾空白，同 0018 的索引）", async () => {
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
  });

  it("沒有機號 → 不查 DB（代號跨客戶必然重複，拿它比等於亂猜）", async () => {
    fakeSupabase([row("m-9", "A機", null)]);
    expect(await findMachineAcrossCustomers({ serialNo: "" })).toBeNull();
    expect(getServerSupabase).not.toHaveBeenCalled();
  });
});
