"use server";

// 保養卡 server actions（office only）。讀寫走登入者 session，靠 mx_* 的 office RLS 擋。
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/admin/auth";
import { getServerSupabase } from "@/lib/supabase-server";
import type { ActionResult } from "@/lib/admin/crud";
import {
  machinePayloadFromForm,
  recordPayloadFromForm,
  filterRecordPayloadFromForm,
  parseColumnDefs,
  customerPayloadFromForm,
  parseExtraction,
  MAX_COLUMN_DEFS,
  type ColumnDef,
  type ExtractedDraft,
  type MxCardType,
  type RecordPayload,
} from "@/lib/admin/maintenance-normalize";
import {
  buildCardDrafts,
  isSameCustomer,
  shouldImportFilterCard,
  type CardDrafts,
} from "@/lib/admin/maintenance-card-split";
import type { ServiceType } from "@/lib/admin/maintenance-service-type";
import { extractMaintenanceCard } from "@/lib/ai/gemini";
import {
  findMachineBySerial,
  getMachineCardContext,
  isCustomerCodeTaken,
  listMachineColumns,
} from "@/lib/admin/maintenance";

/**
 * 找或建客戶。優先以「客戶編號 code」比對（不分大小寫）；無編號時退回以 name 完全比對。
 * 回傳 customer id。
 */
async function findOrCreateCustomer(
  supabase: Awaited<ReturnType<typeof getServerSupabase>>,
  input: { code?: string | null; name?: string | null },
): Promise<string> {
  const code = (input.code ?? "").trim();
  const name = (input.name ?? "").trim();
  if (code) {
    const { data: byCode } = await supabase
      .from("mx_customers")
      .select("id")
      .ilike("code", code)
      .limit(1)
      .maybeSingle();
    if (byCode) return (byCode as { id: string }).id;
    const { data: created, error } = await supabase
      .from("mx_customers")
      .insert({ code, name: name || "（未命名客戶）" })
      .select("id")
      .single();
    if (error) throw new Error(`建立客戶失敗：${error.message}`);
    return (created as { id: string }).id;
  }
  // 無客戶編號 → 沿用以名稱找/建。
  const clean = name;
  if (!clean) throw new Error("客戶名稱為必填。");
  const { data: existing } = await supabase
    .from("mx_customers")
    .select("id")
    .eq("name", clean)
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;
  const { data: created, error } = await supabase
    .from("mx_customers")
    .insert({ name: clean })
    .select("id")
    .single();
  if (error) throw new Error(`建立客戶失敗：${error.message}`);
  return (created as { id: string }).id;
}

// ── 表單 autocomplete（typeahead）搜尋 ─────────────────────────────
// 皆走登入者 session（office RLS）；以逐欄 .ilike(column, %q%) 查詢，值由 client
// 參數化，避免 PostgREST or-filter 的字串注入（客戶名含「(股)」等字元亦安全）。

export interface CustomerHit {
  id: string;
  code: string | null;
  name: string;
}

/** 依客戶編號或名稱模糊搜尋客戶（供表單自動完成）。上限 8 筆。 */
export async function searchCustomersAction(
  query: string,
): Promise<CustomerHit[]> {
  await requireRole(["office"]);
  const q = query.trim();
  if (!q) return [];
  const supabase = await getServerSupabase();
  const pattern = `%${q}%`;
  const [byCode, byName] = await Promise.all([
    supabase
      .from("mx_customers")
      .select("id, code, name")
      .ilike("code", pattern)
      .limit(8),
    supabase
      .from("mx_customers")
      .select("id, code, name")
      .ilike("name", pattern)
      .limit(8),
  ]);
  const merged = new Map<string, CustomerHit>();
  for (const row of [...(byCode.data ?? []), ...(byName.data ?? [])]) {
    const r = row as CustomerHit;
    if (!merged.has(r.id)) merged.set(r.id, r);
  }
  return Array.from(merged.values()).slice(0, 8);
}

export interface MachineHit {
  id: string;
  serial_no: string;
  machine_no: string | null;
  customer_code: string | null;
  customer_name: string;
}

type MachineRow = {
  id: string;
  serial_no: string;
  machine_no: string | null;
  mx_customers:
    | { code: string | null; name: string }
    | { code: string | null; name: string }[]
    | null;
};

function toMachineHit(row: MachineRow): MachineHit {
  const c = Array.isArray(row.mx_customers)
    ? (row.mx_customers[0] ?? null)
    : row.mx_customers;
  return {
    id: row.id,
    serial_no: row.serial_no,
    machine_no: row.machine_no,
    customer_code: c?.code ?? null,
    customer_name: c?.name ?? "",
  };
}

/**
 * 依機號或機台編號模糊搜尋機台（排除已封存），join 客戶。上限 8 筆。
 * cardType 有值時只搜同卡別（過濾卡表單不該提示空壓機卡）。
 */
export async function searchMachinesAction(
  query: string,
  cardType?: MxCardType,
): Promise<MachineHit[]> {
  await requireRole(["office"]);
  const q = query.trim();
  if (!q) return [];
  const supabase = await getServerSupabase();
  const pattern = `%${q}%`;
  const select = "id, serial_no, machine_no, mx_customers(code, name)";
  const base = () => {
    const b = supabase
      .from("mx_machines")
      .select(select)
      .is("archived_at", null);
    return cardType ? b.eq("card_type", cardType) : b;
  };
  const [bySerial, byMachineNo] = await Promise.all([
    base().ilike("serial_no", pattern).limit(8),
    base().ilike("machine_no", pattern).limit(8),
  ]);
  const merged = new Map<string, MachineHit>();
  for (const row of [...(bySerial.data ?? []), ...(byMachineNo.data ?? [])]) {
    const hit = toMachineHit(row as MachineRow);
    if (!merged.has(hit.id)) merged.set(hit.id, hit);
  }
  return Array.from(merged.values()).slice(0, 8);
}

/**
 * 把過濾卡的耗材欄定義同步成 defs 的內容與順序（新增 / 更名 / 刪除 / 重排）。
 * 刪除欄位只會刪 mx_machine_columns 的定義列，既有紀錄 values 內該 key 仍保留
 * （不再顯示），避免誤刪不可回復的手寫資料。
 */
async function syncMachineColumns(
  supabase: Awaited<ReturnType<typeof getServerSupabase>>,
  machineId: string,
  defs: ColumnDef[],
): Promise<void> {
  const { data: existingRows, error: readErr } = await supabase
    .from("mx_machine_columns")
    .select("id")
    .eq("machine_id", machineId);
  if (readErr) throw new Error(`讀取耗材欄位失敗：${readErr.message}`);
  const existing = new Set(
    (existingRows ?? []).map((r) => (r as { id: string }).id),
  );

  const kept = defs.filter((d) => d.id !== null && existing.has(d.id));
  const keptIds = new Set(kept.map((d) => d.id as string));
  const removed = [...existing].filter((id) => !keptIds.has(id));

  if (removed.length > 0) {
    const { error } = await supabase
      .from("mx_machine_columns")
      .delete()
      .in("id", removed);
    if (error) throw new Error(`刪除耗材欄位失敗：${error.message}`);
  }

  // 逐列 update：欄位數量是個位數，不值得為此加 upsert 的 unique 約束。
  await Promise.all(
    defs.map(async (d, i) => {
      if (d.id === null || !existing.has(d.id)) return;
      const { error } = await supabase
        .from("mx_machine_columns")
        .update({ label: d.label, sort_order: i })
        .eq("id", d.id);
      if (error) throw new Error(`更新耗材欄位失敗：${error.message}`);
    }),
  );

  const added = defs
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => d.id === null || !existing.has(d.id))
    .map(({ d, i }) => ({
      machine_id: machineId,
      label: d.label,
      sort_order: i,
    }));
  if (added.length > 0) {
    const { error } = await supabase.from("mx_machine_columns").insert(added);
    if (error) throw new Error(`新增耗材欄位失敗：${error.message}`);
  }
}

/** 建立新卡（含客戶）。表單需帶 customer_name + 機器欄位。成功後導向卡詳情。 */
export async function createMachineAction(fd: FormData): Promise<void> {
  await requireRole(["office"]);
  const supabase = await getServerSupabase();

  const customerName = String(fd.get("customer_name") ?? "").trim();
  if (!customerName) throw new Error("客戶名稱為必填。");
  const customerCode = String(fd.get("customer_code") ?? "").trim();
  const payload = machinePayloadFromForm(fd);

  const customerId = await findOrCreateCustomer(supabase, {
    code: customerCode,
    name: customerName,
  });
  const { data, error } = await supabase
    .from("mx_machines")
    .insert({ ...payload, customer_id: customerId })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505")
      throw new Error("此機號已存在，請改用既有卡片。");
    throw new Error(`建立保養卡失敗：${error.message}`);
  }
  const machineId = (data as { id: string }).id;

  if (payload.card_type === "filter") {
    // 建卡與建欄非同一交易；欄位寫入失敗就把剛建的卡刪掉，避免留下沒有欄位的空卡。
    try {
      await syncMachineColumns(
        supabase,
        machineId,
        parseColumnDefs(fd.get("columns_json")),
      );
    } catch (e) {
      await supabase.from("mx_machines").delete().eq("id", machineId);
      throw e;
    }
  }

  revalidatePath("/admin/maintenance");
  redirect(`/admin/maintenance/${machineId}`);
}

/** 更新既有卡的基本資訊（含客戶名）。 */
export async function updateMachineAction(
  machineId: string,
  fd: FormData,
): Promise<ActionResult> {
  await requireRole(["office"]);
  const supabase = await getServerSupabase();

  const customerName = String(fd.get("customer_name") ?? "").trim();
  const customerCode = String(fd.get("customer_code") ?? "").trim();
  try {
    // 卡別以 DB 為準，不接受表單改卡別（改了會讓既有紀錄的欄位語意錯亂）。
    const ctx = await getMachineCardContext(machineId);
    if (!ctx) return { ok: false, error: "找不到此保養卡。" };
    const payload = machinePayloadFromForm(fd);
    const patch: Record<string, unknown> = {
      ...payload,
      card_type: ctx.card_type,
    };
    if (customerName || customerCode) {
      patch.customer_id = await findOrCreateCustomer(supabase, {
        code: customerCode,
        name: customerName,
      });
    }
    const { error } = await supabase
      .from("mx_machines")
      .update(patch)
      .eq("id", machineId);
    if (error) {
      if (error.code === "23505") return { ok: false, error: "此機號已存在。" };
      return { ok: false, error: error.message };
    }
    // 只有表單真的帶了 columns_json 才動欄位定義。缺這個欄位就當「這次不改欄位」，
    // 避免非本表單送出的請求（少帶一個 field）把整張卡的欄位定義全部刪掉；
    // 正常送出時就算欄位清空也會帶 "[]"，仍會走到同步。
    if (ctx.card_type === "filter" && fd.has("columns_json")) {
      await syncMachineColumns(
        supabase,
        machineId,
        parseColumnDefs(fd.get("columns_json")),
      );
    }
    revalidatePath("/admin/maintenance");
    revalidatePath(`/admin/maintenance/${machineId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * 依卡別產生維護紀錄的 payload。卡別與欄位定義一律向 DB 取，不信任表單。
 * 空壓機卡 → 固定 9 欄；過濾卡 → service_date / technician / note + values jsonb。
 */
async function recordPayloadForMachine(
  machineId: string,
  fd: FormData,
): Promise<Record<string, unknown>> {
  const ctx = await getMachineCardContext(machineId);
  if (!ctx) throw new Error("找不到此保養卡。");
  return ctx.card_type === "filter"
    ? { ...filterRecordPayloadFromForm(fd, ctx.columns) }
    : { ...recordPayloadFromForm(fd) };
}

/** 新增一列維護紀錄（手動；source='manual'）。 */
export async function addRecordAction(
  machineId: string,
  fd: FormData,
): Promise<void> {
  await requireRole(["office"]);
  const supabase = await getServerSupabase();
  const payload = await recordPayloadForMachine(machineId, fd);
  const { error } = await supabase
    .from("mx_records")
    .insert({ ...payload, machine_id: machineId, source: "manual" });
  if (error) throw new Error(`新增維護紀錄失敗：${error.message}`);
  revalidatePath(`/admin/maintenance/${machineId}`);
  redirect(`/admin/maintenance/${machineId}`);
}

/** 更新一列維護紀錄。 */
export async function updateRecordAction(
  recordId: string,
  machineId: string,
  fd: FormData,
): Promise<ActionResult> {
  await requireRole(["office"]);
  const supabase = await getServerSupabase();
  try {
    const payload = await recordPayloadForMachine(machineId, fd);
    // 一併綁 machine_id：payload 的形狀（固定 9 欄 vs values jsonb）是依
    // machineId 的卡別決定的，若 recordId 其實屬於另一張卡，寫進去的欄位語意
    // 會對不上。正常流程兩者必定相符，此處只是把不變式寫死。
    const { error } = await supabase
      .from("mx_records")
      .update(payload)
      .eq("id", recordId)
      .eq("machine_id", machineId);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/admin/maintenance/${machineId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** 刪除一列維護紀錄（DeleteButton 以 bind 帶入 id）。 */
export async function deleteRecordAction(
  recordId: string,
  machineId: string,
): Promise<ActionResult> {
  await requireRole(["office"]);
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("mx_records")
    .delete()
    .eq("id", recordId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/maintenance/${machineId}`);
  return { ok: true };
}

/** 辨識後比對到的既有卡。過濾卡另帶該卡既有的耗材欄定義（供核對畫面直接沿用）。 */
export interface CardMatch {
  id: string;
  serial_no: string;
  customer_name: string;
  columns: { id: string; label: string }[];
}

/** 草稿卡上（辨識到的）客戶身分，用來確認比對到的既有卡是不是同一個客戶的。 */
interface DraftOwner {
  customer_code: string;
  customer_name: string;
}

export type ExtractResult =
  | {
      ok: true;
      /** 原始擷取結果（未分流），保留供除錯 / 稽核對照。 */
      draft: ExtractedDraft;
      /** 分流後要並排核對的兩張草稿卡（其一可能為 null）。 */
      cards: CardDrafts;
      /** 過濾卡預設是否勾選匯入（沒有任何過濾維護列時預設不匯入）。 */
      importFilterByDefault: boolean;
      /** 空壓機卡的機號比對結果。 */
      match: CardMatch | null;
      /** 過濾卡的機號比對結果。 */
      filterMatch: CardMatch | null;
      draftId: string;
    }
  | { ok: false; error: string };

/**
 * 依機號在指定卡別中找既有卡；過濾卡一併帶回耗材欄定義。
 *
 * 過濾卡多一道客戶檢查：它的「卡號」是由 filter_spec 推導的過濾器型號（例「100HA」），
 * 不同客戶必然重複，而機號唯一索引是全表唯一，所以純比機號會把 B 客戶的乾燥機維護列
 * 接到 A 客戶那張「100HA」卡上。客戶對不上就當作沒比對到，讓員工自己建卡 / 改卡號。
 * 空壓機卡的機號是原廠序號，不會撞號，維持原本的純機號比對。
 */
async function matchCard(
  serial: string,
  cardType: MxCardType,
  owner: DraftOwner,
): Promise<CardMatch | null> {
  const hit = await findMachineBySerial(serial, cardType);
  if (!hit) return null;
  if (cardType === "filter" && !isSameCustomer(hit, owner)) return null;
  const columns =
    cardType === "filter"
      ? (await listMachineColumns(hit.id)).map((c) => ({
          id: c.id,
          label: c.label,
        }))
      : [];
  return { ...hit, columns };
}

/** 拍照辨識：Gemini 擷取 → 稽核草稿 → 分流成兩張卡 → 各自機號比對。 */
export async function extractCardFromImageAction(input: {
  imageBase64: string;
  mimeType: string;
  photoPath: string;
}): Promise<ExtractResult> {
  await requireRole(["office"]);
  const supabase = await getServerSupabase();
  try {
    const { raw } = await extractMaintenanceCard(
      input.imageBase64,
      input.mimeType,
    );
    const draft = parseExtraction(raw);
    const cards = buildCardDrafts(draft);

    const { data: user } = await supabase.auth.getUser();
    const { data: draftRow } = await supabase
      .from("mx_import_drafts")
      .insert({
        created_by: user.user?.id ?? null,
        photo_path: input.photoPath,
        raw_output: raw,
        status: "pending",
      })
      .select("id")
      .single();

    const [match, filterMatch] = await Promise.all([
      cards.compressor
        ? matchCard(cards.compressor.basic.serial_no, "compressor", {
            customer_code: cards.compressor.basic.customer_code,
            customer_name: cards.compressor.basic.customer_name,
          })
        : Promise.resolve(null),
      cards.filter
        ? matchCard(cards.filter.basic.serial_no, "filter", {
            customer_code: cards.filter.basic.customer_code,
            customer_name: cards.filter.basic.customer_name,
          })
        : Promise.resolve(null),
    ]);

    return {
      ok: true,
      draft,
      cards,
      importFilterByDefault: shouldImportFilterCard(cards.filter),
      match,
      filterMatch,
      draftId: (draftRow as { id: string } | null)?.id ?? "",
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export interface CommitCardBasic {
  customer_name: string;
  customer_code: string;
  serial_no: string;
  machine_no: string;
  location: string;
  purchased_at: string;
  model: string;
  horsepower: string;
  voltage: string;
  /** 過濾卡表頭：過濾器型號清單（空壓機卡不使用）。 */
  filter_spec: string;
  /** 過濾卡表頭：排水器 / 馬達葉片規格（空壓機卡不使用）。 */
  drain_spec: string;
}

export interface CommitCompressorCard {
  /** 命中既有卡則帶 id（附加維護列）；否則 null → 依 basic 建卡。 */
  machineId: string | null;
  basic: CommitCardBasic;
  records: RecordPayload[];
}

export interface CommitFilterRecord {
  service_date: string | null;
  technician: string | null;
  note: string | null;
  /** 服務類型（例檢／保養／維修）；與 FilterRecordPayload 一致，判不出來為 null。 */
  service_type: ServiceType | null;
  /** 與 columns 同序的耗材欄值；null = 該欄未填。 */
  values: (string | null)[];
}

export interface CommitFilterCard {
  machineId: string | null;
  basic: CommitCardBasic;
  /** 建新卡時要一併建立的耗材欄名（由左到右）。附加到既有卡時忽略，改用該卡既有欄位。 */
  columns: string[];
  records: CommitFilterRecord[];
}

export interface CommitImportInput {
  draftId: string;
  /** 不匯入該張卡時傳 null。兩張都 null 視為錯誤。 */
  compressor: CommitCompressorCard | null;
  filter: CommitFilterCard | null;
}

/** 把 basic 轉成 mx_machines 的欄位（空字串一律轉 null）。 */
function machineInsertFromBasic(
  basic: CommitCardBasic,
  cardType: MxCardType,
  customerId: string,
): Record<string, unknown> {
  const nz = (v: string) => v.trim() || null;
  return {
    customer_id: customerId,
    card_type: cardType,
    serial_no: basic.serial_no.trim(),
    machine_no: nz(basic.machine_no),
    location: nz(basic.location),
    purchased_at: cardType === "filter" ? null : nz(basic.purchased_at),
    model: nz(basic.model),
    horsepower: cardType === "filter" ? null : nz(basic.horsepower),
    voltage: cardType === "filter" ? null : nz(basic.voltage),
    filter_spec: cardType === "filter" ? nz(basic.filter_spec) : null,
    drain_spec: cardType === "filter" ? nz(basic.drain_spec) : null,
  };
}

/** 建卡（拍照匯入用）。撞機號唯一索引時丟出可讀訊息。 */
async function insertImportedMachine(
  supabase: Awaited<ReturnType<typeof getServerSupabase>>,
  basic: CommitCardBasic,
  cardType: MxCardType,
): Promise<string> {
  const label = cardType === "filter" ? "過濾系統卡" : "空壓機卡";
  if (!basic.serial_no.trim()) throw new Error(`${label}的機號為必填。`);
  // 核對表單是 noValidate（未選取的分頁以 CSS 隱藏，瀏覽器必填驗證會讓表單「按了沒反應」），
  // 必填一律在此把關。客戶名稱不能只靠 findOrCreateCustomer——它會把空白靜靜換成
  // 「（未命名客戶）」，結果是資料庫多一筆假客戶而不是一則錯誤訊息。
  if (!basic.customer_name.trim())
    throw new Error(`${label}的客戶名稱為必填。`);
  const customerId = await findOrCreateCustomer(supabase, {
    code: basic.customer_code,
    name: basic.customer_name || "（未命名客戶）",
  });
  const { data, error } = await supabase
    .from("mx_machines")
    .insert(machineInsertFromBasic(basic, cardType, customerId))
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505")
      throw new Error(
        cardType === "filter"
          ? // 過濾卡的卡號是過濾器型號（例「100HA」），撞號多半是「別的客戶已經用了」，
            // 叫員工去附加到那張卡反而是錯的，請他改一個不重複的卡號。
            `過濾系統卡的卡號「${basic.serial_no.trim()}」已被其他卡使用，請改一個不重複的卡號。`
          : `${label}的機號已存在，請改為附加到現有卡。`,
      );
    throw new Error(`建立${label}失敗：${error.message}`);
  }
  return (data as { id: string }).id;
}

/**
 * 匯入一次辨識的結果：可同時提交空壓機卡與過濾系統卡。
 *
 * 兩張卡屬同一客戶時共用 customer（findOrCreateCustomer 以客戶編號 / 名稱去重）。
 * 非單一 DB 交易，故沿用手動補償，任一步失敗要回到「什麼都沒發生」：
 * - 本次新建的卡全部刪掉（FK cascade 會一併帶走其維護列與耗材欄定義）。
 * - 本次寫進「既有卡」的維護列也要逐筆刪掉：那張卡不能刪，但它的列若留著，
 *   員工修正錯誤重送時會整批變成重複紀錄。
 */
export async function commitImportAction(
  input: CommitImportInput,
): Promise<ActionResult & { machineId?: string; machineIds?: string[] }> {
  await requireRole(["office"]);
  const supabase = await getServerSupabase();
  if (!input.compressor && !input.filter)
    return { ok: false, error: "沒有勾選要匯入的卡片。" };

  // 本次新建的卡；任一步失敗要整批回滾，避免留下孤兒卡。
  const createdMachineIds: string[] = [];
  // 本次寫入的維護列。新建卡的列會被 cascade 帶走，但附加到既有卡的不會，故一律記下。
  const insertedRecordIds: string[] = [];

  try {
    let compressorId: string | null = null;
    let filterId: string | null = null;

    // ── 空壓機卡 ────────────────────────────────────────────
    if (input.compressor) {
      const card = input.compressor;
      compressorId = card.machineId;
      if (!compressorId) {
        compressorId = await insertImportedMachine(
          supabase,
          card.basic,
          "compressor",
        );
        createdMachineIds.push(compressorId);
      }
      if (card.records.length > 0) {
        const { data, error } = await supabase
          .from("mx_records")
          .insert(
            card.records.map((r) => ({
              ...r,
              machine_id: compressorId,
              source: "photo" as const,
            })),
          )
          .select("id");
        if (error) throw new Error(`匯入空壓機維護紀錄失敗：${error.message}`);
        for (const row of (data ?? []) as { id: string }[])
          insertedRecordIds.push(row.id);
      }
    }

    // ── 過濾系統卡 ──────────────────────────────────────────
    if (input.filter) {
      const card = input.filter;
      filterId = card.machineId;
      // 與 record.values 同序的欄位 id；null = 該位置沒有對應的欄位定義。
      let columnIds: (string | null)[];

      if (!filterId) {
        filterId = await insertImportedMachine(supabase, card.basic, "filter");
        createdMachineIds.push(filterId);
        // 空白欄名不建欄（比照 parseColumnDefs），但在 columnIds 內仍要「留一個 null 占位」：
        // r.values 是照 client 的完整欄位清單逐格填的，把空白欄直接濾掉會讓它後面每一格
        // 的值整排往前錯一欄（最後一格的值則靜靜消失）。上限同手動建卡。
        const named = card.columns
          .map((label, index) => ({ label: label.trim(), index }))
          .filter((c) => c.label !== "")
          .slice(0, MAX_COLUMN_DEFS);
        columnIds = card.columns.map(() => null);
        if (named.length > 0) {
          const { data, error } = await supabase
            .from("mx_machine_columns")
            .insert(
              named.map((c, i) => ({
                machine_id: filterId,
                label: c.label,
                sort_order: i,
              })),
            )
            .select("id, sort_order");
          if (error) throw new Error(`建立耗材欄位失敗：${error.message}`);
          // .select() 不保證回傳順序，故以 sort_order 排回插入順序，再對回原欄位位置。
          const ids = (data as { id: string; sort_order: number }[])
            .slice()
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((c) => c.id);
          named.forEach((c, i) => {
            columnIds[c.index] = ids[i] ?? null;
          });
        }
      } else {
        // 附加到既有過濾卡：欄位以 DB 為準（不信任 client 傳來的欄名），值依位置對應。
        columnIds = (await listMachineColumns(filterId)).map((c) => c.id);
      }

      if (card.records.length > 0) {
        const { data, error } = await supabase
          .from("mx_records")
          .insert(
            card.records.map((r) => {
              const values: Record<string, string> = {};
              columnIds.forEach((id, i) => {
                if (!id) return;
                const v = (r.values[i] ?? "").trim();
                if (v) values[id] = v;
              });
              return {
                machine_id: filterId,
                service_date: r.service_date,
                technician: r.technician,
                note: r.note,
                service_type: r.service_type,
                values: Object.keys(values).length > 0 ? values : null,
                source: "photo" as const,
              };
            }),
          )
          .select("id");
        if (error)
          throw new Error(`匯入過濾系統維護紀錄失敗：${error.message}`);
        for (const row of (data ?? []) as { id: string }[])
          insertedRecordIds.push(row.id);
      }
    }

    const machineIds = [compressorId, filterId].filter(
      (v): v is string => v !== null,
    );

    // draftId 可能為空（辨識時稽核草稿寫入失敗，best-effort）；為空則跳過更新，
    // 避免 .eq("id","") 靜默匹配不到任何列。
    if (input.draftId) {
      await supabase
        .from("mx_import_drafts")
        .update({
          status: "committed",
          machine_id: compressorId ?? filterId,
          machine_ids: machineIds,
        })
        .eq("id", input.draftId);
    }

    revalidatePath("/admin/maintenance");
    return { ok: true, machineId: machineIds[0], machineIds };
  } catch (e) {
    // 回滾：先刪本次寫入的維護列（附加到既有卡的不會被 cascade 帶走，留著會在重送時
    // 變成重複紀錄），再刪本次新建的卡（cascade 連帶清掉其維護列與耗材欄）。
    if (insertedRecordIds.length > 0) {
      await supabase.from("mx_records").delete().in("id", insertedRecordIds);
    }
    for (const id of createdMachineIds) {
      await supabase.from("mx_machines").delete().eq("id", id);
    }
    return { ok: false, error: (e as Error).message };
  }
}

/** 封存（軟刪除）一張卡：從正常列表移到封存區。DeleteButton 以 bind 帶入 id。 */
export async function archiveMachineAction(
  machineId: string,
): Promise<ActionResult> {
  await requireRole(["office"]);
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("mx_machines")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", machineId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/maintenance");
  revalidatePath("/admin/maintenance/archive");
  return { ok: true };
}

/** 從封存區復原一張卡（form action）。 */
export async function restoreMachineAction(machineId: string): Promise<void> {
  await requireRole(["office"]);
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("mx_machines")
    .update({ archived_at: null })
    .eq("id", machineId);
  if (error) {
    // 邊界：封存後又用同機號建了新的使用中卡片，復原會撞部分唯一索引（23505）。
    if (error.code === "23505") {
      throw new Error(
        "同機號已有使用中的卡片，無法復原。請先處理該卡，或改為永久刪除此封存卡。",
      );
    }
    throw new Error(`復原失敗：${error.message}`);
  }
  revalidatePath("/admin/maintenance");
  revalidatePath("/admin/maintenance/archive");
}

/** 永久刪除一張卡（連同維護紀錄，FK cascade）。DeleteButton 以 bind 帶入 id。 */
export async function deleteMachinePermanentlyAction(
  machineId: string,
): Promise<ActionResult> {
  await requireRole(["office"]);
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("mx_machines")
    .delete()
    .eq("id", machineId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/maintenance/archive");
  return { ok: true };
}

/**
 * 更新客戶主檔（0016 欄位）。客戶編號重複時**不擋**，僅回傳軟性警告
 * ——0013 刻意未對 code 設唯一約束（回填資料可能重複）。
 */
export async function updateCustomerAction(
  customerId: string,
  fd: FormData,
): Promise<ActionResult & { warning?: string }> {
  await requireRole(["office"]);
  const supabase = await getServerSupabase();
  try {
    const payload = customerPayloadFromForm(fd);
    const { error } = await supabase
      .from("mx_customers")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", customerId);
    if (error) return { ok: false, error: error.message };

    // 客戶名稱 / 編號會出現在保養卡列表與卡詳情，一併失效。
    revalidatePath("/admin/maintenance", "layout");

    const duplicated = payload.code
      ? await isCustomerCodeTaken(payload.code, customerId)
      : false;
    if (duplicated) {
      return {
        ok: true,
        warning: `已儲存，但客戶編號「${payload.code}」已被其他客戶使用，請確認是否正確。`,
      };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
