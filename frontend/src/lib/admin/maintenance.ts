// 保養卡 DAL — SERVER ONLY。讀寫走登入者 session，靠 mx_* 的 office RLS 擋。
import "server-only";
import { getServerSupabase } from "../supabase-server";
import {
  normalizeSerial,
  normalizeMachineNo,
  normalizeCustomerCode,
  type MxCardType,
} from "./maintenance-normalize";
import type { ServiceType } from "./maintenance-service-type";

export type { MxCardType } from "./maintenance-normalize";

export interface MxCustomer {
  id: string;
  name: string;
  code: string | null;
  /** 以下客戶主檔欄位由 0016 新增。 */
  contact_person: string | null;
  phone: string | null;
  address: string | null;
  note: string | null;
  created_at: string;
  updated_at: string | null;
}

/** 查無客戶時的佔位（機台的 customer_id 為 not null，理論上不會發生，防呆用）。 */
const EMPTY_CUSTOMER: MxCustomer = {
  id: "",
  name: "（未命名客戶）",
  code: null,
  contact_person: null,
  phone: null,
  address: null,
  note: null,
  created_at: "",
  updated_at: null,
};

export interface MxMachine {
  id: string;
  customer_id: string;
  /** 卡別。既有卡一律為 compressor（DB 預設值）。 */
  card_type: MxCardType;
  /** 機台代號 tag：客戶內部稱呼（A機／1號機／A01 銅器部）。同一客戶內唯一。 */
  machine_no: string | null;
  /** 機號：空壓機為原廠序號；過濾卡此處放過濾器型號。0018 起可為 null。 */
  serial_no: string | null;
  location: string | null;
  purchased_at: string | null; // yyyy-mm-dd
  model: string | null;
  horsepower: string | null;
  voltage: string | null;
  created_at: string;
  archived_at: string | null;
  /** 過濾卡表頭：左欄「過濾器」型號清單（多行原文）。空壓機卡恆為 null。 */
  filter_spec: string | null;
  /** 過濾卡表頭：右欄「排水器 / 馬達葉片」規格（多行原文）。空壓機卡恆為 null。 */
  drain_spec: string | null;
}

/** 過濾卡的一個動態耗材欄定義（依 sort_order 由左到右）。 */
export interface MxMachineColumn {
  id: string;
  machine_id: string;
  label: string;
  sort_order: number;
  created_at: string;
}

export interface MxRecord {
  id: string;
  machine_id: string;
  service_date: string | null;
  hours: string | null;
  oil: string | null;
  oil_filter: string | null;
  air_filter: string | null;
  oil_separator: string | null;
  inverter: string | null;
  filter_system: string | null;
  technician: string | null;
  note: string | null;
  /** 過濾卡的動態耗材欄值：{ "<column_id>": "1只" }。空壓機卡為 null。 */
  values: Record<string, string> | null;
  /** 服務類型（例檢／保養／維修）；null = 未判定。 */
  service_type: ServiceType | null;
  source: "manual" | "photo";
  created_at: string;
}

/** 機器 + 客戶名 + 最後保養日（列表用）。 */
export interface MxMachineListItem extends MxMachine {
  customer_name: string;
  last_service_date: string | null;
}

/** 將 select("*, mx_customers(name), mx_records(service_date)") 的原始列 map 成列表項目。 */
/** 取一組維護紀錄中最新的保養日（ISO 字串可直接字典序比較）。無日期回 null。 */
function lastServiceDate(
  records: { service_date: string | null }[] | null | undefined,
): string | null {
  return (
    (records ?? [])
      .map((r) => r.service_date)
      .filter((d): d is string => !!d)
      .sort()
      .at(-1) ?? null
  );
}

function mapMachineListRow(m: Record<string, unknown>): MxMachineListItem {
  const last = lastServiceDate(
    m.mx_records as { service_date: string | null }[] | undefined,
  );
  // mx_records 已於上方取出計算 last，此處僅需從 machine 物件中排除掉。
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { mx_customers, mx_records, ...machine } = m;
  return {
    ...(machine as unknown as MxMachine),
    customer_name:
      (mx_customers as { name: string } | null)?.name ?? "（未命名客戶）",
    last_service_date: last,
  };
}

/** 使用中的保養卡列表。傳 cardType 可只取單一卡別；省略則不分卡別全取。 */
export async function listMachines(
  cardType?: MxCardType,
): Promise<MxMachineListItem[]> {
  const supabase = await getServerSupabase();
  let query = supabase
    .from("mx_machines")
    .select("*, mx_customers(name), mx_records(service_date)")
    .is("archived_at", null);
  if (cardType) query = query.eq("card_type", cardType);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(`讀取保養卡失敗：${error.message}`);
  return (data ?? []).map(mapMachineListRow);
}

/** 封存區列表：僅已封存的卡，依封存時間新到舊排序。 */
export async function listArchivedMachines(): Promise<MxMachineListItem[]> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("mx_machines")
    .select("*, mx_customers(name), mx_records(service_date)")
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });
  if (error) throw new Error(`讀取封存區失敗：${error.message}`);
  return (data ?? []).map(mapMachineListRow);
}

export async function getMachine(id: string): Promise<{
  machine: MxMachine;
  customer: MxCustomer;
  records: MxRecord[];
  /** 過濾卡的動態耗材欄定義（依 sort_order）；空壓機卡為空陣列。 */
  columns: MxMachineColumn[];
} | null> {
  const supabase = await getServerSupabase();
  const { data: machine, error } = await supabase
    .from("mx_machines")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`讀取保養卡失敗：${error.message}`);
  if (!machine) return null;

  const [{ data: customer }, { data: records }, columns] = await Promise.all([
    supabase
      .from("mx_customers")
      .select("*")
      .eq("id", (machine as MxMachine).customer_id)
      .maybeSingle(),
    supabase
      .from("mx_records")
      .select("*")
      .eq("machine_id", id)
      .order("service_date", { ascending: false, nullsFirst: false }),
    // 空壓機卡不會有動態欄，省一次查詢。
    (machine as MxMachine).card_type === "filter"
      ? listMachineColumns(id)
      : Promise.resolve<MxMachineColumn[]>([]),
  ]);

  return {
    machine: machine as MxMachine,
    customer: (customer as MxCustomer) ?? EMPTY_CUSTOMER,
    records: (records as MxRecord[]) ?? [],
    columns,
  };
}

/** 取一張卡的動態耗材欄定義，依 sort_order 由左到右。 */
export async function listMachineColumns(
  machineId: string,
): Promise<MxMachineColumn[]> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("mx_machine_columns")
    .select("*")
    .eq("machine_id", machineId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`讀取耗材欄位失敗：${error.message}`);
  return (data ?? []) as MxMachineColumn[];
}

/**
 * server action 寫入前用的輕量查詢：卡別 + 動態欄定義。
 * 卡別一律以 DB 為準（不信任表單），避免用空壓機表單寫進過濾卡。
 */
export async function getMachineCardContext(machineId: string): Promise<{
  card_type: MxCardType;
  columns: MxMachineColumn[];
} | null> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("mx_machines")
    .select("card_type")
    .eq("id", machineId)
    .maybeSingle();
  if (error) throw new Error(`讀取保養卡失敗：${error.message}`);
  if (!data) return null;
  const cardType = (data as { card_type: MxCardType }).card_type;
  return {
    card_type: cardType,
    columns: cardType === "filter" ? await listMachineColumns(machineId) : [],
  };
}

// ── 機台識別比對（#165）───────────────────────────────────────────
//
// 機台的唯一鍵是三段式的 (客戶, 機台代號, 機號)，而不是機號自己：
//   * 空壓機的機號是原廠序號（J751307001），碰巧全球唯一；
//   * 過濾卡的「機號」其實是過濾器型號（100HA／AD480），兩家客戶買同款就一樣；
//   * 機台代號（A機／1號機）是客戶內部稱呼，跨客戶必然重複。
// 因此 0018 把唯一索引改成 per-customer，這裡的查詢一律**先框在一個客戶內**。

/** 機台比對的命中結果。帶客戶資訊供 UI 顯示與跨客戶提示使用。 */
export interface MachineIdentityHit {
  id: string;
  serial_no: string | null;
  machine_no: string | null;
  card_type: MxCardType;
  customer_id: string;
  customer_name: string;
  customer_code: string;
  /**
   * true = 這個命中可以當成「確定是同一台機器」，核對畫面才可以預設附加維護列。
   *
   * false = 只是「值得給員工看一眼」的候選：資料上分辨不出是不是同一台機器
   * （例：照片上寫著 B機，但只比到一張沒有代號、機號同為 AD480 的卡 —— 它可能
   * 就是這台機器只是還沒補代號，也可能是同客戶的另一台 AD480）。
   * 這種命中一律要顯示警告、附加預設關閉，否則會靜靜把維護列接到別台機器上。
   */
  confident: boolean;
}

/** 比對查詢共用的 select 欄位。 */
const IDENTITY_SELECT =
  "id, serial_no, machine_no, card_type, customer_id, mx_customers(name, code)";

type IdentityRow = {
  id: string;
  serial_no: string | null;
  machine_no: string | null;
  card_type: MxCardType;
  customer_id: string;
  mx_customers:
    | { name: string; code: string | null }
    | { name: string; code: string | null }[]
    | null;
};

function toIdentityHit(
  row: IdentityRow,
  confident: boolean,
): MachineIdentityHit {
  const c = Array.isArray(row.mx_customers)
    ? (row.mx_customers[0] ?? null)
    : row.mx_customers;
  return {
    id: row.id,
    serial_no: row.serial_no,
    machine_no: row.machine_no,
    card_type: row.card_type,
    customer_id: row.customer_id,
    customer_name: c?.name ?? "",
    customer_code: c?.code ?? "",
    confident,
  };
}

/**
 * 在**指定客戶內**找既有卡，依序：
 *   1. 有機台代號 → 以代號比對（客戶內唯一，這才是人平常在講的識別）
 *   2. 代號比不到（或本來就沒有代號）→ 以機號比對「沒有代號的卡」
 *   3. 本來就沒有代號時，最後才退回比對「任何一張同機號的卡」
 * 全都落空回 null（呼叫端一律解讀為「建新卡」）。
 *
 * 第 2 步是既有資料的命脈：現有卡幾乎清一色只有機號、machine_no 是 null，而
 * #165 之後的辨識 prompt 會積極抓出卡上手寫的「A機」。若「有代號就只比代號」，
 * 每一次重拍既有卡都會比不到而多開一張重複卡（DB 也擋不住 —— 代號索引與
 * 機號索引互斥，有代號的新卡不受 mx_machines_customer_serial_key 約束）。
 *
 * 但退回比機號**不一定就是同一台機器**，故命中還帶一個 confident 旗標，
 * 詳見 pickIdentityMatch。
 *
 * cardType 限定比對範圍（預設空壓機卡），避免把空壓機的維護列附加到過濾卡上；
 * 拍照辨識分流（#158）產出兩張草稿卡時，兩張各自以自己的卡別比對。
 *
 * 一次把該客戶的未封存卡撈回本地比對（一個客戶的機台是個位數～十幾台），
 * 正規化規則才能與 0018 的 lower(btrim(...)) 索引完全一致，不必煩惱 ilike 的跳脫。
 */
export async function findMachine(input: {
  customerId: string;
  machineNo?: string | null;
  serialNo?: string | null;
  cardType?: MxCardType;
}): Promise<MachineIdentityHit | null> {
  const tag = normalizeMachineNo(input.machineNo);
  const serial = normalizeSerial(input.serialNo);
  if (!input.customerId || (!tag && !serial)) return null;

  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("mx_machines")
    .select(IDENTITY_SELECT)
    .is("archived_at", null)
    .eq("customer_id", input.customerId)
    .eq("card_type", input.cardType ?? "compressor");
  if (error) throw new Error(`查詢機台失敗：${error.message}`);

  const rows = (data ?? []) as IdentityRow[];
  const hit = pickIdentityMatch(
    rows,
    tag,
    serial,
    input.cardType ?? "compressor",
  );
  return hit ? toIdentityHit(hit.row, hit.confident) : null;
}

/** pickIdentityMatch 的結果：命中的列 + 這個命中能不能當成「確定是同一台」。 */
interface IdentityMatch {
  row: IdentityRow;
  confident: boolean;
}

/**
 * findMachine 的本地比對規則（拆出來純函式化，好推理也好單測）。
 * tag / serial 皆為正規化後的字串，空字串代表「這一段沒有」。
 *
 * 「比不到」與「比錯」的代價不對稱：比不到只是多開一張重複卡（看得見、刪得掉），
 * 比錯是把維護列靜靜接到同客戶的另一台機器上（看不出來）。因此凡是資料上分辨
 * 不出的情況，一律照樣回傳候選但標成 confident=false，由核對畫面顯示警告、
 * 附加預設關閉，讓看得到照片的人決定。
 *
 * 關鍵不對稱：**空壓機的機號是原廠序號，同一客戶不會有第二台同機號的機器；
 * 過濾卡的「機號」其實是過濾器型號（AD480），同一客戶可以有兩台**（這正是 #165
 * 驗收條件之一）。所以「只比到機號」這件事，在空壓機卡上是確定，在過濾卡上不是。
 */
function pickIdentityMatch(
  rows: IdentityRow[],
  tag: string,
  serial: string,
  cardType: MxCardType,
): IdentityMatch | null {
  // 代號在同一客戶內唯一（0018 的 mx_machines_customer_tag_key）→ 命中即確定。
  if (tag) {
    const byTag = rows.find((m) => normalizeMachineNo(m.machine_no) === tag);
    if (byTag) return { row: byTag, confident: true };
  }
  if (!serial) return null;
  const sameSerial = rows.filter(
    (m) => normalizeSerial(m.serial_no) === serial,
  );
  // 沒有代號的卡＝0018 的 mx_machines_customer_serial_key 作用範圍，同機號至多一張。
  const untagged = sameSerial.find(
    (m) => normalizeMachineNo(m.machine_no) === "",
  );
  // 機號本身足以指認一台機器嗎？空壓機的原廠序號可以，過濾卡的型號不行。
  const serialIdentifies = cardType !== "filter";

  if (tag) {
    // 照片有代號，但這個客戶沒有這個代號的卡 → 只可能比到「還沒補上代號」的既有卡。
    // 有代號的卡一律不碰：那是明確標成另一台機器的卡。
    if (!untagged) return null;
    // 空壓機：同機號就是同一台，補代號而已 → 確定。
    // 過濾卡：這張沒代號的 AD480 可能是照片這台（只是還沒補代號），也可能是同客戶
    // 的另一台 AD480（＝#165 驗收裡「兩台 AD480 靠 A機／B機 區分」的過渡狀態，
    // 此時另一台還沒建卡）。資料上分不出來 → 不確定。
    return { row: untagged, confident: serialIdentifies };
  }

  // 照片沒有代號：優先挑同樣沒有代號的那張（0018 保證同機號至多一張）。
  //
  // 但「照片沒讀到代號」不等於「這台機器沒有代號」—— 代號常是手寫在卡邊的，漏讀是
  // 常態（下一段之所以要 sameSerial.length === 1 就是承認這件事）。因此過濾卡若同機號
  // 底下**還有別張有代號的卡**，就等於資料已明說「這個客戶有兩台以上同型機」，此時挑
  // 沒代號的那張同樣是擲骰子（只是骰子偏心），不可預設附加：照片可能正是那台 B機，
  // 而 B機 的維護列一旦接到沒代號的那張卡上，卡面完全看不出來。
  // 空壓機不受影響：機號是原廠序號，同機號本來就是同一台，多張只是重複建卡。
  if (untagged)
    return {
      row: untagged,
      confident: serialIdentifies || sameSerial.length === 1,
    };
  // 只剩「有代號」的卡可挑。剛好一張時當候選還算合理；兩張以上（同客戶兩台 AD480，
  // 一張 A機 一張 B機）取第一張純粹是擲骰子，絕不可預設附加。
  const first = sameSerial[0];
  if (!first) return null;
  return {
    row: first,
    confident: serialIdentifies && sameSerial.length === 1,
  };
}

/**
 * 同一客戶內是否已有相同機台代號的卡（衝突預檢）。
 * **不分卡別** —— 0018 的 mx_machines_customer_tag_key 也沒有分，
 * 同一客戶的空壓機卡與過濾卡不能共用一個代號。
 * excludeMachineId 用於編輯既有卡時排除自己。
 */
export async function findMachineByTag(
  customerId: string,
  machineNo: string | null | undefined,
  excludeMachineId?: string,
): Promise<MachineIdentityHit | null> {
  const tag = normalizeMachineNo(machineNo);
  if (!customerId || !tag) return null;
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("mx_machines")
    .select(IDENTITY_SELECT)
    .is("archived_at", null)
    .eq("customer_id", customerId);
  if (error) throw new Error(`查詢機台代號失敗：${error.message}`);
  const hit = (data ?? [])
    .map((row) => row as IdentityRow)
    .find(
      (m) =>
        normalizeMachineNo(m.machine_no) === tag && m.id !== excludeMachineId,
    );
  // 代號在同一客戶內唯一，命中就是確定的同一張卡。
  return hit ? toIdentityHit(hit, true) : null;
}

/**
 * 跨客戶找**機號**相同的卡。
 *
 * **只用於「辨識出來的客戶對不上任何既有客戶」時的提示**：這種情況下不能自動比對
 * （硬比就會把 B 客戶的維護列寫到 A 客戶的「AD480」卡上），但完全不提示又會讓員工
 * 重複建卡。故回傳一張「其他客戶的同機號卡」，由 UI 顯示警告、預設不附加。
 *
 * 刻意**不比機台代號**：代號是客戶內部稱呼，「A機」「1號機」跨客戶本來就必然重複
 * （這正是 #165 的前提）。拿代號跨客戶比等於隨機挑一家有 A機 的客戶當提示 —— 提示
 * 幾乎必為誤報，員工照著勾「附加」就會把維護列寫進毫不相干的客戶卡裡。
 *
 * ⚠️ 同理，**過濾卡的提示用途也不該呼叫這支**：過濾卡的「機號」是過濾器型號
 * （AD480／100HA），跨客戶命中只代表「有另一家客戶也買了同款乾燥機」，零資訊量。
 * 拍照辨識端（actions.matchCard）因此只在空壓機卡上叫它。這支本身仍收 cardType，
 * 是為了「查所有在用 AD480 的客戶」這類**明確要跨客戶**的查詢保留彈性。
 */
export async function findMachineAcrossCustomers(input: {
  serialNo?: string | null;
  cardType?: MxCardType;
}): Promise<MachineIdentityHit | null> {
  const serial = normalizeSerial(input.serialNo);
  if (!serial) return null;

  const supabase = await getServerSupabase();
  // 先以 ilike 粗篩（走 0018 的 mx_machines_serial_lookup_idx），再在本地以
  // 正規化結果精確比對；粗篩必然是超集，故不會誤報。
  const { data, error } = await supabase
    .from("mx_machines")
    .select(IDENTITY_SELECT)
    .is("archived_at", null)
    .eq("card_type", input.cardType ?? "compressor")
    .ilike("serial_no", serial)
    .limit(20);
  if (error) throw new Error(`查詢機號失敗：${error.message}`);
  const hit = (data ?? [])
    .map((row) => row as IdentityRow)
    .find((m) => normalizeSerial(m.serial_no) === serial);
  // 跨客戶的命中永遠只是提示，不是「確定是同一台」——它明擺著屬於別的客戶。
  return hit ? toIdentityHit(hit, false) : null;
}

// ── 客戶主檔（0016）─────────────────────────────────────────────

/** 客戶 + 使用中機台數 + 最後保養日（客戶列表用）。 */
export interface MxCustomerListItem extends MxCustomer {
  /** 使用中（未封存）機台數；封存卡不計入。 */
  machine_count: number;
  /** 名下所有機台（含封存）中最新的一筆保養日。 */
  last_service_date: string | null;
}

/**
 * 客戶名下的機台 + 最後保養日。
 * card_type 由 #155（過濾系統卡）加在 MxMachine 上，這裡直接繼承；
 * 查詢以 select("*") 取回，欄位由 0015 保證存在。
 */
export interface MxCustomerMachine extends MxMachine {
  last_service_date: string | null;
}

/** 客戶列表：含使用中機台數與最後保養日，依客戶編號排序。 */
export async function listCustomers(): Promise<MxCustomerListItem[]> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("mx_customers")
    .select("*, mx_machines(archived_at, mx_records(service_date))")
    .order("code", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });
  if (error) throw new Error(`讀取客戶失敗：${error.message}`);

  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const machines =
      (r.mx_machines as {
        archived_at: string | null;
        mx_records: { service_date: string | null }[] | null;
      }[]) ?? [];
    // mx_machines 已於上方取出計算，此處僅需從 customer 物件中排除掉。
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { mx_machines, ...customer } = r;
    return {
      ...(customer as unknown as MxCustomer),
      machine_count: machines.filter((m) => !m.archived_at).length,
      last_service_date: lastServiceDate(
        machines.flatMap((m) => m.mx_records ?? []),
      ),
    };
  });
}

/**
 * 客戶詳情：客戶完整資料 + 名下所有機台（使用中 / 已封存分區）。
 * 找不到客戶回 null（頁面轉 notFound）。
 */
export async function getCustomer(id: string): Promise<{
  customer: MxCustomer;
  active: MxCustomerMachine[];
  archived: MxCustomerMachine[];
} | null> {
  const supabase = await getServerSupabase();
  const { data: customer, error } = await supabase
    .from("mx_customers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`讀取客戶失敗：${error.message}`);
  if (!customer) return null;

  const { data: machines, error: mErr } = await supabase
    .from("mx_machines")
    .select("*, mx_records(service_date)")
    .eq("customer_id", id)
    .order("created_at", { ascending: false });
  if (mErr) throw new Error(`讀取客戶機台失敗：${mErr.message}`);

  const mapped: MxCustomerMachine[] = (machines ?? []).map((row) => {
    const m = row as Record<string, unknown>;
    // mx_records 已於上方取出計算 last，此處僅需從 machine 物件中排除掉。
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { mx_records, ...machine } = m;
    return {
      ...(machine as unknown as MxMachine),
      last_service_date: lastServiceDate(
        m.mx_records as { service_date: string | null }[] | undefined,
      ),
    };
  });

  return {
    customer: customer as MxCustomer,
    active: mapped.filter((m) => !m.archived_at),
    archived: mapped.filter((m) => !!m.archived_at),
  };
}

/**
 * 客戶編號是否已被「其他」客戶使用（正規化後比對）。
 * 供儲存時的軟性重複提示——0013 刻意不設唯一約束，故這裡只提示不擋。
 */
export async function isCustomerCodeTaken(
  code: string,
  excludeCustomerId: string,
): Promise<boolean> {
  const norm = normalizeCustomerCode(code);
  if (!norm) return false;
  const supabase = await getServerSupabase();
  // 先以「包含」粗篩，再用 normalizeCustomerCode（lower + trim）精確比對：
  //   * 粗篩用 %norm% 而非 eq/ilike 精確值——0013 由 card_no best-effort 回填的 code
  //     可能前後帶空白，精確比對會漏判（正規化後其實重複，卻不出提示）。
  //   * 粗篩必然是超集，最終仍以正規化結果判定，故不會誤報；norm 內若含 % / _
  //     被當萬用字元也只是讓超集更大。
  //   * 但反斜線是 LIKE 的預設跳脫字元：未處理時 "a\\b" 會被當成 "ab"，反而比字面
  //     值更「窄」而漏判重複，故先自我跳脫成 "\\\\"。（前後已補 %，不會出現
  //     「pattern 以跳脫字元結尾」的錯誤。）
  const { data, error } = await supabase
    .from("mx_customers")
    .select("id, code")
    .ilike("code", `%${norm.replace(/\\/g, "\\\\")}%`)
    .neq("id", excludeCustomerId);
  if (error) return false; // 純提示用途，查詢失敗不阻擋儲存。
  return (data ?? []).some(
    (c) => normalizeCustomerCode((c as { code: string | null }).code) === norm,
  );
}
