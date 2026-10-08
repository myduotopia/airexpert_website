import { describe, expect, it } from "vitest";
import {
  createConfirmController,
  type ConfirmRequest,
} from "@/lib/erp/confirm-controller";

// 頁內確認框（#220）的 promise 狀態管理：不碰 DOM／React，只驗證 request → resolve 的流程。

type Opts = { title: string };

function setup() {
  const shown: (ConfirmRequest<Opts> | null)[] = [];
  const c = createConfirmController<Opts>((req) => shown.push(req));
  return { c, shown, last: () => shown[shown.length - 1] };
}

/** 讓已 resolve 的 promise 的 then 先跑完。 */
const flush = () => new Promise((r) => setTimeout(r, 0));

/** 回傳 promise 目前狀態（未決時為 "pending"）。 */
async function state(p: Promise<boolean>) {
  const pending = Symbol("pending");
  const v = await Promise.race([p, flush().then(() => pending)]);
  return v === pending ? "pending" : v;
}

describe("createConfirmController", () => {
  it("request 會通知顯示並帶入選項；確認 → true、通知關閉", async () => {
    const { c, last } = setup();
    const p = c.request({ title: "過帳？" });
    expect(last()?.options).toEqual({ title: "過帳？" });
    expect(c.isOpen()).toBe(true);
    expect(await state(p)).toBe("pending");

    c.resolve(true);
    expect(await p).toBe(true);
    expect(last()).toBeNull();
    expect(c.isOpen()).toBe(false);
  });

  it("取消 → false", async () => {
    const { c } = setup();
    const p = c.request({ title: "刪除？" });
    c.resolve(false);
    expect(await p).toBe(false);
  });

  it("重複 resolve（連點）只有第一次有效，且只通知關閉一次", async () => {
    const { c, shown } = setup();
    const p = c.request({ title: "作廢？" });
    c.resolve(true);
    c.resolve(false);
    c.resolve(true);
    expect(await p).toBe(true);
    expect(shown.filter((s) => s === null)).toHaveLength(1);
  });

  it("沒有未決請求時 resolve／cancel 不做任何事", () => {
    const { c, shown } = setup();
    c.resolve(true);
    c.cancel();
    expect(shown).toHaveLength(0);
  });

  it("卸載（cancel）時未決的 promise resolve(false)，不會永久懸掛", async () => {
    const { c } = setup();
    const p = c.request({ title: "過帳？" });
    c.cancel();
    expect(await p).toBe(false);
    expect(c.isOpen()).toBe(false);
  });

  it("cancel 後仍可再次 request（React StrictMode 會先模擬卸載再掛載）", async () => {
    const { c } = setup();
    c.cancel();
    const p = c.request({ title: "過帳？" });
    expect(c.isOpen()).toBe(true);
    c.resolve(true);
    expect(await p).toBe(true);
  });

  it("連續呼叫：前一個未決的 promise resolve(false)，新的接手顯示", async () => {
    const { c, last } = setup();
    const p1 = c.request({ title: "第一個" });
    const p2 = c.request({ title: "第二個" });
    expect(await p1).toBe(false);
    expect(last()?.options.title).toBe("第二個");
    expect(await state(p2)).toBe("pending");
    c.resolve(true);
    expect(await p2).toBe(true);
  });

  it("每次 request 的 id 不同（Dialog 以 id 為 key 重新掛載、重設焦點）", () => {
    const { c, shown } = setup();
    c.request({ title: "a" });
    c.request({ title: "b" });
    const ids = shown.filter(Boolean).map((s) => s!.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("舊請求的 id 不能結束新請求（resolveById 防止關閉中的舊 Dialog 誤觸）", async () => {
    const { c, last } = setup();
    const p1 = c.request({ title: "第一個" });
    const firstId = last()!.id;
    const p2 = c.request({ title: "第二個" });
    expect(await p1).toBe(false);
    c.resolve(true, firstId);
    expect(await state(p2)).toBe("pending");
    c.resolve(true, last()!.id);
    expect(await p2).toBe(true);
  });
});
