// 提醒事項（#274）：從廠商備註／付款條件解析「固定日期的到期事項」。純函式，client / server 皆可用。
//
// 支援的寫法（全形數字、中文數字「十、二十、廿五、三十一」皆可）：
//   每月：「每月10號匯款」「每月10日付款」「每個月 10 號要匯款」「每月5、20號請款」（拆成兩條）
//         「每月5號對帳，20號請款」（同一段內「每月」之後的日期都算每月）「匯款日：每月15號」
//   月底：「月底匯款」「每月月底對帳」「每月底請款」「每個月最後一天付款」
//   每週：「每週三送貨」「每周五」「每星期一」「每禮拜二」「每週日」「每週一、四叫貨」「每週二及週五」
//   每年：「每年3月15日繳款」「每年十二月二十五號」「每年 2/29」
// 刻意不解析（列入「待確認」，由人工建立）：
//   付款條件「月結30天」「票期60日」「收貨後7日內」——這是天數，不是固定日，先整段遮掉不參與判斷；
//   範圍「每月1號至10號」「每週一至週五」、頻率「每週一次」、相對月份「次月10號」「次月底」、
//   沒有「每月」的單一日期「10號匯款」、「月初」「每季」等。
// 地址與帳號：備註中「【匯款帳號】」「【送貨地址】」等欄整行略過；一般文字中「路／段／巷… 10號」不視為日期。
//
// 備註格式（#273 匯入）：每行「【欄名】內容」，儲存格內的多行以「 / 」合成一行（解析時視同換行）。
// 沒有【欄名】的行沿用上一欄；上一欄是略過欄時，該行不產生規則，疑似日期者列入待確認。
// 每行再以句號、分號分段；同一段內的日期共用前後文來抽事項標題（「匯款」「付款」「請款」「對帳」…，
// 抽不出就用「到期事項」）。規則依「週期＋標題」去重（ruleKey），與原文寫法無關，
// 備註改寫但意思相同時仍是同一條（同步時據此比對既有的 auto 規則）。

export type ParsedRuleKind = "monthly" | "weekly" | "yearly";

export interface ParsedReminderRule {
  /** 規則識別鍵（ruleKey）：週期＋標題。存進 erp_reminder_rules.auto_key。 */
  key: string;
  title: string;
  kind: ParsedRuleKind;
  /** monthly：1–31 或 -1（月底）；yearly：1–31。 */
  dayOfMonth: number | null;
  /** weekly：0（日）–6（六）。 */
  weekday: number | null;
  /** yearly：1–12。 */
  month: number | null;
  /** 來源原文（該段文字；付款條件前加「付款條件：」）。 */
  sourceText: string;
}

export interface ParseResult {
  rules: ParsedReminderRule[];
  /** 疑似日期但無法解析的片段（原文，去重、依出現順序）。 */
  unparsed: string[];
}

/** 預設事項標題（抽不出關鍵字時）。 */
export const DEFAULT_REMINDER_TITLE = "到期事項";

/** 原文片段最長保留字數。 */
const SOURCE_TEXT_MAX = 200;

// ── 中文數字 ─────────────────────────────────────────────────

const CN_DIGIT: Record<string, number> = {
  一: 1,
  二: 2,
  兩: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

/** 「5」「十」「十五」「二十」「廿五」「卅一」「三十一」→ 整數；無法辨識 → null。只處理 1–39。 */
export function cnNumberToInt(s: string): number | null {
  const t = s.trim();
  if (/^\d+$/.test(t)) return Number(t);
  if (t === "") return null;
  if (t[0] === "廿" || t[0] === "卅") {
    const base = t[0] === "廿" ? 20 : 30;
    const rest = t.slice(1);
    if (rest === "") return base;
    return rest.length === 1 && CN_DIGIT[rest] ? base + CN_DIGIT[rest] : null;
  }
  const m = /^([一二兩三四五六七八九])?十([一二三四五六七八九])?$/.exec(t);
  if (m) return (m[1] ? CN_DIGIT[m[1]] : 1) * 10 + (m[2] ? CN_DIGIT[m[2]] : 0);
  if (t.length === 1 && CN_DIGIT[t]) return CN_DIGIT[t];
  return null;
}

// ── 規則識別鍵 ───────────────────────────────────────────────

/** 規則識別鍵：每月 m:10:匯款、月底 m:-1:對帳、每週 w:3:送貨、每年 y:3-15:繳款。 */
export function ruleKey(r: {
  kind: ParsedRuleKind;
  dayOfMonth?: number | null;
  weekday?: number | null;
  month?: number | null;
  title: string;
}): string {
  const title = r.title.trim();
  if (r.kind === "monthly") return `m:${r.dayOfMonth}:${title}`;
  if (r.kind === "weekly") return `w:${r.weekday}:${title}`;
  return `y:${r.month}-${r.dayOfMonth}:${title}`;
}

// ── 事項標題 ─────────────────────────────────────────────────

// 依序比對；同一段前後文中取離日期最近的一個。
const TITLE_PATTERNS: [RegExp, string][] = [
  [/匯款|電匯|匯錢/, "匯款"],
  [/轉帳/, "轉帳"],
  [/請款/, "請款"],
  [/對帳/, "對帳"],
  [/結帳|結算/, "結帳"],
  [/收款|收帳/, "收款"],
  [/付款|付清|支付|給付|付帳|付錢/, "付款"],
  [/繳款|繳費/, "繳款"],
  [/扣款/, "扣款"],
  [/開支票|開票/, "開票"],
  [/寄票|送票/, "寄票"],
  [/發票/, "發票"],
  [/叫貨|訂貨/, "叫貨"],
  [/送貨|出貨/, "送貨"],
  [/盤點/, "盤點"],
  [/保養/, "保養"],
  [/報稅|繳稅/, "報稅"],
];
const TITLE_ANY = new RegExp(
  TITLE_PATTERNS.map(([re]) => re.source).join("|"),
  "g",
);

function titleOf(word: string): string {
  for (const [re, title] of TITLE_PATTERNS) if (re.test(word)) return title;
  return DEFAULT_REMINDER_TITLE;
}

/** 前後文中的事項標題：after 取第一個（離日期最近）、before 取最後一個。 */
function findTitle(text: string, nearest: "first" | "last"): string | null {
  const hits = [...text.matchAll(TITLE_ANY)];
  if (hits.length === 0) return null;
  return titleOf((nearest === "first" ? hits[0] : hits[hits.length - 1])[0]);
}

// ── 遮罩（付款條件、天數）────────────────────────────────────

/** 以等長空白取代（保持位置對應）。 */
function blank(s: string): string {
  return " ".repeat(s.length);
}

// 「月結30天」「票期60日」「收貨後7日內」「30天期票」「3個工作天」：天數而非固定日。
const TERM_PATTERNS: RegExp[] = [
  /(月結|票期|期票|天期|貨到|到貨|收貨|出貨|發票)[^\d,，、。；;]{0,4}?\d{1,3}\s*(天|日)(內|後)?/g,
  /\d{1,3}\s*(個)?\s*(工作)?\s*天/g,
  /\d{1,3}\s*日\s*(內|期|票)/g,
  /[一二三四五六七八九十]{1,3}\s*日\s*內/g,
];

function maskTerms(s: string): string {
  let w = s;
  for (const re of TERM_PATTERNS) w = w.replace(re, blank);
  return w;
}

// ── 日期 token ───────────────────────────────────────────────

interface Token {
  start: number;
  end: number;
  kind: ParsedRuleKind;
  /** monthly：日（-1 月底）；weekly：星期；yearly：[月, 日]。 */
  values: number[] | [number, number][];
}

const SEP = "[、,，/和及與跟或&+]";
const RANGE_AFTER = /^\s*(至|到|~|～|-|－|—)/;
const RANGE_BEFORE = /(至|到|~|～|-|－|—)\s*$/;
const CN_NUM = "[一二兩三四五六七八九十廿卅]{1,3}";

const WEEKDAY_CHAR: Record<string, number> = {
  日: 0,
  天: 0,
  "7": 0,
  一: 1,
  "1": 1,
  二: 2,
  "2": 2,
  三: 3,
  "3": 3,
  四: 4,
  "4": 4,
  五: 5,
  "5": 5,
  六: 6,
  "6": 6,
};

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function validYearlyDate(month: number, day: number): boolean {
  return (
    month >= 1 && month <= 12 && day >= 1 && day <= DAYS_IN_MONTH[month - 1]
  );
}

const YEARLY_RES: RegExp[] = [
  new RegExp(
    `每\\s*年\\s*(?:的)?\\s*(\\d{1,2}|${CN_NUM})\\s*月\\s*(?:份)?\\s*(\\d{1,2}|${CN_NUM})\\s*[號日]`,
    "g",
  ),
  /每\s*年\s*(?:的)?\s*(\d{1,2})\s*\/\s*(\d{1,2})(?![\d/])/g,
];

const WEEK_ANCHOR = /每\s*個?\s*(?:週|周|星期|禮拜)\s*/g;
const WD = "[一二三四五六日天1-7](?![次天個趟回批小週周\\d])";
const WEEK_SEQ = new RegExp(
  `^${WD}(?:\\s*${SEP}\\s*(?:週|周|星期|禮拜)?\\s*${WD})*`,
);

const MONTH_END_ANCHORED =
  /每\s*個?\s*月\s*(?:的)?\s*(?:月底|底|最後一天|最後1天)/g;
// 單獨的「月底」：前面緊接著相對／特定月份（次月底、本月底、10 月底、十二月底）→ 不是每月，列入待確認。
const MONTH_END_ALONE = /(?<![次隔下上前個本這\d一二三四五六七八九十]\s*)月底/g;
const MONTH_ANCHOR = /每\s*個?\s*月\s*(?:份)?\s*(?:的)?/g;
const DAY_ITEM = new RegExp(
  `(?<![\\d路街巷弄段樓之號\\-./])(\\d{1,2}|${CN_NUM})(?!\\d)\\s*([號日])?`,
  "g",
);
// 不緊接在「每月」之後的日期（「每月5號對帳，20號請款」的 20 號）：其後須緊接事項關鍵字（中間最多 3 個字，
// 例「20號前付款」「20號要請款」），否則可能是型號、倉別、分機（「5號電池」「3號倉」「分機12號」）。
const LATER_DAY_TITLE = new RegExp(
  `^\\s*[^\\d,，、。；;/\\s]{0,3}?(?:${TITLE_ANY.source})`,
);
// 「次月10號」「3月10日」之類：日期前面緊接著「月」→ 不是每月固定日。
const RELATIVE_MONTH_BEFORE = new RegExp(
  `(次|隔|下個?|上個?|本|當|\\d|${CN_NUM})\\s*月\\s*(?:的)?\\s*$`,
);

function overlaps(tokens: Token[], start: number, end: number): boolean {
  return tokens.some((t) => start < t.end && end > t.start);
}

function parseSegmentTokens(w: string): {
  tokens: Token[];
  consumed: [number, number][];
} {
  const tokens: Token[] = [];
  const consumed: [number, number][] = [];
  let work = w;
  const take = (start: number, end: number) => {
    consumed.push([start, end]);
    work =
      work.slice(0, start) + blank(work.slice(start, end)) + work.slice(end);
  };

  // 1) 每年
  for (const re of YEARLY_RES) {
    for (const m of work.matchAll(re)) {
      const month = cnNumberToInt(m[1]);
      const day = cnNumberToInt(m[2]);
      const start = m.index;
      const end = start + m[0].length;
      if (month === null || day === null || !validYearlyDate(month, day)) {
        continue;
      }
      if (RANGE_AFTER.test(work.slice(end))) continue;
      tokens.push({ start, end, kind: "yearly", values: [[month, day]] });
      take(start, end);
    }
  }

  // 2) 每週
  for (const a of [...work.matchAll(WEEK_ANCHOR)]) {
    const seqStart = a.index + a[0].length;
    const m = WEEK_SEQ.exec(work.slice(seqStart));
    if (!m) continue;
    const end = seqStart + m[0].length;
    if (RANGE_AFTER.test(work.slice(end))) continue;
    const days = [...m[0].matchAll(/[一二三四五六日天1-7]/g)].map(
      (x) => WEEKDAY_CHAR[x[0]],
    );
    tokens.push({ start: a.index, end, kind: "weekly", values: days });
    take(a.index, end);
  }

  // 3) 月底（「每月底」「每月月底」「每個月最後一天」、單獨的「月底」；「次月底」等不算）
  for (const re of [MONTH_END_ANCHORED, MONTH_END_ALONE]) {
    for (const m of [...work.matchAll(re)]) {
      const start = m.index;
      const end = start + m[0].length;
      if (RANGE_AFTER.test(work.slice(end))) continue;
      tokens.push({ start, end, kind: "monthly", values: [-1] });
      take(start, end);
    }
  }

  // 4) 每月 N 號：「每月」之後、同一段內的日期（以分隔符相連者為一組，最後一個須帶號／日）
  const anchors = [...work.matchAll(MONTH_ANCHOR)].map((a) => ({
    start: a.index,
    end: a.index + a[0].length,
    used: false,
  }));
  if (anchors.length > 0) {
    const items = [...work.matchAll(DAY_ITEM)]
      .filter((m) => m.index >= anchors[0].end)
      .map((m) => ({
        start: m.index,
        end: m.index + m[0].length,
        value: cnNumberToInt(m[1]),
        suffix: !!m[2],
      }));
    // 以分隔符相連的連續項目為一組
    const groups: (typeof items)[] = [];
    for (const it of items) {
      const last = groups[groups.length - 1];
      const prev = last?.[last.length - 1];
      if (
        prev &&
        new RegExp(`^\\s*${SEP}\\s*$`).test(work.slice(prev.end, it.start))
      ) {
        last.push(it);
      } else {
        groups.push([it]);
      }
    }
    for (const g of groups) {
      const first = g[0];
      const last = g[g.length - 1];
      if (!last.suffix) continue;
      if (g.some((x) => x.value === null || x.value < 1 || x.value > 31)) {
        continue;
      }
      if (RANGE_AFTER.test(work.slice(last.end))) continue;
      const before = work.slice(0, first.start);
      if (RANGE_BEFORE.test(before)) continue;
      // 緊接在「每月」之後可以；其他「…月 10 號」（次月、3 月）不是每月固定日
      const anchor = [...anchors].reverse().find((a) => a.end <= first.start);
      if (!anchor) continue;
      const directlyAfterAnchor = /^\s*$/.test(
        work.slice(anchor.end, first.start),
      );
      if (
        !directlyAfterAnchor &&
        (RELATIVE_MONTH_BEFORE.test(before) ||
          !LATER_DAY_TITLE.test(work.slice(last.end)))
      ) {
        continue;
      }
      if (overlaps(tokens, first.start, last.end)) continue;
      anchor.used = true;
      tokens.push({
        start: first.start,
        end: last.end,
        kind: "monthly",
        values: g.map((x) => x.value as number),
      });
    }
    for (const t of tokens.filter((x) => x.kind === "monthly")) {
      take(t.start, t.end);
    }
    for (const a of anchors) if (a.used) take(a.start, a.end);
  }

  tokens.sort((a, b) => a.start - b.start);
  return { tokens, consumed };
}

// 疑似日期（無法解析時列入待確認）：在「遮掉付款條件、扣掉已解析部分」後的文字上判斷。
const SUSPICIOUS = new RegExp(
  [
    "每\\s*個?\\s*(月|週|周|星期|禮拜|年|季)",
    "月底|月初|月中|次月|隔月|下個?月",
    `(?<![\\d路街巷弄段樓之號\\-./]\\s*)(\\d{1,2}|${CN_NUM})\\s*[號日](?![內機倉線門櫃車館樓店])`,
    "(星期|禮拜|週|周)[一二三四五六日天]",
  ].join("|"),
);

interface SegmentResult {
  rules: Omit<ParsedReminderRule, "key" | "sourceText">[];
  suspicious: boolean;
}

/** 全形英數與符號（U+FF01–FF5E）→ 半形、全形空白 → 空白。逐字對應，長度不變（原文位置可對回）。 */
export function foldWidth(s: string): string {
  return s.replace(/[\uFF01-\uFF5E\u3000]/g, (c) =>
    c === "\u3000" ? " " : String.fromCharCode(c.charCodeAt(0) - 0xfee0),
  );
}

function parseSegment(seg: string): SegmentResult {
  const masked = maskTerms(foldWidth(seg));
  const { tokens, consumed } = parseSegmentTokens(masked);

  // 事項標題：先看日期之後到下一個日期之間，再看之前；都沒有且與相鄰日期只隔分隔符時沿用相鄰的標題。
  const titles: (string | null)[] = tokens.map((t, i) => {
    const after = masked.slice(t.end, tokens[i + 1]?.start ?? masked.length);
    const before = masked.slice(tokens[i - 1]?.end ?? 0, t.start);
    return findTitle(after, "first") ?? findTitle(before, "last");
  });
  const onlySep = new RegExp(`^[\\s${SEP.slice(1, -1)}]*$`);
  for (let i = tokens.length - 2; i >= 0; i--) {
    if (
      titles[i] === null &&
      titles[i + 1] !== null &&
      onlySep.test(masked.slice(tokens[i].end, tokens[i + 1].start))
    ) {
      titles[i] = titles[i + 1];
    }
  }
  for (let i = 1; i < tokens.length; i++) {
    if (
      titles[i] === null &&
      titles[i - 1] !== null &&
      onlySep.test(masked.slice(tokens[i - 1].end, tokens[i].start))
    ) {
      titles[i] = titles[i - 1];
    }
  }

  const rules: SegmentResult["rules"] = [];
  tokens.forEach((t, i) => {
    const title = titles[i] ?? DEFAULT_REMINDER_TITLE;
    if (t.kind === "yearly") {
      for (const [month, day] of t.values as [number, number][]) {
        rules.push({
          kind: "yearly",
          month,
          dayOfMonth: day,
          weekday: null,
          title,
        });
      }
    } else {
      for (const v of t.values as number[]) {
        rules.push(
          t.kind === "weekly"
            ? {
                kind: "weekly",
                weekday: v,
                dayOfMonth: null,
                month: null,
                title,
              }
            : {
                kind: "monthly",
                dayOfMonth: v,
                weekday: null,
                month: null,
                title,
              },
        );
      }
    }
  });

  let rest = masked;
  for (const [s, e] of consumed) {
    rest = rest.slice(0, s) + blank(rest.slice(s, e)) + rest.slice(e);
  }
  return { rules, suspicious: SUSPICIOUS.test(rest) };
}

// ── 進入點 ───────────────────────────────────────────────────

// 這些欄位整欄略過（帳號、地址、電話等含有數字＋「號」，不是日期）。
const SKIP_LABEL = /帳號|帳戶|地址|電話|傳真|手機|email|e-mail|統編|統一編號/i;
const LABEL_LINE = /^\s*【([^】]*)】\s*/;

interface Segment {
  text: string;
  prefix: string;
  /** 只判斷是否疑似日期（列入待確認），不產生規則：略過欄（帳號、地址…）之後沒有【欄名】的續行。 */
  suspiciousOnly: boolean;
}

// #273 匯入把儲存格內的多行以「 / 」（VENDOR_NOTE_LINE_JOINER）合成一行：視同換行，各自為一段，
// 避免「每月」的前後文跨到原本另一行（例「每月25號匯款 / 分機12號」的 12 號）。
const LINE_JOINER = / \/ /;

function segmentsOf(text: string, prefix: string): Segment[] {
  const out: Segment[] = [];
  let label: string | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine;
    const m = LABEL_LINE.exec(line);
    if (m) {
      label = m[1].trim();
      line = line.slice(m[0].length);
    }
    const skipped = label !== null && SKIP_LABEL.test(label);
    // 略過欄本身（【匯款帳號】…）整行不看；其後沒有【欄名】的續行可能是手寫補充（例如在備註最後補一行
    // 「每月20號對帳」），不產生規則，但疑似日期時列入待確認，讓人工確認而不是默默忽略。
    if (skipped && m) continue;
    for (const piece of line.split(LINE_JOINER)) {
      for (const part of piece.split(/[。；;!！?？]/)) {
        const t = part.replace(/\s+/g, " ").trim();
        if (t) out.push({ text: t, prefix, suspiciousOnly: skipped });
      }
    }
  }
  return out;
}

/**
 * 解析廠商備註與付款條件。回傳規則（依出現順序、依 ruleKey 去重，先出現者為準）與待確認片段。
 * 全形英數先轉半形再解析（１０ → 10）；來源原文保留原本的寫法。
 */
export function parseReminderText(
  note: string | null | undefined,
  paymentTerms?: string | null,
): ParseResult {
  const segments = [
    ...segmentsOf(note ?? "", ""),
    ...segmentsOf(paymentTerms ?? "", "付款條件："),
  ];
  const rules: ParsedReminderRule[] = [];
  const seen = new Set<string>();
  const unparsed: string[] = [];
  for (const seg of segments) {
    const r = parseSegment(seg.text);
    const sourceText = `${seg.prefix}${seg.text}`.slice(0, SOURCE_TEXT_MAX);
    if (seg.suspiciousOnly) {
      if (
        (r.rules.length > 0 || r.suspicious) &&
        !unparsed.includes(sourceText)
      ) {
        unparsed.push(sourceText);
      }
      continue;
    }
    for (const rule of r.rules) {
      const key = ruleKey(rule);
      if (seen.has(key)) continue;
      seen.add(key);
      rules.push({ ...rule, key, sourceText });
    }
    if (r.suspicious && !unparsed.includes(sourceText)) {
      unparsed.push(sourceText);
    }
  }
  return { rules, unparsed };
}
