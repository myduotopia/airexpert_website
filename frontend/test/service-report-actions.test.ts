import { describe, it, expect, vi, beforeEach } from "vitest";

// 機台維護報告單 server actions（mock supabase，同 erp-purchasing-actions.test.ts 模式）：
//   1. 未授權 → 全部拒絕且不碰 DB / RPC；
//   2. 各狀態轉換的前置條件與條件更新（0 列 → 狀態已變更）；
//   3. 作廢需原因、刪除限未列印草稿；
//   4. 單號重複（23505）訊息、自動取號；
//   5. 記錄列印：次數 +1、draft → printed、以 print_count 條件更新並重試。

type Kind = "select" | "insert" | "update" | "delete";
interface Recorded {
  table: string;
  kind: Kind;
  payload: unknown;
  filters: { fn: string; args: unknown[] }[];
}
type Res = {
  data: unknown;
  error: { code?: string; message: string; details?: string } | null;
};

let recorded: Recorded[] = [];
let responses: Record<string, (q: Query) => Res> = {};
let rpcCalls: { fn: string; args: unknown }[] = [];
let rpcResponses: Res[] = [];
let moduleGranted = true;
const revalidateSpy = vi.fn();

class Query implements PromiseLike<Res> {
  kind: Kind = "select";
  payload: unknown = null;
  filters: { fn: string; args: unknown[] }[] = [];
  constructor(public table: string) {}
  select(): this {
    return this;
  }
  insert(payload: unknown): this {
    this.kind = "insert";
    this.payload = payload;
    return this;
  }
  update(payload: unknown): this {
    this.kind = "update";
    this.payload = payload;
    return this;
  }
  delete(): this {
    this.kind = "delete";
    return this;
  }
  private f(fn: string, args: unknown[]): this {
    this.filters.push({ fn, args });
    return this;
  }
  eq(...a: unknown[]): this {
    return this.f("eq", a);
  }
  in(...a: unknown[]): this {
    return this.f("in", a);
  }
  single(): this {
    return this;
  }
  maybeSingle(): this {
    return this;
  }
  private run(): Res {
    recorded.push({
      table: this.table,
      kind: this.kind,
      payload: this.payload,
      filters: this.filters,
    });
    const r = responses[`${this.table}:${this.kind}`];
    if (r) return r(this);
    return { data: null, error: null };
  }
  then<A = Res, B = never>(
    ok?: ((v: Res) => A | PromiseLike<A>) | null,
    bad?: ((r: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(ok, bad);
  }
}

const fakeSupabase = {
  from: (table: string) => new Query(table),
  rpc: async (fn: string, args: unknown) => {
    rpcCalls.push({ fn, args });
    return rpcResponses.shift() ?? { data: null, error: null };
  },
};

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidateSpy(...args),
}));
vi.mock("@/lib/admin/auth", () => ({
  hasModule: vi.fn(
    async (m: string) => moduleGranted && m === "service_report",
  ),
}));
vi.mock("@/lib/supabase-server", () => ({
  getServerSupabase: vi.fn(async () => fakeSupabase),
}));

import {
  completeReportAction,
  deleteDraftReportAction,
  nextReportNoAction,
  recordPrintAction,
  reopenReportAction,
  saveReportAction,
  voidReportAction,
} from "@/app/admin/(protected)/service-reports/actions";
import {
  emptySheetData,
  type ServiceReportInput,
} from "@/lib/service-report/types";

const ID = "11111111-2222-4333-8444-555555555555";
const STALE = "報告單狀態已變更，請重新整理";

function input(over: Partial<ServiceReportInput> = {}): ServiceReportInput {
  return {
    ...emptySheetData(),
    report_no: "",
    report_date: "2026-09-15",
    customer_id: null,
    machine_id: null,
    note: null,
    ...over,
  };
}

/** 讀取時回傳的列（select），更新 / 刪除時回傳的列數。 */
function row(r: Record<string, unknown>, affected = 1) {
  responses["sr_reports:select"] = () => ({
    data: { id: ID, print_count: 0, first_printed_at: null, ...r },
    error: null,
  });
  const mutate = () => ({
    data: Array.from({ length: affected }, () => ({ id: ID })),
    error: null,
  });
  responses["sr_reports:update"] = mutate;
  responses["sr_reports:delete"] = mutate;
}

const updates = () => recorded.filter((r) => r.kind === "update");
const filterOf = (r: Recorded, fn: string, col: string) =>
  r.filters.find((f) => f.fn === fn && f.args[0] === col)?.args[1];

beforeEach(() => {
  recorded = [];
  responses = {};
  rpcCalls = [];
  rpcResponses = [];
  moduleGranted = true;
  revalidateSpy.mockClear();
});

describe("未授權", () => {
  it("所有 action 皆拒絕且不碰 DB / RPC", async () => {
    moduleGranted = false;
    const results = await Promise.all([
      nextReportNoAction("2026-09-15"),
      saveReportAction(input()),
      recordPrintAction(ID),
      completeReportAction(ID),
      reopenReportAction(ID),
      voidReportAction(ID, "取消"),
      deleteDraftReportAction(ID),
    ]);
    for (const r of results) {
      expect(r).toEqual({ ok: false, error: "沒有機台維護報告單權限" });
    }
    expect(recorded).toEqual([]);
    expect(rpcCalls).toEqual([]);
    expect(revalidateSpy).not.toHaveBeenCalled();
  });
});

describe("nextReportNoAction", () => {
  it("呼叫 sr_next_report_no(p_date)", async () => {
    rpcResponses = [{ data: "X11509009", error: null }];
    const r = await nextReportNoAction("2026-09-15");
    expect(r).toEqual({ ok: true, data: { report_no: "X11509009" } });
    expect(rpcCalls).toEqual([
      { fn: "sr_next_report_no", args: { p_date: "2026-09-15" } },
    ]);
  });
  it("日期錯誤不呼叫 RPC；RPC 錯誤帶 detail", async () => {
    expect(await nextReportNoAction("2026-02-30")).toEqual({
      ok: false,
      error: "維護日期不正確",
    });
    expect(rpcCalls).toEqual([]);
    rpcResponses = [
      {
        data: null,
        error: { code: "P0001", message: "forbidden", details: "沒有權限X" },
      },
    ];
    expect(await nextReportNoAction("2026-09-15")).toEqual({
      ok: false,
      error: "沒有權限X",
    });
  });
});

describe("saveReportAction", () => {
  it("驗證失敗不碰 DB", async () => {
    const r = await saveReportAction(input({ report_date: "" }));
    expect(r).toEqual({ ok: false, error: "請輸入維護日期" });
    expect(recorded).toEqual([]);
  });

  it("新增、單號空白 → 取號後以 draft 寫入", async () => {
    rpcResponses = [{ data: "X11509010", error: null }];
    responses["sr_reports:insert"] = () => ({
      data: { id: ID, report_no: "X11509010" },
      error: null,
    });
    const r = await saveReportAction(input({ customer_name: " 金凱 " }));
    expect(r).toEqual({ ok: true, data: { id: ID, report_no: "X11509010" } });
    expect(rpcCalls).toHaveLength(1);
    const ins = recorded.find((x) => x.kind === "insert")!;
    expect(ins.payload).toMatchObject({
      report_no: "X11509010",
      status: "draft",
      customer_name: "金凱",
    });
    expect(ins.payload).not.toHaveProperty("print_count");
    expect(revalidateSpy).toHaveBeenCalledWith("/admin/service-reports");
    expect(revalidateSpy).toHaveBeenCalledWith(`/admin/service-reports/${ID}`);
  });

  it("新增、手動單號 → 不取號、正規化後寫入；重複 → 派工單號已存在", async () => {
    responses["sr_reports:insert"] = () => ({
      data: null,
      error: { code: "23505", message: "duplicate key" },
    });
    const r = await saveReportAction(input({ report_no: " x11509009" }));
    expect(r).toEqual({ ok: false, error: "派工單號已存在" });
    expect(rpcCalls).toEqual([]);
    expect(recorded.filter((x) => x.kind === "insert")).toHaveLength(1);
    expect(recorded[0].payload).toMatchObject({ report_no: "X11509009" });
  });

  it("自動取號撞號 → 重新取號再試", async () => {
    rpcResponses = [
      { data: "X11509011", error: null },
      { data: "X11509012", error: null },
    ];
    let n = 0;
    responses["sr_reports:insert"] = (q) =>
      n++ === 0
        ? { data: null, error: { code: "23505", message: "dup" } }
        : {
            data: {
              id: ID,
              report_no: (q.payload as { report_no: string }).report_no,
            },
            error: null,
          };
    const r = await saveReportAction(input());
    expect(r).toEqual({ ok: true, data: { id: ID, report_no: "X11509012" } });
    expect(rpcCalls).toHaveLength(2);
  });

  it("自動取號 3 次皆撞號 → 自動編號失敗（非「派工單號已存在」）", async () => {
    rpcResponses = [
      { data: "X11509011", error: null },
      { data: "X11509012", error: null },
      { data: "X11509013", error: null },
    ];
    responses["sr_reports:insert"] = () => ({
      data: null,
      error: { code: "23505", message: "dup" },
    });
    const r = await saveReportAction(input());
    expect(r).toEqual({
      ok: false,
      error: "自動編號失敗，請稍後再試或手動輸入派工單號",
    });
    expect(rpcCalls).toHaveLength(3);
  });

  it("編輯：限可編輯狀態、不動狀態與列印欄位", async () => {
    responses["sr_reports:update"] = () => ({
      data: [{ id: ID, report_no: "X11509009" }],
      error: null,
    });
    const r = await saveReportAction(
      input({ id: ID, report_no: "X11509009", summary: "ok" }),
    );
    expect(r).toEqual({ ok: true, data: { id: ID, report_no: "X11509009" } });
    const u = updates()[0];
    expect(filterOf(u, "eq", "id")).toBe(ID);
    expect(filterOf(u, "in", "status")).toEqual([
      "draft",
      "printed",
      "completed",
    ]);
    for (const k of [
      "id",
      "status",
      "print_count",
      "first_printed_at",
      "last_printed_at",
      "completed_at",
      "voided_at",
      "void_reason",
    ]) {
      expect(u.payload).not.toHaveProperty(k);
    }
    expect(rpcCalls).toEqual([]);
  });

  it("編輯：已列印過的報告單改派工單號 → 拒絕且不送更新", async () => {
    responses["sr_reports:select"] = () => ({
      data: { report_no: "X11509009", print_count: 2 },
      error: null,
    });
    responses["sr_reports:update"] = () => ({
      data: [{ id: ID, report_no: "X11509010" }],
      error: null,
    });
    const r = await saveReportAction(input({ id: ID, report_no: "x11509010" }));
    expect(r).toEqual({ ok: false, error: "已列印的報告單不可改派工單號" });
    expect(updates()).toHaveLength(0);
  });

  it("編輯：已列印但單號不變（正規化後相同）→ 照常更新", async () => {
    responses["sr_reports:select"] = () => ({
      data: { report_no: "X11509009", print_count: 1 },
      error: null,
    });
    responses["sr_reports:update"] = () => ({
      data: [{ id: ID, report_no: "X11509009" }],
      error: null,
    });
    const r = await saveReportAction(
      input({ id: ID, report_no: " x11509009 ", summary: "ok" }),
    );
    expect(r).toEqual({ ok: true, data: { id: ID, report_no: "X11509009" } });
    expect(updates()).toHaveLength(1);
  });

  it("編輯：未列印的報告單可改派工單號", async () => {
    responses["sr_reports:select"] = () => ({
      data: { report_no: "X11509009", print_count: 0 },
      error: null,
    });
    responses["sr_reports:update"] = () => ({
      data: [{ id: ID, report_no: "X11509010" }],
      error: null,
    });
    const r = await saveReportAction(input({ id: ID, report_no: "X11509010" }));
    expect(r).toEqual({ ok: true, data: { id: ID, report_no: "X11509010" } });
  });

  it("編輯：0 列（已作廢 / 不存在）→ 狀態已變更；23505 → 單號已存在", async () => {
    responses["sr_reports:update"] = () => ({ data: [], error: null });
    expect(
      await saveReportAction(input({ id: ID, report_no: "X11509009" })),
    ).toEqual({ ok: false, error: STALE });
    responses["sr_reports:update"] = () => ({
      data: null,
      error: { code: "23505", message: "dup" },
    });
    expect(
      await saveReportAction(input({ id: ID, report_no: "X11509009" })),
    ).toEqual({ ok: false, error: "派工單號已存在" });
  });
});

describe("recordPrintAction", () => {
  it("draft → printed、次數 +1、首次 / 最後列印時間", async () => {
    row({ status: "draft", print_count: 0, first_printed_at: null });
    const r = await recordPrintAction(ID);
    expect(r).toEqual({
      ok: true,
      data: { print_count: 1, status: "printed" },
    });
    const u = updates()[0];
    const p = u.payload as Record<string, unknown>;
    expect(p.print_count).toBe(1);
    expect(p.status).toBe("printed");
    expect(typeof p.first_printed_at).toBe("string");
    expect(p.last_printed_at).toBe(p.first_printed_at);
    expect(filterOf(u, "eq", "print_count")).toBe(0);
    expect(filterOf(u, "eq", "status")).toBe("draft");
  });

  it("已結案再印：保持 completed、保留首次列印時間", async () => {
    row({
      status: "completed",
      print_count: 2,
      first_printed_at: "2026-09-01T00:00:00Z",
    });
    const r = await recordPrintAction(ID);
    expect(r).toEqual({
      ok: true,
      data: { print_count: 3, status: "completed" },
    });
    const p = updates()[0].payload as Record<string, unknown>;
    expect(p.first_printed_at).toBe("2026-09-01T00:00:00Z");
    expect(p.status).toBe("completed");
  });

  it("併發：第一次 0 列 → 重讀重試一次", async () => {
    let reads = 0;
    responses["sr_reports:select"] = () => ({
      data: {
        id: ID,
        status: "printed",
        print_count: reads++ === 0 ? 1 : 2,
        first_printed_at: "2026-09-01T00:00:00Z",
      },
      error: null,
    });
    let writes = 0;
    responses["sr_reports:update"] = () => ({
      data: writes++ === 0 ? [] : [{ id: ID }],
      error: null,
    });
    const r = await recordPrintAction(ID);
    expect(r).toEqual({
      ok: true,
      data: { print_count: 3, status: "printed" },
    });
    expect(updates()).toHaveLength(2);
    expect(filterOf(updates()[1], "eq", "print_count")).toBe(2);
  });

  it("兩次都 0 列 → 狀態已變更", async () => {
    row({ status: "printed", print_count: 1 }, 0);
    expect(await recordPrintAction(ID)).toEqual({ ok: false, error: STALE });
    expect(updates()).toHaveLength(2);
  });

  it("作廢單不可列印；不存在 / 非 UUID", async () => {
    row({ status: "voided" });
    expect(await recordPrintAction(ID)).toEqual({
      ok: false,
      error: "已作廢的報告單不可列印",
    });
    expect(updates()).toEqual([]);
    responses["sr_reports:select"] = () => ({ data: null, error: null });
    expect(await recordPrintAction(ID)).toEqual({
      ok: false,
      error: "找不到報告單",
    });
    recorded = [];
    expect(await recordPrintAction("abc")).toEqual({
      ok: false,
      error: "找不到報告單",
    });
    expect(recorded).toEqual([]);
  });
});

describe("completeReportAction / reopenReportAction", () => {
  it("結案：printed → completed（條件更新）", async () => {
    row({ status: "printed" });
    expect(await completeReportAction(ID)).toEqual({
      ok: true,
      data: { id: ID, status: "completed" },
    });
    const u = updates()[0];
    expect(u.payload).toMatchObject({ status: "completed" });
    expect(typeof (u.payload as Record<string, unknown>).completed_at).toBe(
      "string",
    );
    expect(filterOf(u, "in", "status")).toEqual(["printed"]);
  });

  it("結案：非 printed 拒絕、不更新", async () => {
    for (const status of ["draft", "completed", "voided"]) {
      recorded = [];
      row({ status });
      expect(await completeReportAction(ID)).toEqual({
        ok: false,
        error: "只有已列印的報告單可以結案",
      });
      expect(updates()).toEqual([]);
    }
  });

  it("結案：讀到 printed 但更新 0 列 → 狀態已變更", async () => {
    row({ status: "printed" }, 0);
    expect(await completeReportAction(ID)).toEqual({ ok: false, error: STALE });
  });

  it("重新開啟：completed → printed、清結案時間", async () => {
    row({ status: "completed" });
    expect(await reopenReportAction(ID)).toEqual({
      ok: true,
      data: { id: ID, status: "printed" },
    });
    const u = updates()[0];
    expect(u.payload).toEqual({ status: "printed", completed_at: null });
    expect(filterOf(u, "in", "status")).toEqual(["completed"]);
  });

  it("重新開啟：非 completed 拒絕", async () => {
    row({ status: "printed" });
    expect(await reopenReportAction(ID)).toEqual({
      ok: false,
      error: "只有已結案的報告單可以重新開啟",
    });
    expect(updates()).toEqual([]);
  });
});

describe("voidReportAction", () => {
  it("需原因（不碰 DB）", async () => {
    for (const reason of ["", "   "]) {
      expect(await voidReportAction(ID, reason)).toEqual({
        ok: false,
        error: "請輸入作廢原因",
      });
    }
    expect(recorded).toEqual([]);
  });

  it("draft / printed / completed → voided，原因 trim", async () => {
    for (const status of ["draft", "printed", "completed"]) {
      recorded = [];
      row({ status });
      expect(await voidReportAction(ID, " 客戶取消 ")).toEqual({
        ok: true,
        data: { id: ID, status: "voided" },
      });
      const u = updates()[0];
      expect(u.payload).toMatchObject({
        status: "voided",
        void_reason: "客戶取消",
      });
      expect(typeof (u.payload as Record<string, unknown>).voided_at).toBe(
        "string",
      );
      expect(filterOf(u, "in", "status")).toEqual([
        "draft",
        "printed",
        "completed",
      ]);
    }
  });

  it("已作廢拒絕", async () => {
    row({ status: "voided" });
    expect(await voidReportAction(ID, "x")).toEqual({
      ok: false,
      error: "報告單已作廢",
    });
    expect(updates()).toEqual([]);
  });
});

describe("deleteDraftReportAction", () => {
  it("未列印草稿 → 刪除（條件：draft 且 print_count 0）", async () => {
    row({ status: "draft", print_count: 0 });
    expect(await deleteDraftReportAction(ID)).toEqual({
      ok: true,
      data: { id: ID },
    });
    const d = recorded.find((x) => x.kind === "delete")!;
    expect(filterOf(d, "eq", "id")).toBe(ID);
    expect(filterOf(d, "eq", "status")).toBe("draft");
    expect(filterOf(d, "eq", "print_count")).toBe(0);
    expect(revalidateSpy).toHaveBeenCalledWith("/admin/service-reports");
  });

  it("已列印過的草稿 / 非草稿 → 拒絕", async () => {
    for (const r of [
      { status: "draft", print_count: 1 },
      { status: "printed", print_count: 1 },
      { status: "voided", print_count: 0 },
    ]) {
      recorded = [];
      row(r);
      expect(await deleteDraftReportAction(ID)).toEqual({
        ok: false,
        error: "只有未列印過的草稿可以刪除，其他請改用作廢",
      });
      expect(recorded.some((x) => x.kind === "delete")).toBe(false);
    }
  });

  it("刪除 0 列 → 狀態已變更", async () => {
    row({ status: "draft", print_count: 0 }, 0);
    expect(await deleteDraftReportAction(ID)).toEqual({
      ok: false,
      error: STALE,
    });
  });
});
