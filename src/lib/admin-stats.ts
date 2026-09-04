import {
  normalizeOrderStatus,
  parseOrderTotalNum,
  aggregateCustomers,
  isWeirdPhone,
  isMissingAddress,
  type ShopOrder,
  type CustomerAgg,
} from "./orders";

const TZ = "Asia/Ho_Chi_Minh";
const dayMs = 86400000;

/** Parse thời gian đơn từ Sheet (ISO, dd/mm/yyyy, mm/dd/yyyy, serial Excel, tiếng Việt) */
export function parseOrderTime(t: string): Date | null {
  if (!t) return null;
  const s = String(t).trim();
  if (!s) return null;

  // Google Sheets serial date (số ngày từ 1899-12-30)
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n > 20000 && n < 80000) {
      const epoch = Date.UTC(1899, 11, 30);
      const d = new Date(epoch + n * dayMs);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }

  try {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime()) && d.getFullYear() > 2000 && d.getFullYear() < 2100) return d;
  } catch {}

  // dd/mm/yyyy hoặc d/m/yyyy (+ giờ)
  let m = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const day = +m[1];
    const mon = +m[2];
    const year = +m[3];
    // Ưu tiên dd/mm nếu day > 12 hoặc format VN
    if (day > 12 || mon <= 12) {
      const dt = new Date(year, mon - 1, day, +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
      if (!Number.isNaN(dt.getTime())) return dt;
    }
    // fallback mm/dd
    if (mon > 12 && day <= 12) {
      const dt = new Date(year, day - 1, mon, +(m[4] || 0), +(m[5] || 0));
      if (!Number.isNaN(dt.getTime())) return dt;
    }
  }

  // yyyy-mm-dd
  m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const dt = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  return null;
}

export function isNeedCallback(o: ShopOrder) {
  if (normalizeOrderStatus(o.status) !== "Mới") return false;
  const dt = parseOrderTime(o.time);
  return !!dt && Date.now() - dt.getTime() > 30 * 60 * 1000;
}

function dateKey(d: Date) {
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

function pct(a: number, b: number) {
  if (!b) return a ? 100 : 0;
  return Math.round(((a - b) / b) * 100);
}

function aggOrders(orders: ShopOrder[], keys: Set<string>) {
  let count = 0;
  let rev = 0;
  let unparsed = 0;
  for (const o of orders) {
    const dt = parseOrderTime(o.time);
    if (!dt) {
      unparsed++;
      continue;
    }
    if (!keys.has(dateKey(dt))) continue;
    count++;
    rev += parseOrderTotalNum(o.total);
  }
  return { count, rev, aov: count ? rev / count : 0, unparsed };
}

function keysForDays(startOffset: number, numDays: number) {
  const now = new Date();
  const keys = new Set<string>();
  for (let i = 0; i < numDays; i++) {
    keys.add(dateKey(new Date(now.getTime() - (startOffset + i) * dayMs)));
  }
  return keys;
}

/** Tổng quan toàn bộ đơn đã tải (không lọc ngày) — khi parse ngày lỗi vẫn thấy số */
export function computeAllTimeStats(orders: ShopOrder[]) {
  let count = 0;
  let rev = 0;
  let parsed = 0;
  for (const o of orders) {
    count++;
    rev += parseOrderTotalNum(o.total);
    if (parseOrderTime(o.time)) parsed++;
  }
  return { count, rev, aov: count ? rev / count : 0, parsed, unparsed: count - parsed };
}

/** So sánh kỳ hiện tại vs kỳ trước cùng độ dài */
export function computePeriodCompare(
  orders: ShopOrder[],
  days: number,
): {
  cur: { count: number; rev: number; aov: number };
  prev: { count: number; rev: number; aov: number };
  pctCount: number;
  pctRev: number;
  pctAov: number;
  label: string;
  prevLabel: string;
} {
  const cur = aggOrders(orders, keysForDays(0, days));
  const prev = aggOrders(orders, keysForDays(days, days));
  const labels: Record<number, [string, string]> = {
    1: ["Hôm nay", "Hôm qua"],
    3: ["3 ngày gần đây", "3 ngày trước đó"],
    7: ["Tuần này (7 ngày)", "Tuần trước"],
    30: ["30 ngày gần đây", "30 ngày trước đó"],
  };
  const [label, prevLabel] = labels[days] || [`${days} ngày`, `${days} ngày trước`];
  return {
    cur,
    prev,
    pctCount: pct(cur.count, prev.count),
    pctRev: pct(cur.rev, prev.rev),
    pctAov: pct(cur.aov, prev.aov),
    label,
    prevLabel,
  };
}

/** Chỉ số tuyệt đối của Hôm qua (không gộp vào hôm nay) */
export function computeYesterdayStats(orders: ShopOrder[]) {
  const keys = keysForDays(1, 1);
  const s = aggOrders(orders, keys);
  return { ...s, label: "Hôm qua", dateKey: [...keys][0] || "" };
}

export function computeWeekCompare(orders: ShopOrder[]) {
  return computePeriodCompare(orders, 7);
}

export function computeDayCompare(orders: ShopOrder[]) {
  return computePeriodCompare(orders, 1);
}

export function compute3DayCompare(orders: ShopOrder[]) {
  return computePeriodCompare(orders, 3);
}

export function computeMonthCompare(orders: ShopOrder[]) {
  return computePeriodCompare(orders, 30);
}

export function computeOpsAlerts(orders: ShopOrder[]) {
  const shippingLate: ShopOrder[] = [];
  const badPhone: ShopOrder[] = [];
  const badAddr: ShopOrder[] = [];
  const needCb: ShopOrder[] = [];
  for (const o of orders) {
    if (isNeedCallback(o)) needCb.push(o);
    if (normalizeOrderStatus(o.status) === "Đang giao") {
      const dt = parseOrderTime(o.time);
      if (dt && Date.now() - dt.getTime() > 24 * 60 * 60 * 1000) shippingLate.push(o);
    }
    if (isWeirdPhone(o.phone)) badPhone.push(o);
    if (isMissingAddress(o.address)) badAddr.push(o);
  }
  return { needCb, shippingLate, badPhone, badAddr };
}

export function computeReorderList(customers: CustomerAgg[]) {
  const now = Date.now();
  return customers
    .filter((c) => {
      const dt = parseOrderTime(c.lastOrderAt);
      if (!dt) return false;
      return now - dt.getTime() > 30 * 24 * 60 * 60 * 1000;
    })
    .slice(0, 30);
}

export function computeTopItems(orders: ShopOrder[]) {
  const map = new Map<string, number>();
  for (const o of orders) {
    const parts = (o.items || "")
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const p of parts) {
      const name = p.replace(/^\d+\s*[x×]?\s*/i, "").slice(0, 40);
      if (name.length < 2) continue;
      map.set(name, (map.get(name) || 0) + 1);
    }
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
}

/** Payload ghi tab BaoCao trên Google Sheet */
export function buildReportSnapshot(orders: ShopOrder[]) {
  const day = computeDayCompare(orders);
  const yest = computeYesterdayStats(orders);
  const d3 = compute3DayCompare(orders);
  const week = computeWeekCompare(orders);
  const month = computeMonthCompare(orders);
  const all = computeAllTimeStats(orders);
  const now = new Date();
  return {
    generatedAt: now.toLocaleString("vi-VN", { timeZone: TZ }),
    dateKey: dateKey(now),
    allCount: all.count,
    allRev: Math.round(all.rev),
    todayCount: day.cur.count,
    todayRev: Math.round(day.cur.rev),
    yesterdayCount: yest.count,
    yesterdayRev: Math.round(yest.rev),
    d3Count: d3.cur.count,
    d3Rev: Math.round(d3.cur.rev),
    weekCount: week.cur.count,
    weekRev: Math.round(week.cur.rev),
    monthCount: month.cur.count,
    monthRev: Math.round(month.cur.rev),
    pctTodayVsYest: day.pctRev,
    pctWeek: week.pctRev,
    pctMonth: month.pctRev,
  };
}

export function buildOrdersCsv(
  orders: ShopOrder[],
  filterDays?: number,
): { csv: string; count: number; rev: number; filename: string } {
  let list = orders;
  const now = new Date();
  if (filterDays && filterDays > 0) {
    const keys = keysForDays(0, filterDays);
    list = orders.filter((o) => {
      const dt = parseOrderTime(o.time);
      return dt ? keys.has(dateKey(dt)) : false;
    });
  }
  let rev = 0;
  for (const o of list) rev += parseOrderTotalNum(o.total);
  const lines = [
    ["MaDon", "ThoiGian", "Ten", "SDT", "DiaChi", "SanPham", "Tong", "TrangThai", "GhiChu"],
    ...list.map((o) => [
      o.orderId,
      o.time,
      o.name || "",
      o.phone || "",
      o.address || "",
      o.items || "",
      o.total || "",
      o.status || "",
      o.note || "",
    ]),
  ];
  const csv = lines
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const tag =
    filterDays === 1
      ? "hom-nay"
      : filterDays === 3
        ? "3-ngay"
        : filterDays === 7
          ? "7-ngay"
          : filterDays === 30
            ? "30-ngay"
            : "tat-ca";
  const filename = `bao-cao-${tag}-${dateKey(now)}.csv`;
  return { csv, count: list.length, rev, filename };
}

export { aggregateCustomers };
