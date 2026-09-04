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
  try { const d = new Date(t); if (!Number.isNaN(d.getTime())) return d; } catch {}
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

export function computeWeekCompare(orders: ShopOrder[]) {
  const tz = "Asia/Ho_Chi_Minh";
  const now = new Date();
  const dayMs = 86400000;
  const thisKeys = new Set<string>();
  const lastKeys = new Set<string>();
  for (let i = 0; i < 7; i++) {
    thisKeys.add(new Date(now.getTime() - i * dayMs).toLocaleDateString("en-CA", { timeZone: tz }));
    lastKeys.add(new Date(now.getTime() - (i + 7) * dayMs).toLocaleDateString("en-CA", { timeZone: tz }));
  }
  const agg = (keys: Set<string>) => {
    let count = 0, rev = 0;
    for (const o of orders) {
      const dt = parseOrderTime(o.time);
      if (!dt) continue;
      const k = dt.toLocaleDateString("en-CA", { timeZone: tz });
      if (!keys.has(k)) continue;
      count++;
      rev += parseOrderTotalNum(o.total);
    }
    return { count, rev, aov: count ? rev / count : 0 };
  };
  const cur = agg(thisKeys);
  const prev = agg(lastKeys);
  const pct = (a: number, b: number) => {
    if (!b) return a ? 100 : 0;
    return Math.round(((a - b) / b) * 100);
  };
  return { cur, prev, pctCount: pct(cur.count, prev.count), pctRev: pct(cur.rev, prev.rev), pctAov: pct(cur.aov, prev.aov) };
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
  return customers.filter((c) => {
    const dt = parseOrderTime(c.lastOrderAt);
    if (!dt) return false;
    return now - dt.getTime() > 30 * 24 * 60 * 60 * 1000;
  }).slice(0, 30);
}

export function computeTopItems(orders: ShopOrder[]) {
  const map = new Map<string, number>();
  for (const o of orders) {
    const parts = (o.items || "").split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    for (const p of parts) {
      const name = p.replace(/^\d+\s*[x×]?\s*/i, "").slice(0, 40);
      if (name.length < 2) continue;
      map.set(name, (map.get(name) || 0) + 1);
    }
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
}

export { aggregateCustomers };
