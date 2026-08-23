// 保養卡 DAL — SERVER ONLY。讀寫走登入者 session，靠 mx_* 的 office RLS 擋。
import "server-only";
import { getServerSupabase } from "../supabase-server";
import {
  normalizeSerial,
  normalizeCustomerCode,
} from "./maintenance-normalize";

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
  machine_no: string | null;
  serial_no: string;
  location: string | null;
  purchased_at: string | null; // yyyy-mm-dd
  model: string | null;
  horsepower: string | null;
  voltage: string | null;
  created_at: string;
  archived_at: string | null;
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

export async function listMachines(): Promise<MxMachineListItem[]> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("mx_machines")
    .select("*, mx_customers(name), mx_records(service_date)")
    .is("archived_at", null)
    .order("created_at", { ascending: false });
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
} | null> {
  const supabase = await getServerSupabase();
  const { data: machine, error } = await supabase
    .from("mx_machines")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`讀取保養卡失敗：${error.message}`);
  if (!machine) return null;

  const [{ data: customer }, { data: records }] = await Promise.all([
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
  ]);

  return {
    machine: machine as MxMachine,
    customer: (customer as MxCustomer) ?? EMPTY_CUSTOMER,
    records: (records as MxRecord[]) ?? [],
  };
}

/** 依機號（正規化後）找現有卡；命中回 {id, serial_no, customer_name}，否則 null。 */
export async function findMachineBySerial(
  serial: string,
): Promise<{ id: string; serial_no: string; customer_name: string } | null> {
  const norm = normalizeSerial(serial);
  if (!norm) return null;
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("mx_machines")
    .select("id, serial_no, mx_customers(name)")
    .is("archived_at", null)
    .ilike("serial_no", serial.trim());
  if (error) throw new Error(`查詢機號失敗：${error.message}`);
  const hit = (data ?? []).find(
    (m: { serial_no: string }) => normalizeSerial(m.serial_no) === norm,
  );
  if (!hit) return null;
  const h = hit as {
    id: string;
    serial_no: string;
    mx_customers: { name: string } | { name: string }[] | null;
  };
  const customer = Array.isArray(h.mx_customers)
    ? h.mx_customers[0]
    : h.mx_customers;
  return {
    id: h.id,
    serial_no: h.serial_no,
    customer_name: customer?.name ?? "",
  };
}

// ── 客戶主檔（0016）─────────────────────────────────────────────

/** 客戶 + 使用中機台數 + 最後保養日（客戶列表用）。 */
export interface MxCustomerListItem extends MxCustomer {
  /** 使用中（未封存）機台數；封存卡不計入。 */
  machine_count: number;
  /** 名下所有機台（含封存）中最新的一筆保養日。 */
  last_service_date: string | null;
}

/** 客戶名下的機台 + 最後保養日。 */
export interface MxCustomerMachine extends MxMachine {
  last_service_date: string | null;
  /**
   * 卡別。由 #155（過濾系統卡）新增；欄位尚未落地時為 undefined。
   * 這裡以 select("*") 取回，故 0015 之前也不會因欄位不存在而查詢失敗。
   */
  card_type?: string | null;
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
  const { data, error } = await supabase
    .from("mx_customers")
    .select("id, code")
    .ilike("code", code.trim())
    .neq("id", excludeCustomerId);
  if (error) return false; // 純提示用途，查詢失敗不阻擋儲存。
  return (data ?? []).some(
    (c) => normalizeCustomerCode((c as { code: string | null }).code) === norm,
  );
}
