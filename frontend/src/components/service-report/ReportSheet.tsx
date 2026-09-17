// 機台維護報告單（A4 直式）— 預覽與列印共用的純呈現元件（server / client 皆可用）。
// 版面比照紙本（spec §5.2）；幾何見 ./sheet-layout.ts（高度預算註解在該檔）。
import type { JSX, ReactNode } from "react";
import {
  CHECK_STATUS_LABELS,
  FILTER_CONSUMABLE_LABELS,
  MACHINE_STATE_LABELS,
  SERVICE_ITEM_LABELS,
  SUGGESTION_LABELS,
  TIME_SLOT_LABELS,
  type CheckStatus,
  type FilterConsumable,
  type MachineState,
  type ServiceItem,
  type ServiceReportSheetData,
  type Suggestion,
  type TimeSlot,
} from "@/lib/service-report/types";
import styles from "./ReportSheet.module.css";
import {
  COLUMNS_MM,
  CONTENT_HEIGHT_MM,
  CONTENT_WIDTH_MM,
  HEADER_TITLE_MM,
  HEADER_TOP_MM,
  PARTS_ROW_MM,
  ROW_MM,
  SAFE_MARGIN_MM,
  SECTION_HEIGHTS_MM,
  SUMMARY_LINE_MM,
  SUMMARY_PAD_MM,
  TITLE_ROW_MM,
  checkGlyph,
  gridTracks,
  rocShortDate,
  sheetTransform,
  splitParts,
  u,
  type SheetCalibration,
} from "./sheet-layout";

export interface ReportSheetProps {
  /** 報告單資料；空白表單用 emptySheetData()。 */
  data: ServiceReportSheetData;
  /** preview：寬度隨容器（cqw）縮放；print：實體 210×297mm。 */
  mode: "preview" | "print";
  /** 列印校正（內層 translate + scale；外層 sheet 固定 210×297 並裁切）。 */
  calibration?: SheetCalibration;
  logoUrl?: string | null;
  className?: string;
}

const COMPANY = {
  name: "勁賀空壓科技有限公司",
  en: "Jin He Air Compressor Technology Co., Ltd.",
  tel: "TEL : 02-2675-9977　FAX : 02-2675-9955",
  service: "服務電話02-2675-9977",
} as const;

const COPIES = [
  "第一聯:簽回聯(白)",
  "第二聯:存根聯(藍)",
  "第三聯:會計聯(紅)",
  "第四聯:客戶收執聯(黃)",
] as const;

const TIME_SLOTS: TimeSlot[] = ["morning", "noon", "afternoon"];
const MACHINE_STATES: MachineState[] = ["running", "standby"];
const CHECK_STATUSES: CheckStatus[] = ["normal", "abnormal"];
const FILTER_OPTIONS: FilterConsumable[] = [
  "usable",
  "replace",
  "none",
  "suggest_install",
];
/** 服務項目在紙本上分 3 行排列。 */
const SERVICE_ITEM_LINES: ServiceItem[][] = [
  ["new_trial", "routine"],
  ["periodic"],
  ["repair", "other"],
];
const SUGGESTIONS: Suggestion[] = ["transmission", "motor", "rotor"];

function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

function text(v: string | null | undefined): string {
  return v ?? "";
}

function Grid({
  cols,
  rows,
  children,
}: {
  cols: readonly number[];
  rows: readonly number[];
  children: ReactNode;
}) {
  return (
    <div
      className={styles.grid}
      style={{
        gridTemplateColumns: gridTracks(cols),
        gridTemplateRows: gridTracks(rows),
      }}
    >
      {children}
    </div>
  );
}

function Label({ children, span }: { children: ReactNode; span?: number }) {
  return (
    <div
      className={cx(styles.cell, styles.center)}
      style={span ? { gridRow: `span ${span}` } : undefined}
    >
      <span className={styles.label}>{children}</span>
    </div>
  );
}

function Value({ value }: { value: string | null | undefined }) {
  const v = text(value);
  return (
    <div className={styles.cell}>
      <span className={styles.value} title={v || undefined}>
        {v}
      </span>
    </div>
  );
}

function Options<K extends string>({
  keys,
  labels,
  isSelected,
}: {
  keys: readonly K[];
  labels: Record<K, string>;
  isSelected: (k: K) => boolean;
}) {
  return (
    <span className={styles.opts}>
      {keys.map((k) => {
        const on = isSelected(k);
        return (
          <span key={k} className={on ? styles.optOn : styles.opt}>
            {checkGlyph(on)}
            {labels[k]}
          </span>
        );
      })}
    </span>
  );
}

function OptionsCell<K extends string>(props: {
  keys: readonly K[];
  labels: Record<K, string>;
  isSelected: (k: K) => boolean;
}) {
  return (
    <div className={styles.cell}>
      <Options {...props} />
    </div>
  );
}

function StatusCell({ value }: { value: CheckStatus | null | undefined }) {
  return (
    <OptionsCell
      keys={CHECK_STATUSES}
      labels={CHECK_STATUS_LABELS}
      isSelected={(k) => k === value}
    />
  );
}

export function ReportSheet({
  data,
  mode,
  calibration,
  logoUrl,
  className,
}: ReportSheetProps): JSX.Element {
  const compressor = data.results?.compressor ?? {};
  const dryer = data.results?.dryer ?? {};
  const filter = data.results?.filter_consumable;
  const serviceItems = data.service_items ?? [];
  const suggestions = data.suggestions ?? [];
  const partRows = splitParts(data.parts);
  const transform = sheetTransform(calibration);

  return (
    <div
      className={cx(
        mode === "print" ? styles.print : styles.preview,
        className,
      )}
    >
      <div
        className={styles.sheet}
        role="document"
        aria-label={`機台維護報告單 ${text(data.report_no)}`.trim()}
      >
        <div className={styles.layer} style={transform ? { transform } : {}}>
          <div
            className={styles.content}
            style={{
              left: u(SAFE_MARGIN_MM.left),
              top: u(SAFE_MARGIN_MM.top),
              width: u(CONTENT_WIDTH_MM),
              height: u(CONTENT_HEIGHT_MM),
            }}
          >
            {/* 1. 表頭 */}
            <header
              className={styles.header}
              style={{
                height: u(SECTION_HEIGHTS_MM.header),
                gridTemplateColumns: gridTracks(COLUMNS_MM.header),
                gridTemplateRows: gridTracks([HEADER_TOP_MM, HEADER_TITLE_MM]),
              }}
            >
              <div className={styles.headerCode}>{text(data.header_code)}</div>
              <div className={styles.brand}>
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 列印直接用原圖（可能為 Supabase Storage URL）。
                  <img src={logoUrl} alt="JIN HE" className={styles.logo} />
                ) : (
                  <span className={styles.logoMark}>JIN HE</span>
                )}
                <div className={styles.company}>
                  <span className={styles.companyName}>{COMPANY.name}</span>
                  <span className={styles.companyEn}>{COMPANY.en}</span>
                  <span className={styles.companyTel}>{COMPANY.tel}</span>
                </div>
              </div>
              <div />
              <h1 className={styles.title}>機台維護報告單</h1>
            </header>

            <div className={styles.form}>
              {/* 2. 維護日期｜派工單號 */}
              <Grid cols={COLUMNS_MM.info} rows={[ROW_MM]}>
                <Label>維護日期</Label>
                <div className={styles.cell}>
                  <span className={styles.dateLine}>
                    <span className={styles.dateValue}>
                      {rocShortDate(data.report_date)}
                    </span>
                    <Options
                      keys={TIME_SLOTS}
                      labels={TIME_SLOT_LABELS}
                      isSelected={(k) => k === data.time_slot}
                    />
                  </span>
                </div>
                <Label>派工單號</Label>
                <Value value={data.report_no} />
              </Grid>

              {/* 3. 客戶 */}
              <Grid cols={COLUMNS_MM.info} rows={[ROW_MM, ROW_MM]}>
                <Label>客戶名稱</Label>
                <Value value={data.customer_name} />
                <Label>電話</Label>
                <Value value={data.phone} />
                <Label>統一編號</Label>
                <Value value={data.tax_id} />
                <Label>聯絡人</Label>
                <Value value={data.contact} />
              </Grid>
              <Grid cols={COLUMNS_MM.address} rows={[ROW_MM]}>
                <Label>地址</Label>
                <Value value={data.address} />
              </Grid>

              {/* 4. 服務項目｜設備 */}
              <Grid
                cols={COLUMNS_MM.serviceOuter}
                rows={[ROW_MM, ROW_MM, ROW_MM]}
              >
                <Label span={3}>服務項目</Label>
                <div
                  className={cx(styles.cell, styles.stack)}
                  style={{ gridRow: "span 3" }}
                >
                  {SERVICE_ITEM_LINES.map((line) => (
                    <Options
                      key={line.join("-")}
                      keys={line}
                      labels={SERVICE_ITEM_LABELS}
                      isSelected={(k) => serviceItems.includes(k)}
                    />
                  ))}
                </div>
                <Grid cols={COLUMNS_MM.equip1} rows={[ROW_MM]}>
                  <Label>設備</Label>
                  <Value value={data.equipment} />
                </Grid>
                <Grid cols={COLUMNS_MM.equip2} rows={[ROW_MM]}>
                  <Label>型號</Label>
                  <Value value={data.model} />
                  <Label>電壓</Label>
                  <Value value={data.voltage} />
                </Grid>
                <Grid cols={COLUMNS_MM.equip3} rows={[ROW_MM]}>
                  <Label>編號</Label>
                  <Value value={data.serial_no} />
                  <Label>狀態</Label>
                  <OptionsCell
                    keys={MACHINE_STATES}
                    labels={MACHINE_STATE_LABELS}
                    isSelected={(k) => k === data.machine_state}
                  />
                </Grid>
              </Grid>

              {/* 5. 修護記要及建議 */}
              <Grid
                cols={[CONTENT_WIDTH_MM]}
                rows={[TITLE_ROW_MM, SECTION_HEIGHTS_MM.summary - TITLE_ROW_MM]}
              >
                <div className={styles.cell}>
                  <span className={styles.sectionTitle}>修護記要及建議</span>
                </div>
                <div
                  className={styles.cell}
                  style={{
                    alignItems: "flex-start",
                    paddingTop: u(SUMMARY_PAD_MM),
                    paddingBottom: u(SUMMARY_PAD_MM),
                  }}
                >
                  <div
                    className={styles.summaryBody}
                    style={{
                      lineHeight: u(SUMMARY_LINE_MM),
                      maxHeight: u(
                        SECTION_HEIGHTS_MM.summary -
                          TITLE_ROW_MM -
                          SUMMARY_PAD_MM * 2,
                      ),
                    }}
                  >
                    {text(data.summary)}
                  </div>
                </div>
              </Grid>

              {/* 6. 空壓機檢查 */}
              <Grid cols={[CONTENT_WIDTH_MM]} rows={[TITLE_ROW_MM]}>
                <div className={styles.cell}>
                  <span className={styles.sectionTitle}>空壓機檢查</span>
                </div>
              </Grid>
              <Grid cols={COLUMNS_MM.check} rows={[ROW_MM, ROW_MM, ROW_MM]}>
                <Label>運轉時數</Label>
                <Value value={compressor.run_hours} />
                <Label>設定壓力</Label>
                <Value value={compressor.set_pressure} />
                <Label>空壓機風扇</Label>
                <StatusCell value={compressor.fan} />

                <Label>耗材時數</Label>
                <Value value={compressor.consumable_hours} />
                <Label>運轉溫度</Label>
                <Value value={compressor.temperature} />
                <Label>變頻器風扇</Label>
                <StatusCell value={compressor.inverter_fan} />

                <Label>運轉頻率</Label>
                <Value value={compressor.frequency} />
                <Label>運轉電流</Label>
                <Value value={compressor.current} />
                <Label>變頻器參數</Label>
                <StatusCell value={compressor.inverter_params} />
              </Grid>

              {/* 7. 乾燥機檢查 */}
              <Grid cols={[CONTENT_WIDTH_MM]} rows={[TITLE_ROW_MM]}>
                <div className={styles.cell}>
                  <span className={styles.sectionTitle}>乾燥機檢查</span>
                </div>
              </Grid>
              <Grid cols={COLUMNS_MM.check} rows={[ROW_MM, ROW_MM]}>
                <Label>總時數(節能型)</Label>
                <Value value={dryer.total_hours} />
                <Label>冷媒高壓</Label>
                <StatusCell value={dryer.refrigerant_high} />
                <Label>散熱風扇運轉狀況</Label>
                <StatusCell value={dryer.cooling_fan} />

                <Label>節能率(節能型)</Label>
                <Value value={dryer.saving_rate} />
                <Label>冷媒低壓</Label>
                <StatusCell value={dryer.refrigerant_low} />
                <Label>自動排水器功能</Label>
                <StatusCell value={dryer.auto_drain} />
              </Grid>

              {/* 8. 過濾耗材｜貯氣桶排水功能 */}
              <Grid cols={COLUMNS_MM.filter} rows={[ROW_MM]}>
                <Label>過濾耗材</Label>
                <OptionsCell
                  keys={FILTER_OPTIONS}
                  labels={FILTER_CONSUMABLE_LABELS}
                  isSelected={(k) => k === filter}
                />
                <Label>貯氣桶排水功能</Label>
                <StatusCell value={dryer.tank_drain} />
              </Grid>

              {/* 9. 更換料件編號及數量 */}
              <Grid
                cols={COLUMNS_MM.parts}
                rows={[
                  TITLE_ROW_MM,
                  TITLE_ROW_MM,
                  ...partRows.map(() => PARTS_ROW_MM),
                ]}
              >
                <div
                  className={cx(styles.cell, styles.center)}
                  style={{ gridColumn: "1 / -1" }}
                >
                  <span className={styles.sectionTitle}>
                    更換料件編號及數量
                  </span>
                </div>
                {[0, 1].map((side) => (
                  <PartsHead key={side} />
                ))}
                {partRows
                  .flatMap(({ left, right }) => [left, right])
                  .map((p) => (
                    <PartCells key={p.no} no={p.no} name={p.name} qty={p.qty} />
                  ))}
              </Grid>

              {/* 10. 建議事項｜維護人員簽名｜客戶簽名 */}
              <Grid cols={COLUMNS_MM.sign} rows={[SECTION_HEIGHTS_MM.sign]}>
                <div className={cx(styles.cell, styles.stack)}>
                  <span className={styles.label}>建議事項</span>
                  {SUGGESTIONS.map((k) => (
                    <Options
                      key={k}
                      keys={[k]}
                      labels={SUGGESTION_LABELS}
                      isSelected={(s) => suggestions.includes(s)}
                    />
                  ))}
                </div>
                <div className={cx(styles.cell, styles.signCell)}>
                  <span className={styles.label}>維護人員簽名</span>
                  <span className={styles.signValue}>
                    {text(data.technician)}
                  </span>
                </div>
                <div className={cx(styles.cell, styles.signCell)}>
                  <span className={styles.label}>客戶簽名</span>
                  <span className={styles.signValue}>
                    {text(data.customer_signer)}
                  </span>
                </div>
              </Grid>
            </div>

            {/* 11. 聯單說明、服務電話 */}
            <footer
              className={styles.footer}
              style={{
                marginTop: u(SECTION_HEIGHTS_MM.gap),
                height: u(SECTION_HEIGHTS_MM.footer),
              }}
            >
              <span className={styles.copies}>
                {COPIES.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </span>
              <span>{COMPANY.service}</span>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}

function PartsHead() {
  return (
    <>
      <Label>編號</Label>
      <Label>貨品名稱</Label>
      <Label>數量</Label>
    </>
  );
}

function PartCells({
  no,
  name,
  qty,
}: {
  no: number;
  name: string;
  qty: string;
}) {
  return (
    <>
      <div className={cx(styles.cell, styles.center)}>
        <span className={styles.value} style={{ flex: "none" }}>
          {no}
        </span>
      </div>
      <Value value={name} />
      <div className={cx(styles.cell, styles.center)}>
        <span className={styles.value} style={{ flex: "none" }}>
          {qty}
        </span>
      </div>
    </>
  );
}
