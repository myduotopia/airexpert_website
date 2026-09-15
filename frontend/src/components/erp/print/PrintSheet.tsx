// 列印頁共用版面（server components）：外框 + 工具列、A4 單頁（公司抬頭 / 單據名稱 / 頁次 / 浮水印）、
// 客戶廠商資料格、簽名欄。樣式見 PrintStyles。
import type { ReactNode } from "react";
import { COMPANY_INFO } from "@/lib/erp/print";
import { PrintToolbar } from "./PrintToolbar";

export function PrintShell({
  title,
  backHref,
  children,
}: {
  title: string;
  backHref: string;
  children: ReactNode;
}) {
  return (
    <div className="erp-print-body">
      <PrintToolbar title={title} backHref={backHref} />
      {children}
    </div>
  );
}

export function PrintMessage({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="erp-print-message">
      {children}
    </div>
  );
}

export interface MetaField {
  label: string;
  value: ReactNode;
}

export function PrintSheet({
  logoUrl,
  title,
  meta,
  pageNo,
  pageCount,
  watermark,
  children,
}: {
  logoUrl: string;
  title: string;
  meta: MetaField[];
  pageNo: number;
  pageCount: number;
  watermark?: string | null;
  children: ReactNode;
}) {
  return (
    <section className="erp-sheet" aria-label={`第 ${pageNo} 頁`}>
      <header className="erp-head">
        <div className="erp-company">
          {/* eslint-disable-next-line @next/next/no-img-element -- 列印直接用原圖（可能為 Supabase Storage URL）。 */}
          <img src={logoUrl} alt="" className="erp-logo" />
          <div>
            <div className="erp-company-name">{COMPANY_INFO.name}</div>
            <div className="erp-company-contact">
              服務專線 {COMPANY_INFO.phone}　傳真 {COMPANY_INFO.fax}
              {COMPANY_INFO.line}
            </div>
          </div>
        </div>
        <div className="erp-head-right">
          <h1 className="erp-title">{title}</h1>
          <dl className="erp-meta">
            {meta.map((m) => (
              <MetaRow key={m.label} label={m.label} value={m.value} />
            ))}
            <MetaRow label="頁次" value={`${pageNo} / ${pageCount}`} />
          </dl>
        </div>
      </header>
      <div className="erp-sheet-body">{children}</div>
      {watermark && (
        <div className="erp-watermark" aria-hidden="true">
          <span>{watermark}</span>
        </div>
      )}
    </section>
  );
}

function MetaRow({ label, value }: MetaField) {
  return (
    <>
      <dt>{label}：</dt>
      <dd>{value}</dd>
    </>
  );
}

export interface PartyField {
  label: string;
  value: ReactNode;
  /** 獨佔一整列（地址、備註等長欄位）。 */
  wide?: boolean;
}

/**
 * 4 欄資料格（標籤 / 值 / 標籤 / 值）。wide 欄位獨佔一列；
 * 列尾落單的一般欄位也延伸到整列，避免留空格。
 */
export function PartyGrid({ fields }: { fields: PartyField[] }) {
  const cells: ReactNode[] = [];
  let col = 0; // 0 = 列首、1 = 已放一組
  fields.forEach((f, i) => {
    const next = fields[i + 1];
    // wide 欄位必定落在列首：它前面落單的一般欄位已延伸到整列。
    const span =
      f.wide || (col === 0 && (!next || next.wide === true)) || false;
    cells.push(
      <div key={`l${i}`} className="erp-label">
        {f.label}
      </div>,
      <div key={`v${i}`} className={span ? "erp-span3" : undefined}>
        {f.value === null || f.value === undefined || f.value === ""
          ? "　"
          : f.value}
      </div>,
    );
    col = span ? 0 : (col + 1) % 2;
  });
  return <div className="erp-party">{cells}</div>;
}

export function SignatureBoxes({
  labels,
  children,
}: {
  labels: string[];
  children?: ReactNode;
}) {
  return (
    <div className="erp-signs">
      {children}
      {labels.map((label) => (
        <div key={label}>
          <div className="erp-sign-label">{label}</div>
        </div>
      ))}
    </div>
  );
}
