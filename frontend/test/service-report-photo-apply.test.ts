import { describe, it, expect } from "vitest";
import { emptyFormState } from "@/components/service-report/form-state";
import { applyPhotoExtraction } from "@/components/service-report/photo-apply";
import {
  emptyExtraction,
  type ReportPhotoExtraction,
} from "@/lib/service-report/photo-extract";
import type { EmployeeOption } from "@/lib/employees/types";

// 拍照辨識結果預填既有回填表單（#280）。

const EMP_A = "00000000-0000-4000-8000-0000000000a1";
const EMP_B = "00000000-0000-4000-8000-0000000000b2";
const employees: EmployeeOption[] = [
  {
    id: EMP_A,
    code: "T01",
    name: "師傅甲",
    roles: ["technician"],
    active: true,
  },
  {
    id: EMP_B,
    code: "T02",
    name: "師傅乙",
    roles: ["technician"],
    active: true,
  },
];

function extraction(
  patch: Partial<ReportPhotoExtraction>,
): ReportPhotoExtraction {
  return { ...emptyExtraction(), ...patch };
}

function base() {
  return {
    ...emptyFormState("2026-10-30"),
    report_no: "X11510002",
    service_items: ["new_trial" as const],
    summary: "",
    results: { compressor: { run_hours: "12" } },
  };
}

describe("applyPhotoExtraction", () => {
  it("帶入回填欄位：檢查數值逐欄合併、勾選、記要、簽名", () => {
    const { state, filled } = applyPhotoExtraction(
      base(),
      extraction({
        time_slot: "morning",
        summary: "新機試車OK",
        results: {
          compressor: {
            run_hours: "15",
            set_pressure: "7.5-8",
            temperature: "81",
            current: "27",
            frequency: "95",
            fan: "normal",
            inverter_fan: "normal",
            inverter_params: "normal",
          },
        },
        suggestions: ["motor"],
        customer_signer: "客戶王",
      }),
      employees,
    );
    expect(state.results.compressor).toEqual({
      run_hours: "15",
      set_pressure: "7.5-8",
      temperature: "81",
      current: "27",
      frequency: "95",
      fan: "normal",
      inverter_fan: "normal",
      inverter_params: "normal",
    });
    expect(state.time_slot).toBe("morning");
    expect(state.summary).toBe("新機試車OK");
    expect(state.suggestions).toEqual(["motor"]);
    expect(state.customer_signer).toBe("客戶王");
    expect(state.report_no).toBe("X11510002");
    expect(filled).toEqual(
      expect.arrayContaining([
        "時段",
        "修護記要及建議",
        "空壓機檢查",
        "建議事項",
        "客戶簽名",
      ]),
    );
  });

  it("沒辨識到的欄位不清掉既有內容", () => {
    const start = { ...base(), summary: "原本的記要", customer_signer: "既有" };
    const { state, filled } = applyPhotoExtraction(start, emptyExtraction());
    expect(state).toEqual(start);
    expect(filled).toEqual([]);
  });

  it("檢查數值逐欄合併：照片只有部分欄位 → 其他既有欄位保留", () => {
    const start = {
      ...base(),
      results: {
        compressor: { run_hours: "12", current: "26" },
        dryer: { total_hours: "800" },
      },
    };
    const { state } = applyPhotoExtraction(
      start,
      extraction({ results: { compressor: { temperature: "81" } } }),
    );
    expect(state.results).toEqual({
      compressor: { run_hours: "12", current: "26", temperature: "81" },
      dryer: { total_hours: "800" },
    });
  });

  it("料件依品名比對填數量（覆蓋），比不到的放空白列，放不下的提示", () => {
    const { state, notices } = applyPhotoExtraction(
      base(),
      extraction({
        parts: [
          { name: "螺旋專用油", qty: "1桶" },
          { name: "油鏡", qty: "1" },
          { name: "", qty: "3" },
        ],
      }),
    );
    expect(state.parts[0]).toEqual({ no: 1, name: "螺旋專用油", qty: "1桶" });
    expect(state.parts[7]).toEqual({ no: 8, name: "油鏡", qty: "1" });
    expect(notices.some((n) => n.includes("未寫品名"))).toBe(true);

    const many = Array.from({ length: 4 }, (_, i) => ({
      name: `額外料件${i}`,
      qty: "1",
    }));
    const r = applyPhotoExtraction(base(), extraction({ parts: many }));
    expect(r.notices.some((n) => n.includes("超過 10 列"))).toBe(true);
  });

  it("維護人員：單上沒有 → 對到員工主檔就選該員工；第 2 位加為協同技師", () => {
    const { state } = applyPhotoExtraction(
      base(),
      extraction({ technicians: ["師傅 甲", "師傅乙"] }),
      employees,
    );
    expect(state.technician).toBe("師傅甲");
    expect(state.technician_id).toBe(EMP_A);
    expect(state.co_technicians.map((c) => [c.id, c.name, c.share])).toEqual([
      [EMP_B, "師傅乙", "0.5"],
    ]);
    expect(state.technician_share).toBe("0.5");
  });

  it("維護人員：對不到員工只填姓名並提示；單上已有不同的人 → 不更換只提示", () => {
    const a = applyPhotoExtraction(
      base(),
      extraction({ technicians: ["路人丙"] }),
      employees,
    );
    expect(a.state.technician).toBe("路人丙");
    expect(a.state.technician_id).toBeNull();
    expect(a.notices.some((n) => n.includes("未對應到員工主檔"))).toBe(true);

    const start = { ...base(), technician: "師傅乙", technician_id: EMP_B };
    const b = applyPhotoExtraction(
      start,
      extraction({ technicians: ["師傅甲"] }),
      employees,
    );
    expect(b.state.technician_id).toBe(EMP_B);
    expect(b.notices.some((n) => n.includes("未自動更換"))).toBe(true);
  });

  it("低信心欄位轉成中文名稱", () => {
    const { lowConfidence } = applyPhotoExtraction(
      base(),
      extraction({ low_confidence: ["compressor.current", "customer_signer"] }),
    );
    expect(lowConfidence).toEqual(["運轉電流", "客戶簽名"]);
  });
});
