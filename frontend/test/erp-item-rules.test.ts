// 品項表單切換類別的純規則（#282：整機預設建卡、單位自動切「台」、不建卡提示）。
import { describe, expect, it } from "vitest";
import {
  applyKindChange,
  defaultItemInput,
  defaultUnitForKind,
  isMachineWithoutCard,
  normalizeItemInput,
  type ItemInput,
  type KindChangeContext,
} from "@/app/admin/(protected)/erp/items/_lib/rules";

const NEW: KindChangeContext = {
  isNew: true,
  unitTouched: false,
  cardTouched: false,
};
const EDIT: KindChangeContext = { ...NEW, isNew: false };

function part(patch: Partial<ItemInput> = {}): ItemInput {
  return { ...defaultItemInput("part"), code: "AM3-08A30", ...patch };
}

describe("切換類別：整機預設建卡（#282）", () => {
  it("新增品項切到整機 → 空壓機卡、追蹤機號與庫存", () => {
    const next = applyKindChange(part(), "machine", NEW);
    expect(next).toMatchObject({
      kind: "machine",
      mx_card_type: "compressor",
      track_serial: true,
      track_stock: true,
    });
  });

  it("使用者仍可改回不建卡；之後再切類別不會被重新帶入", () => {
    const machine = applyKindChange(part(), "machine", NEW);
    const noCard = { ...machine, mx_card_type: null };
    const ctx = { ...NEW, cardTouched: true };
    const toPart = applyKindChange(noCard, "part", ctx);
    expect(toPart.mx_card_type).toBeNull();
    expect(applyKindChange(toPart, "machine", ctx).mx_card_type).toBeNull();
  });

  it("新增時手動選過濾卡後切到整機 → 保留過濾卡", () => {
    const filter = part({ mx_card_type: "filter", track_serial: true });
    const next = applyKindChange(filter, "machine", {
      ...NEW,
      cardTouched: true,
    });
    expect(next.mx_card_type).toBe("filter");
  });

  it("自動帶入的空壓機卡在切回零件時還原為不建卡", () => {
    const machine = applyKindChange(part(), "machine", NEW);
    expect(applyKindChange(machine, "part", NEW).mx_card_type).toBeNull();
  });

  it("手動選過空壓機卡則切回零件時保留", () => {
    const machine = applyKindChange(part(), "machine", NEW);
    const next = applyKindChange(machine, "part", {
      ...NEW,
      cardTouched: true,
    });
    expect(next.mx_card_type).toBe("compressor");
  });

  it("編輯既有品項：切到整機不改已存的卡別（不建卡維持不建卡）", () => {
    const saved = part({ unit: "個", mx_card_type: null });
    const next = applyKindChange(saved, "machine", EDIT);
    expect(next.kind).toBe("machine");
    expect(next.mx_card_type).toBeNull();
    expect(next.unit).toBe("個");
  });

  it("切到服務／費用一律不建卡（既有規則）", () => {
    const machine = applyKindChange(part(), "machine", NEW);
    expect(
      applyKindChange(machine, "service", { ...NEW, cardTouched: true }),
    ).toMatchObject({
      mx_card_type: null,
      track_serial: false,
      track_stock: false,
    });
  });

  it("defaultItemInput('machine') 預設空壓機卡；零件不建卡", () => {
    expect(defaultItemInput("machine").mx_card_type).toBe("compressor");
    expect(defaultItemInput("part").mx_card_type).toBeNull();
  });
});

describe("切換類別：單位自動切「台」（P3-5）", () => {
  it("單位仍為預設「個」→ 切整機改「台」，切回零件還原「個」", () => {
    const machine = applyKindChange(part(), "machine", NEW);
    expect(machine.unit).toBe("台");
    expect(applyKindChange(machine, "part", NEW).unit).toBe("個");
    expect(applyKindChange(machine, "service", NEW).unit).toBe("式");
  });

  it("手動改過的單位不被覆蓋", () => {
    const edited = part({ unit: "組" });
    const ctx = { ...NEW, unitTouched: true };
    const machine = applyKindChange(edited, "machine", ctx);
    expect(machine.unit).toBe("組");
    expect(applyKindChange(machine, "part", ctx).unit).toBe("組");
  });

  it("手動輸入「台」（與整機預設相同）切回零件仍保留", () => {
    const ctx = { ...NEW, unitTouched: true };
    const machine = applyKindChange(part({ unit: "台" }), "machine", ctx);
    expect(applyKindChange(machine, "part", ctx).unit).toBe("台");
  });

  it("單位非該類別預設值（未標記手動）也不覆蓋", () => {
    expect(applyKindChange(part({ unit: "桶" }), "machine", NEW).unit).toBe(
      "桶",
    );
  });

  it("各類別預設單位", () => {
    expect(defaultUnitForKind("machine")).toBe("台");
    expect(defaultUnitForKind("part")).toBe("個");
    expect(defaultUnitForKind("service")).toBe("式");
    expect(defaultUnitForKind("expense")).toBe("式");
  });
});

describe("整機不建卡提示", () => {
  it("只有整機 + 不建卡顯示", () => {
    expect(isMachineWithoutCard({ kind: "machine", mx_card_type: null })).toBe(
      true,
    );
    expect(
      isMachineWithoutCard({ kind: "machine", mx_card_type: "compressor" }),
    ).toBe(false);
    expect(isMachineWithoutCard({ kind: "part", mx_card_type: null })).toBe(
      false,
    );
  });
});

describe("馬力／電壓正規化", () => {
  it("去前後空白；空白存 null", () => {
    const filled = normalizeItemInput(
      part({ name: "空壓機", horsepower: " 15HP ", voltage: "220V" }),
    );
    expect(filled.ok && filled.row).toMatchObject({
      horsepower: "15HP",
      voltage: "220V",
    });
    const blank = normalizeItemInput(
      part({ name: "空壓機", horsepower: "  ", voltage: "" }),
    );
    expect(blank.ok && blank.row).toMatchObject({
      horsepower: null,
      voltage: null,
    });
  });
});
