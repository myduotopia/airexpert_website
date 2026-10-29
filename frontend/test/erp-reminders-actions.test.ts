import { describe, it, expect, vi, beforeEach } from "vitest";

// 提醒事項 server actions（#274）與廠商存檔觸發同步。以假的 supabase query builder 記錄送進 DB 的操作。

type Kind = "select" | "insert" | "update" | "delete" | "upsert";
interface Recorded {
  table: string;
  kind: Kind;
  payload: unknown;
  options: unknown;
  filters: [string, ...unknown[]][];
}
type Res = { data: unknown; error: { message: string } | null };

let recorded: Recorded[] = [];
let responses: Record<string, (q: Query) => Res> = {};
let moduleGranted = true;

class Query implements PromiseLike<Res> {
  kind: Kind = "select";
  payload: unknown = null;
  options: unknown = null;
  filters: [string, ...unknown[]][] = [];
  constructor(public table: string) {}
  select() {
    return this;
  }
  insert(p: unknown) {
    this.kind = "insert";
    this.payload = p;
    return this;
  }
  update(p: unknown) {
    this.kind = "update";
    this.payload = p;
    return this;
  }
  upsert(p: unknown, o: unknown) {
    this.kind = "upsert";
    this.payload = p;
    this.options = o;
    return this;
  }
  delete() {
    this.kind = "delete";
    return this;
  }
  eq(...a: unknown[]) {
    this.filters.push(["eq", ...a]);
    return this;
  }
  single() {
    return this;
  }
  maybeSingle() {
    return this;
  }
  private run(): Res {
    recorded.push({
      table: this.table,
      kind: this.kind,
      payload: this.payload,
      options: this.options,
      filters: this.filters,
    });
    const r = responses[`${this.table}:${this.kind}`];
    if (r) return r(this);
    if (this.kind === "insert") return { data: { id: "new-id" }, error: null };
    return { data: null, error: null };
  }
  then<A = Res, B = never>(
    ok?: ((v: Res) => A | PromiseLike<A>) | null,
    bad?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(ok, bad);
  }
}

const fakeSupabase = { from: (t: string) => new Query(t) };
const syncMock = vi.fn<
  (...a: unknown[]) => Promise<{
    vendors: number;
    inserted: number;
    updated: number;
  }>
>(async () => ({ vendors: 1, inserted: 1, updated: 0 }));

vi.mock("@/lib/admin/auth", () => ({
  hasModule: vi.fn(async () => moduleGranted),
}));
vi.mock("@/lib/supabase-server", () => ({
  getServerSupabase: vi.fn(async () => fakeSupabase),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/erp/queries/reminders", () => ({
  syncVendorReminders: (...a: unknown[]) => syncMock(...a),
}));

import {
  deleteReminderRuleAction,
  handleReminderAction,
  resyncAllVendorRemindersAction,
  saveReminderRuleAction,
  setReminderRuleActiveAction,
} from "@/app/admin/(protected)/erp/reminders/actions";
import {
  createVendorAction,
  updateVendorAction,
} from "@/app/admin/(protected)/erp/vendors/actions";
import { emptyRuleInput } from "@/lib/erp/reminders/rule-input";
import type { VendorInput } from "@/lib/erp/queries/master-data";

const vendorInput: VendorInput = {
  code: "TV01",
  name: "測試廠商",
  tax_id: "",
  contact_person: "",
  phone: "",
  fax: "",
  email: "",
  address: "",
  currency: "TWD",
  payment_terms: "",
  active: true,
  note: "每月10號匯款",
};

beforeEach(() => {
  recorded = [];
  responses = {};
  moduleGranted = true;
  syncMock.mockClear();
});

describe("無 erp 權限：一律拒絕且不碰 DB", () => {
  it.each([
    ["save", () => saveReminderRuleAction(null, emptyRuleInput("2026-11-03"))],
    ["active", () => setReminderRuleActiveAction("r1", false)],
    ["delete", () => deleteReminderRuleAction("r1")],
    [
      "handle",
      () =>
        handleReminderAction({
          ruleId: "r1",
          dueDate: "2026-11-10",
          status: "done",
        }),
    ],
    ["resync", () => resyncAllVendorRemindersAction()],
  ])("%s", async (_n, run) => {
    moduleGranted = false;
    const r = await run();
    expect(r.ok).toBe(false);
    expect(recorded).toEqual([]);
    expect(syncMock).not.toHaveBeenCalled();
  });
});

describe("廠商存檔後同步該廠商的提醒規則", () => {
  it("新增廠商成功 → 以新 id 同步", async () => {
    responses["erp_vendors:insert"] = () => ({
      data: { id: "v-new", code: "TV01", name: "測試廠商" },
      error: null,
    });
    const r = await createVendorAction(vendorInput);
    expect(r.ok).toBe(true);
    expect(syncMock).toHaveBeenCalledTimes(1);
    expect(syncMock.mock.calls[0][1]).toEqual(["v-new"]);
  });

  it("編輯廠商成功 → 同步；失敗 → 不同步", async () => {
    expect((await updateVendorAction("v1", vendorInput)).ok).toBe(true);
    expect(syncMock.mock.calls[0][1]).toEqual(["v1"]);

    syncMock.mockClear();
    responses["erp_vendors:update"] = () => ({
      data: null,
      error: { message: "boom" },
    });
    expect((await updateVendorAction("v1", vendorInput)).ok).toBe(false);
    expect(syncMock).not.toHaveBeenCalled();
  });

  it("同步失敗不影響廠商存檔結果", async () => {
    syncMock.mockRejectedValueOnce(new Error("rpc down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await updateVendorAction("v1", vendorInput)).toEqual({
      ok: true,
      id: "v1",
    });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("全部重新解析：同步全部廠商並回傳統計", async () => {
    const r = await resyncAllVendorRemindersAction();
    expect(r).toEqual({
      ok: true,
      summary: { vendors: 1, inserted: 1, updated: 0 },
    });
    expect(syncMock.mock.calls[0][1]).toBe("all");
  });
});

describe("規則", () => {
  it("新增一律為 manual", async () => {
    const r = await saveReminderRuleAction(null, {
      ...emptyRuleInput("2026-11-03", "v1"),
      title: "對帳",
    });
    expect(r).toEqual({ ok: true, id: "new-id" });
    const ins = recorded.find((x) => x.kind === "insert")!;
    expect(ins.table).toBe("erp_reminder_rules");
    expect(ins.payload).toMatchObject({
      source: "manual",
      title: "對帳",
      vendor_id: "v1",
      day_of_month: 10,
    });
  });

  it("驗證錯誤不寫入", async () => {
    const r = await saveReminderRuleAction(null, emptyRuleInput("2026-11-03"));
    expect(r).toMatchObject({ ok: false, field: "title" });
    expect(recorded).toEqual([]);
  });

  it("編輯 auto 規則：不可改成單次；對象固定為原廠商", async () => {
    responses["erp_reminder_rules:select"] = () => ({
      data: { id: "r1", source: "auto", vendor_id: "v1", auto_missing: false },
      error: null,
    });
    const once = await saveReminderRuleAction("r1", {
      ...emptyRuleInput("2026-11-03", "v2"),
      title: "匯款",
      kind: "once",
      once_date: "2026-12-01",
    });
    expect(once).toMatchObject({ ok: false, field: "kind" });

    recorded = [];
    const ok = await saveReminderRuleAction("r1", {
      ...emptyRuleInput("2026-11-03", "v2"),
      title: "匯款給甲",
      lead_days: 14,
    });
    expect(ok.ok).toBe(true);
    const upd = recorded.find((x) => x.kind === "update")!;
    expect(upd.payload).toMatchObject({
      vendor_id: "v1",
      title: "匯款給甲",
      lead_days: 14,
    });
    expect(upd.payload).not.toHaveProperty("source");
  });

  it("重新啟用「備註已刪除」的 auto 規則 → 轉為手動（之後同步不再停用）", async () => {
    responses["erp_reminder_rules:select"] = () => ({
      data: { source: "auto", vendor_id: "v1", auto_missing: true },
      error: null,
    });
    await setReminderRuleActiveAction("r1", true);
    expect(recorded.find((x) => x.kind === "update")!.payload).toEqual({
      active: true,
      source: "manual",
      auto_key: null,
      auto_missing: false,
    });
    recorded = [];
    await setReminderRuleActiveAction("r1", false);
    expect(recorded.find((x) => x.kind === "update")!.payload).toEqual({
      active: false,
    });
  });

  it("刪除只限手動規則", async () => {
    const r = await deleteReminderRuleAction("r1");
    const del = recorded.find((x) => x.kind === "delete")!;
    expect(del.filters).toContainEqual(["eq", "source", "manual"]);
    // 沒有刪到（auto 或不存在）→ 錯誤
    expect(r.ok).toBe(false);
    responses["erp_reminder_rules:delete"] = () => ({
      data: [{ vendor_id: null }],
      error: null,
    });
    expect((await deleteReminderRuleAction("r1")).ok).toBe(true);
  });
});

describe("標記完成／略過", () => {
  beforeEach(() => {
    responses["erp_reminder_rules:select"] = () => ({
      data: {
        kind: "monthly",
        day_of_month: 31,
        weekday: null,
        month: null,
        once_date: null,
        vendor_id: "v1",
      },
      error: null,
    });
  });

  it("寫入處理紀錄（upsert rule_id + due_date）", async () => {
    const r = await handleReminderAction({
      ruleId: "r1",
      dueDate: "2026-11-30",
      status: "done",
      note: " 已匯 ",
    });
    expect(r).toEqual({ ok: true });
    const up = recorded.find((x) => x.kind === "upsert")!;
    expect(up.table).toBe("erp_reminder_occurrences");
    expect(up.options).toEqual({ onConflict: "rule_id,due_date" });
    expect(up.payload).toMatchObject({
      rule_id: "r1",
      due_date: "2026-11-30",
      status: "done",
      note: "已匯",
    });
  });

  it("到期日不是這條規則的到期 → 拒絕（31 日在 11 月為 11/30）", async () => {
    const r = await handleReminderAction({
      ruleId: "r1",
      dueDate: "2026-11-29",
      status: "skipped",
    });
    expect(r.ok).toBe(false);
    expect(recorded.some((x) => x.kind === "upsert")).toBe(false);
  });
});
