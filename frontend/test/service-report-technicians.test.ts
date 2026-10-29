import { describe, it, expect } from "vitest";

// 維護報告單多技師工時分攤（#271）：預設比例、新增／移除協同技師、比例解析與驗證、
// DB 列 ↔ 表單、表單 → action 輸入、列印顯示所有技師。
import {
  MAX_CO_TECHNICIANS,
  addCoTechnician,
  evenShares,
  normalizeTechnicianInput,
  parseShare,
  removeCoTechnician,
  technicianDraftFromRows,
  technicianNames,
  updateCoTechnician,
  validateTechnicianDraft,
  validateTechnicianInput,
  type ReportTechnicianRow,
  type TechnicianDraft,
} from "@/lib/service-report/technicians";
import {
  emptyFormState,
  formStateFromReport,
  formStateToInput,
  formStateToSheetData,
  sheetDataFromReport,
} from "@/components/service-report/form-state";
import {
  normalizeReportInput,
  validateReportInput,
} from "@/lib/service-report/validate";
import type { ServiceReport } from "@/lib/service-report/types";

const A = "00000000-0000-0000-0000-0000000000a1";
const B = "00000000-0000-0000-0000-0000000000b1";
const C = "00000000-0000-0000-0000-0000000000c1";

const draft = (patch: Partial<TechnicianDraft> = {}): TechnicianDraft => ({
  technician: "測試師傅甲",
  technician_id: A,
  technician_share: "1",
  co_technicians: [],
  ...patch,
});

describe("evenShares：平均分配（兩位小數，加總剛好 1，餘數給前面）", () => {
  it.each([
    [1, ["1"]],
    [2, ["0.5", "0.5"]],
    [3, ["0.34", "0.33", "0.33"]],
    [4, ["0.25", "0.25", "0.25", "0.25"]],
    [6, ["0.17", "0.17", "0.17", "0.17", "0.16", "0.16"]],
  ])("%i 人", (n, expected) => {
    expect(evenShares(n)).toEqual(expected);
    const sum = evenShares(n).reduce(
      (s, v) => s + Math.round(Number(v) * 100),
      0,
    );
    expect(sum).toBe(100);
  });

  it("0 人 → 空陣列", () => {
    expect(evenShares(0)).toEqual([]);
  });
});

describe("新增／移除協同技師（預設：只有主技師 1；加入後平均分）", () => {
  it("新增第一位 → 主 0.5、協同 0.5（協同尚未選人）", () => {
    const next = addCoTechnician(draft());
    expect(next.technician_share).toBe("0.5");
    expect(next.co_technicians).toEqual([{ id: null, name: "", share: "0.5" }]);
  });

  it("再新增 → 三人平均（使用者改過的比例也重新平均）", () => {
    let d = addCoTechnician(draft());
    d = updateCoTechnician(d, 0, { id: B, name: "測試師傅乙", share: "0.3" });
    d = addCoTechnician(d);
    expect([
      d.technician_share,
      ...d.co_technicians.map((c) => c.share),
    ]).toEqual(["0.34", "0.33", "0.33"]);
    expect(d.co_technicians[0]).toMatchObject({ id: B, name: "測試師傅乙" });
  });

  it("移除 → 剩下的人重新平均；全部移除 → 主技師回到 1", () => {
    let d = addCoTechnician(addCoTechnician(draft()));
    d = updateCoTechnician(d, 1, { id: C, name: "測試師傅丙" });
    d = removeCoTechnician(d, 0);
    expect(d.co_technicians).toEqual([
      { id: C, name: "測試師傅丙", share: "0.5" },
    ]);
    expect(d.technician_share).toBe("0.5");
    d = removeCoTechnician(d, 0);
    expect(d.co_technicians).toEqual([]);
    expect(d.technician_share).toBe("1");
  });

  it(`最多 ${MAX_CO_TECHNICIANS} 位協同技師`, () => {
    let d = draft();
    for (let i = 0; i < MAX_CO_TECHNICIANS + 3; i++) d = addCoTechnician(d);
    expect(d.co_technicians).toHaveLength(MAX_CO_TECHNICIANS);
  });

  it("不改動傳入的物件", () => {
    const d = draft();
    addCoTechnician(d);
    expect(d.co_technicians).toEqual([]);
  });
});

describe("parseShare", () => {
  it.each([
    ["1", 1],
    ["0.5", 0.5],
    [" .5 ", 0.5],
    ["0.25", 0.25],
    ["1.00", 1],
  ])("%s → %s", (s, n) => {
    expect(parseShare(s)).toBe(n);
  });

  it.each([
    "",
    "0",
    "0.00",
    "-0.5",
    "1.01",
    "2",
    "0.333",
    "abc",
    "1e-1",
    "0x1",
  ])("%s → null", (s) => {
    expect(parseShare(s)).toBeNull();
  });
});

describe("validateTechnicianDraft（表單送出前）", () => {
  it("只有主技師、比例 1 → 通過；沒有主技師也沒有協同 → 通過", () => {
    expect(validateTechnicianDraft(draft())).toBeNull();
    expect(
      validateTechnicianDraft(
        draft({ technician: "", technician_id: null, technician_share: "" }),
      ),
    ).toBeNull();
  });

  it("主技師為舊資料文字（沒有 id）且沒有協同 → 通過（比例不檢查）", () => {
    expect(
      validateTechnicianDraft(
        draft({
          technician: "老張",
          technician_id: null,
          technician_share: "",
        }),
      ),
    ).toBeNull();
  });

  it("協同技師未選人", () => {
    expect(validateTechnicianDraft(addCoTechnician(draft()))).toMatch(
      /第 1 位協同技師/,
    );
  });

  it("有協同但主技師不是從員工清單選的", () => {
    const d = updateCoTechnician(
      addCoTechnician(draft({ technician: "老張", technician_id: null })),
      0,
      { id: B, name: "乙" },
    );
    expect(validateTechnicianDraft(d)).toMatch(/主技師須從員工清單選擇/);
  });

  it("有協同但沒有主技師", () => {
    const d = updateCoTechnician(
      addCoTechnician(draft({ technician: "", technician_id: null })),
      0,
      { id: B, name: "乙" },
    );
    expect(validateTechnicianDraft(d)).toMatch(/主技師/);
  });

  it("重複：協同與主技師同一人、協同彼此重複", () => {
    const dupPrimary = updateCoTechnician(addCoTechnician(draft()), 0, {
      id: A,
      name: "甲",
    });
    expect(validateTechnicianDraft(dupPrimary)).toMatch(/重複/);
    let dup = addCoTechnician(addCoTechnician(draft()));
    dup = updateCoTechnician(dup, 0, { id: B, name: "乙" });
    dup = updateCoTechnician(dup, 1, { id: B, name: "乙" });
    expect(validateTechnicianDraft(dup)).toMatch(/重複/);
  });

  it("比例不正確（主技師、協同）", () => {
    expect(validateTechnicianDraft(draft({ technician_share: "1.5" }))).toMatch(
      /主技師工時比例/,
    );
    const d = updateCoTechnician(addCoTechnician(draft()), 0, {
      id: B,
      name: "乙",
      share: "0",
    });
    expect(validateTechnicianDraft(d)).toMatch(/第 1 位協同技師工時比例/);
  });
});

describe("DB 列 ↔ 表單", () => {
  const rows: ReportTechnicianRow[] = [
    {
      employee_id: B,
      name: "測試師傅乙",
      code: null,
      share: 0.5,
      is_primary: false,
      sort_order: 2,
    },
    {
      employee_id: A,
      name: "測試師傅甲",
      code: "T01",
      share: 0.25,
      is_primary: true,
      sort_order: 0,
    },
    {
      employee_id: C,
      name: "測試師傅丙",
      code: null,
      share: 0.25,
      is_primary: false,
      sort_order: 1,
    },
  ];

  it("主技師比例與協同（依 sort_order）", () => {
    expect(technicianDraftFromRows(rows, A)).toEqual({
      technician_share: "0.25",
      co_technicians: [
        { id: C, name: "測試師傅丙", share: "0.25" },
        { id: B, name: "測試師傅乙", share: "0.5" },
      ],
    });
  });

  it("沒有技師列（舊資料或無主技師）→ 主技師 1、無協同", () => {
    expect(technicianDraftFromRows([], A)).toEqual({
      technician_share: "1",
      co_technicians: [],
    });
  });

  it("主技師列與 technician_id 不一致時，不把它當協同（以 technician_id 為準）", () => {
    expect(technicianDraftFromRows(rows, null).co_technicians).toHaveLength(2);
  });

  it("technicianNames：主技師在前、去空白、略過空白", () => {
    expect(
      technicianNames("測試師傅甲", ["測試師傅乙", " ", "測試師傅丙"]),
    ).toBe("測試師傅甲、測試師傅乙、測試師傅丙");
    expect(technicianNames("", ["測試師傅乙"])).toBe("測試師傅乙");
    expect(technicianNames(null, [])).toBeNull();
  });
});

function makeReport(patch: Partial<ServiceReport> = {}): ServiceReport {
  return {
    id: "00000000-0000-0000-0000-00000000e001",
    report_no: "X11510001",
    report_date: "2026-10-27",
    time_slot: null,
    status: "printed",
    customer_id: null,
    machine_id: null,
    header_code: null,
    customer_name: "測試客戶",
    phone: null,
    tax_id: null,
    contact: null,
    address: null,
    equipment: null,
    model: null,
    voltage: null,
    serial_no: null,
    machine_state: null,
    service_items: [],
    summary: null,
    results: {},
    parts: [],
    suggestions: [],
    technician: "測試師傅甲",
    technician_id: A,
    customer_signer: null,
    note: null,
    print_count: 1,
    first_printed_at: null,
    last_printed_at: null,
    completed_at: null,
    voided_at: null,
    void_reason: null,
    plan_stage_id: null,
    plan_stage_hours: null,
    plan_stage_label: null,
    created_by: null,
    created_at: "2026-10-27T00:00:00Z",
    updated_at: "2026-10-27T00:00:00Z",
    ...patch,
  };
}

const TECH_ROWS: ReportTechnicianRow[] = [
  {
    employee_id: A,
    name: "測試師傅甲",
    code: null,
    share: 0.5,
    is_primary: true,
    sort_order: 0,
  },
  {
    employee_id: B,
    name: "測試師傅乙",
    code: null,
    share: 0.5,
    is_primary: false,
    sort_order: 1,
  },
];

describe("form-state 整合", () => {
  it("新表單：主技師比例 1、無協同", () => {
    const s = emptyFormState("2026-10-27");
    expect(s.technician_share).toBe("1");
    expect(s.co_technicians).toEqual([]);
  });

  it("編輯頁帶入技師列", () => {
    const s = formStateFromReport(makeReport(), TECH_ROWS);
    expect(s.technician_share).toBe("0.5");
    expect(s.co_technicians).toEqual([
      { id: B, name: "測試師傅乙", share: "0.5" },
    ]);
  });

  it("送出：technician 仍只有主技師；比例與協同另外帶", () => {
    const input = formStateToInput(
      formStateFromReport(makeReport(), TECH_ROWS),
      "id",
    );
    expect(input.technician).toBe("測試師傅甲");
    expect(input.technician_id).toBe(A);
    expect(input.technician_share).toBe(0.5);
    expect(input.co_technicians).toEqual([{ employee_id: B, share: 0.5 }]);
  });

  it("送出：主技師沒有 id（舊資料文字）→ 比例 null", () => {
    const s = {
      ...emptyFormState("2026-10-27"),
      technician: "老張",
      technician_id: null,
    };
    const input = formStateToInput(s);
    expect(input.technician_share).toBeNull();
    expect(input.co_technicians).toEqual([]);
  });

  it("列印／預覽：維護人員顯示所有技師", () => {
    const s = formStateFromReport(makeReport(), TECH_ROWS);
    expect(formStateToSheetData(s).technician).toBe("測試師傅甲、測試師傅乙");
    expect(sheetDataFromReport(makeReport(), TECH_ROWS).technician).toBe(
      "測試師傅甲、測試師傅乙",
    );
    // 沒傳技師列（舊呼叫端）→ 只有主技師文字
    expect(sheetDataFromReport(makeReport()).technician).toBe("測試師傅甲");
  });
});

describe("server 端驗證與正規化（validateReportInput／normalizeTechnicianInput）", () => {
  const base = () =>
    formStateToInput(formStateFromReport(makeReport(), TECH_ROWS), undefined);

  it("合法輸入通過；未帶協同欄位（舊呼叫端）也通過", () => {
    expect(validateReportInput(base())).toBeNull();
    const legacy = { ...base() };
    delete legacy.co_technicians;
    delete legacy.technician_share;
    expect(validateReportInput(legacy)).toBeNull();
  });

  it.each([
    [{ co_technicians: "x" }, /協同技師/],
    [{ co_technicians: [{ employee_id: "bad", share: 0.5 }] }, /協同技師/],
    [{ co_technicians: [{ employee_id: B, share: 0 }] }, /工時比例/],
    [{ co_technicians: [{ employee_id: B, share: 0.333 }] }, /工時比例/],
    [{ co_technicians: [{ employee_id: A, share: 0.5 }] }, /重複/],
    [
      {
        co_technicians: [
          { employee_id: B, share: 0.5 },
          { employee_id: B, share: 0.5 },
        ],
      },
      /重複/,
    ],
    [{ technician_share: 1.5 }, /主技師工時比例/],
    [{ technician_id: null }, /主技師須從員工清單選擇/],
  ])("%j → 錯誤", (patch, msg) => {
    expect(validateReportInput({ ...base(), ...patch })).toMatch(msg);
  });

  it("協同超過上限", () => {
    const many = Array.from({ length: MAX_CO_TECHNICIANS + 1 }, (_, i) => ({
      employee_id: `00000000-0000-0000-0000-0000000001${String(i).padStart(2, "0")}`,
      share: 0.1,
    }));
    expect(validateReportInput({ ...base(), co_technicians: many })).toMatch(
      /最多/,
    );
  });

  it("validateTechnicianInput：沒有主技師、沒有協同 → 通過", () => {
    expect(
      validateTechnicianInput({
        technician: null,
        technician_id: null,
        technician_share: null,
        co_technicians: [],
      }),
    ).toBeNull();
  });

  it("normalize：未帶 → undefined（不同步技師）；有帶 → 主技師比例與協同", () => {
    const legacy = { ...base() };
    delete legacy.co_technicians;
    expect(normalizeTechnicianInput(legacy)).toBeUndefined();
    expect(normalizeTechnicianInput(base())).toEqual({
      primary_share: 0.5,
      collaborators: [{ employee_id: B, share: 0.5 }],
    });
    expect(
      normalizeTechnicianInput({
        ...base(),
        technician_id: null,
        technician: "老張",
        co_technicians: [],
        technician_share: null,
      }),
    ).toEqual({ primary_share: null, collaborators: [] });
  });

  it("normalizeReportInput 不把比例與協同寫進 sr_reports", () => {
    const out = normalizeReportInput(base()) as Record<string, unknown>;
    expect("co_technicians" in out).toBe(false);
    expect("technician_share" in out).toBe(false);
  });
});
