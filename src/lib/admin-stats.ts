import {
  normalizeOrderStatus,
  parseOrderTotalNum,
  aggregateCustomers,
  isWeirdPhone,
  isMissingAddress,
  type ShopOrder,
  type CustomerAgg,
} from "./orders";

export function parseOrderTime(t: string): Date | null {
  if (!t) return null;
  try {
    const d = new Date(t);
    if (!Number.isNaN(d.getTime())) return d;
  } catch {}
  const m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) {
    const dt = new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0));
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  return null;
}

export function isNeedCallback(o: ShopOrder) {
  if (normalizeOrderStatus(o.status) !== "Mới") return false;
  const dt = parseOrderTime(o.time);
  return !!dt && Date.now() - dt.getTime() > 30 * 60 * 1000;
}

const TZ = "Asia/Ho_Chi_Minh";
const dayMs = 86400000;

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
  for (const o of orders) {
    const dt = parseOrderTime(o.time);
    if (!dt) continue;
    if (!keys.has(dateKey(dt))) continue;
    count++;
    rev += parseOrderTotalNum(o.total);
  }
  return { count, rev, aov: count ? rev / count : 0 };
}

function keysForDays(startOffset: number, numDays: number) {
  const now = new Date();
  const keys = new Set<string>();
  for (let i = 0; i < numDays; i++) {
    keys.add(dateKey(new Date(now.getTime() - (startOffset + i) * dayMs)));
  }
  return keys;
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

/** Xuất CSV/Excel-friendly cho khoảng ngày */
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
