// 保養卡 DAL — SERVER ONLY。讀寫走登入者 session，靠 mx_* 的 office RLS 擋。
import "server-only";
import { getServerSupabase } from "../supabase-server";
import { normalizeSerial } from "./maintenance-normalize";

export interface MxCustomer {
  id: string;
  name: string;
}

export interface MxMachine {
  id: string;
  customer_id: string;
  card_no: string | null;
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
function mapMachineListRow(m: Record<string, unknown>): MxMachineListItem {
  const records = (m.mx_records as { service_date: string | null }[]) ?? [];
  const last =
    records
      .map((r) => r.service_date)
      .filter((d): d is string => !!d)
      .sort()
      .at(-1) ?? null;
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
      .select("id, name")
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
    customer: (customer as MxCustomer) ?? { id: "", name: "（未命名客戶）" },
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
