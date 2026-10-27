import { describe, it, expect, vi } from "vitest";

// 一次性套用腳本（#265，scripts/update-staff-emails.ts）的純邏輯：以標題名稱找欄、依員工編號比對 staff 帳號、
// 預設乾跑的每列動作（更新／略過／錯誤）與輸出（只印遮罩 email、不印姓名）、GoTrue 請求。
// 測試資料全為虛構。

import {
  buildEmailUpdatePlan,
  findEmailColumns,
  formatPlanLine,
  gotrueUpdateEmail,
  summarizeEmailPlan,
  type EmailPlanRow,
  type StaffAccountSnapshot,
} from "@/lib/admin/staff-email-update";

function reasonOf(r: EmailPlanRow | undefined): string {
  return r && "reason" in r ? r.reason : "";
}

const U1 = "00000000-0000-0000-0000-0000000000f1";
const U2 = "00000000-0000-0000-0000-0000000000f2";
const U3 = "00000000-0000-0000-0000-0000000000f3";
const U4 = "00000000-0000-0000-0000-0000000000f4";
const OTHER = "00000000-0000-0000-0000-0000000000f9";

function acc(
  code: string,
  over: Partial<StaffAccountSnapshot> = {},
): StaffAccountSnapshot {
  const n = code.slice(-1);
  const email = `${code.toLowerCase()}@airexpert.com.tw`;
  return {
    employee_id: `00000000-0000-0000-0000-0000000000e${n}`,
    code,
    user_id: `00000000-0000-0000-0000-0000000000f${n}`,
    role: "staff",
    auth_email: email,
    profile_email: email,
    ...over,
  };
}

const ACCOUNTS: StaffAccountSnapshot[] = [
  acc("Z901"),
  acc("Z902"),
  acc("Z903"),
  acc("Z904"),
  acc("Z905", {
    user_id: null,
    role: null,
    auth_email: null,
    profile_email: null,
  }),
  acc("Z906", { role: "erp" }),
];

/** 其他帳號已使用的 email（auth.users ∪ admin_profiles，小寫）→ 帳號 id。 */
const TAKEN = new Map<string, string>([
  ...ACCOUNTS.filter((a) => a.user_id && a.auth_email).map(
    (a) => [a.auth_email!, a.user_id!] as [string, string],
  ),
  ["taken@example.com", OTHER],
]);

// 欄位順序刻意與「員工編號、員工名稱、Email」不同，並在上方放說明列。
const GRID: string[][] = [
  ["員工 Email 清單", "", ""],
  ["", "", ""],
  ["E-mail", "員工名稱", "員工編號"],
  ["Tester1@Example.com ", "測試員甲", "Z901"],
  ["", "測試員乙", "z902"],
  ["z903@airexpert.com.tw", "測試員丙", "Z903"],
  ["tester4@example.com", "測試員丁", "Z904"],
  ["tester5@example.com", "測試員戊", "Z905"],
  ["tester6@example.com", "測試員己", "Z906"],
  ["taken@example.com", "測試員庚", "Z901"],
  ["tester8@example.com", "測試員辛", "Z999"],
  ["bad-email", "測試員壬", "Z902"],
  ["", "", ""],
];

describe("findEmailColumns：以標題名稱找欄（不看位置）", () => {
  it("找到標題列與兩欄", () => {
    expect(findEmailColumns(GRID)).toEqual({
      ok: true,
      headerRow: 2,
      codeCol: 2,
      emailCol: 0,
    });
  });

  it("標題寫法：Email／E-mail／電子郵件，前後空白與大小寫不拘", () => {
    for (const h of ["Email", " EMAIL ", "e-mail", "電子郵件", "E－mail"]) {
      const r = findEmailColumns([["員工編號", h]]);
      expect(r, h).toEqual({ ok: true, headerRow: 0, codeCol: 0, emailCol: 1 });
    }
  });

  it("缺欄或重複欄 → 錯誤", () => {
    expect(findEmailColumns([["員工編號", "員工名稱"]]).ok).toBe(false);
    expect(findEmailColumns([["編號", "Email"]]).ok).toBe(false);
    const dup = findEmailColumns([["員工編號", "Email", "E-mail"]]);
    expect(dup.ok).toBe(false);
    expect(!dup.ok && dup.error).toContain("Email");
  });
});

describe("buildEmailUpdatePlan：依員工編號比對 staff 帳號", () => {
  const cols = findEmailColumns(GRID);
  if (!cols.ok) throw new Error("setup");
  const plan = buildEmailUpdatePlan(GRID, cols, ACCOUNTS, TAKEN);
  const byLine = new Map(plan.map((r) => [r.line, r]));

  it("空白列不列出；列號對得上 Excel（1 起算）", () => {
    expect(plan.map((r) => r.line)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("檔案內員工編號重複 → 該編號的每一列都是錯誤（不猜哪一列）", () => {
    expect(byLine.get(4)).toMatchObject({ action: "error", code: "Z901" });
    expect(reasonOf(byLine.get(4))).toContain("重複");
    expect(byLine.get(10)).toMatchObject({ action: "error", code: "Z901" });
    // 大小寫不同（z902／Z902）也算同一個編號
    expect(byLine.get(5)).toMatchObject({ action: "error", code: "Z902" });
    expect(byLine.get(12)).toMatchObject({ action: "error", code: "Z902" });
  });

  it("與目前相同 → 略過", () => {
    expect(byLine.get(6)).toMatchObject({ action: "skip", code: "Z903" });
    expect(reasonOf(byLine.get(6))).toContain("相同");
  });

  it("可更新：帶員工 id、帳號 id、正規化後的新 email 與目前 email", () => {
    expect(byLine.get(7)).toEqual({
      line: 7,
      code: "Z904",
      action: "update",
      employee_id: ACCOUNTS[3].employee_id,
      user_id: U4,
      from: "z904@airexpert.com.tw",
      to: "tester4@example.com",
    });
  });

  it("尚未建立帳號、非員工帳號、找不到編號 → 錯誤", () => {
    expect(byLine.get(8)).toMatchObject({ action: "error", code: "Z905" });
    expect(reasonOf(byLine.get(8))).toContain("尚未建立帳號");
    expect(byLine.get(9)).toMatchObject({ action: "error", code: "Z906" });
    expect(reasonOf(byLine.get(9))).toContain("不是員工帳號");
    expect(byLine.get(11)).toMatchObject({ action: "error", code: "Z999" });
    expect(reasonOf(byLine.get(11))).toContain("找不到");
  });

  it("沒有 email → 略過（維持原帳號）", () => {
    const grid = [
      ["員工編號", "Email"],
      ["Z902", ""],
    ];
    const p = buildEmailUpdatePlan(
      grid,
      { ok: true, headerRow: 0, codeCol: 0, emailCol: 1 },
      ACCOUNTS,
      TAKEN,
    );
    expect(p).toEqual([
      {
        line: 2,
        code: "Z902",
        action: "skip",
        reason: "沒有 email，維持原帳號",
        from: "z902@airexpert.com.tw",
      },
    ]);
  });

  it("其他帳號已使用、檔案內 email 重複、格式錯誤、缺編號 → 錯誤", () => {
    const grid = [
      ["員工編號", "Email"],
      ["Z901", "taken@example.com"],
      ["Z902", "Same@example.com"],
      ["Z903", "same@example.com"],
      ["Z904", "a@example.com;b@example.com"],
      ["", "tester@example.com"],
      ["Z906", ""],
    ];
    const p = buildEmailUpdatePlan(
      grid,
      { ok: true, headerRow: 0, codeCol: 0, emailCol: 1 },
      ACCOUNTS,
      TAKEN,
    );
    expect(p.map((r) => [r.line, r.action])).toEqual([
      [2, "error"],
      [3, "error"],
      [4, "error"],
      [5, "error"],
      [6, "error"],
      [7, "skip"],
    ]);
    expect(reasonOf(p[0])).toContain("已是其他帳號");
    expect(reasonOf(p[1])).toContain("email 重複");
    expect(reasonOf(p[2])).toContain("email 重複");
    expect(reasonOf(p[3])).toContain("只能輸入一個 email");
    expect(reasonOf(p[4])).toContain("缺少員工編號");
  });

  it("新 email 是同一帳號的 Auth email（先前同步失敗）→ 不算被占用，可更新", () => {
    const a = acc("Z901", { auth_email: "tester1@example.com" });
    const taken = new Map([["tester1@example.com", U1]]);
    const p = buildEmailUpdatePlan(
      [
        ["員工編號", "Email"],
        ["Z901", "tester1@example.com"],
      ],
      { ok: true, headerRow: 0, codeCol: 0, emailCol: 1 },
      [a],
      taken,
    );
    expect(p[0]).toMatchObject({ action: "update", user_id: U1 });
  });

  it("摘要", () => {
    expect(summarizeEmailPlan(plan)).toEqual({ update: 1, skip: 1, error: 7 });
  });
});

describe("formatPlanLine：只印遮罩 email、不印姓名", () => {
  const cols = findEmailColumns(GRID);
  if (!cols.ok) throw new Error("setup");
  const plan = buildEmailUpdatePlan(GRID, cols, ACCOUNTS, TAKEN);
  const out = plan.map((r) => formatPlanLine(r)).join("\n");

  it("更新列：編號、動作、遮罩的舊→新 email", () => {
    const line = formatPlanLine(plan.find((r) => r.action === "update")!);
    expect(line).toContain("Z904");
    expect(line).toContain("更新");
    expect(line).toContain("z***@airexpert.com.tw → t***@example.com");
  });

  it("整份輸出不含任何原始 email 或姓名", () => {
    for (const row of GRID) {
      for (const cell of row) {
        const v = cell.trim();
        if (v.includes("@")) {
          expect(out.toLowerCase()).not.toContain(v.toLowerCase());
        }
      }
      expect(out).not.toContain(row[1] || "（無）");
    }
    expect(out).not.toMatch(/測試員/);
    // 任何 @ 前面都只有一個字元 + ***
    for (const m of out.matchAll(/(\S*)@/g)) {
      expect(m[1], m[0]).toMatch(/^.?\*\*\*$/);
    }
  });

  it("格式錯誤的 email 也不原樣印出", () => {
    expect(out).not.toContain("bad-email");
  });
});

describe("gotrueUpdateEmail：Auth admin API（fetch，不用 supabase-js）", () => {
  it("PUT /auth/v1/admin/users/<id>，帶 service key 與 email_confirm", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ id: U1 }), { status: 200 }),
    );
    const r = await gotrueUpdateEmail(
      fetchImpl,
      "https://example.supabase.co/",
      "service-key",
      U1,
      "tester@example.com",
    );
    expect(r).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://example.supabase.co/auth/v1/admin/users/${U1}`,
      {
        method: "PUT",
        headers: {
          apikey: "service-key",
          Authorization: "Bearer service-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "tester@example.com",
          email_confirm: true,
        }),
      },
    );
  });

  it("錯誤：email 已存在 → taken；其他 → 訊息（不含 email）", async () => {
    const taken = await gotrueUpdateEmail(
      async () =>
        new Response(
          JSON.stringify({
            code: 422,
            error_code: "email_exists",
            msg: "A user with this email address has already been registered",
          }),
          { status: 422 },
        ),
      "https://example.supabase.co",
      "k",
      U2,
      "tester@example.com",
    );
    expect(taken).toEqual({
      ok: false,
      taken: true,
      error: expect.any(String),
    });
    const other = await gotrueUpdateEmail(
      async () => new Response("oops", { status: 500 }),
      "https://example.supabase.co",
      "k",
      U3,
      "tester@example.com",
    );
    expect(other.ok).toBe(false);
    expect(!other.ok && other.taken).toBe(false);
    expect(!other.ok && other.error).toContain("500");
    const thrown = await gotrueUpdateEmail(
      async () => {
        throw new Error("network down");
      },
      "https://example.supabase.co",
      "k",
      U3,
      "tester@example.com",
    );
    expect(thrown).toEqual({ ok: false, taken: false, error: "network down" });
  });
});
