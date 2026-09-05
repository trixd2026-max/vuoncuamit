import { parseCsv } from "./csv";

export type ShopOrder = {
  time: string;
  orderId: string;
  name: string;
  phone: string;
  address: string;
  note: string;
  internalNote: string;
  total: string;
  items: string;
  type: string;
  status: string;
  statusLog: string;
};

export const ORDER_STATUSES = [
  "Mới",
  "Đã xác nhận",
  "Đóng gói",
  "Đang giao",
  "Xong",
  "Hủy",
] as const;

export const PIPELINE_STATUSES = [
  "Mới",
  "Đã xác nhận",
  "Đóng gói",
  "Đang giao",
  "Xong",
] as const;

export function normalizeOrderStatus(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return "Mới";
  const key = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (key === "moi" || key === "new" || key === "pending") return "Mới";
  if (key.includes("xac nhan") || key.includes("confirmed")) return "Đã xác nhận";
  if (key.includes("dong goi") || key.includes("packing") || key.includes("pack"))
    return "Đóng gói";
  if (key.includes("dang giao") || key.includes("shipping") || key.includes("deliver"))
    return "Đang giao";
  if (key === "xong" || key === "done" || key === "completed" || key.includes("hoan thanh"))
    return "Xong";
  if (key === "huy" || key === "cancel" || key.includes("cancelled")) return "Hủy";
  if ((ORDER_STATUSES as readonly string[]).includes(s)) return s;
  return s;
}

export function orderStatusTone(
  status: string,
): "default" | "ok" | "warn" | "muted" | "danger" {
  const s = normalizeOrderStatus(status);
  if (s === "Xong") return "ok";
  if (s === "Đang giao" || s === "Đã xác nhận" || s === "Đóng gói") return "warn";
  if (s === "Hủy") return "danger";
  if (s === "Mới") return "default";
  return "muted";
}

export function normalizePhone(raw: string): string {
  let s = String(raw ?? "").replace(/[^\d+]/g, "");
  if (!s) return "";
  if (s.startsWith("+84")) s = "0" + s.slice(3);
  else if (s.startsWith("84") && s.length >= 10) s = "0" + s.slice(2);
  if (/^[35789]\d{8}$/.test(s)) s = "0" + s;
  if (s.startsWith("0")) s = "0" + s.replace(/^0+/, "");
  return s;
}

export function isWeirdPhone(phone: string): boolean {
  const p = normalizePhone(phone);
  if (!p) return true;
  if (p.length < 9 || p.length > 11) return true;
  if (!/^0[35789]\d{8}$/.test(p) && !/^0[35789]\d{7,9}$/.test(p)) return true;
  return false;
}

export function isMissingAddress(address: string): boolean {
  const a = (address || "").trim();
  return a.length < 8;
}

export function parseOrderTotalNum(total: string): number {
  const n = Number(String(total).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function headerKey(h: string) {
  return h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

/** Map header Sheet → field (hỗ trợ Tong, SanPham, SDT của file báo cáo riêng) */
const COL_MAP: Record<string, keyof ShopOrder> = {
  thoigian: "time",
  thoi_gian: "time",
  time: "time",
  ngay: "time",
  madon: "orderId",
  ma_don: "orderId",
  orderid: "orderId",
  order_id: "orderId",
  ten: "name",
  name: "name",
  dienthoai: "phone",
  dien_thoai: "phone",
  phone: "phone",
  sdt: "phone",
  diachi: "address",
  dia_chi: "address",
  address: "address",
  ghichu: "note",
  ghi_chu: "note",
  note: "note",
  ghichunoibo: "internalNote",
  ghi_chu_noi_bo: "internalNote",
  internal_note: "internalNote",
  internalnote: "internalNote",
  admin_note: "internalNote",
  tongtien: "total",
  tong_tien: "total",
  tong: "total",
  total: "total",
  chitiet: "items",
  chi_tiet: "items",
  items: "items",
  sanpham: "items",
  san_pham: "items",
  mon: "items",
  loai: "type",
  type: "type",
  trangthai: "status",
  trang_thai: "status",
  status: "status",
  state: "status",
  statuslog: "statusLog",
  status_log: "statusLog",
  lichsutrangthai: "statusLog",
  lich_su_trang_thai: "statusLog",
};

export function ordersFromCsv(text: string): ShopOrder[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map(headerKey);
  const keys = headers.map((h) => COL_MAP[h]);
  const out: ShopOrder[] = [];
  for (const row of rows.slice(1)) {
    const o: Partial<ShopOrder> = {};
    keys.forEach((key, i) => {
      if (!key) return;
      o[key] = (row[i] ?? "").trim();
    });
    if (!o.orderId && !o.phone) continue;
    out.push({
      time: o.time ?? "",
      orderId: o.orderId ?? "",
      name: o.name ?? "",
      phone: normalizePhone(o.phone ?? ""),
      address: o.address ?? "",
      note: o.note ?? "",
      internalNote: o.internalNote ?? "",
      total: o.total ?? "",
      items: o.items ?? "",
      type: o.type ?? "",
      status: normalizeOrderStatus(o.status ?? ""),
      statusLog: o.statusLog ?? "",
    });
  }
  out.reverse();
  return dedupeOrdersById(out);
}

export function dedupeOrdersById(orders: ShopOrder[]): ShopOrder[] {
  const score = (o: ShopOrder) =>
    (o.phone ? 8 : 0) +
    (o.name ? 4 : 0) +
    (o.items ? 2 : 0) +
    (o.total ? 1 : 0) +
    (o.address ? 1 : 0);
  const map = new Map<string, ShopOrder>();
  for (const o of orders) {
    const id = (o.orderId || "").trim().toLowerCase();
    if (!id) {
      map.set(`__${o.time}|${o.phone}|${map.size}`, o);
      continue;
    }
    const prev = map.get(id);
    if (!prev || score(o) > score(prev)) map.set(id, o);
  }
  return [...map.values()];
}

export function maskWebhookUrl(url: string): string {
  const u = url.trim();
  if (!u) return "";
  try {
    const path = new URL(u).pathname;
    const parts = path.split("/").filter(Boolean);
    const idx = parts.indexOf("s");
    if (idx >= 0 && parts[idx + 1]) {
      const token = parts[idx + 1];
      const masked =
        token.length <= 8 ? "••••••••" : token.slice(0, 4) + "••••" + token.slice(-4);
      return u.replace(token, masked);
    }
  } catch {
    /* ignore */
  }
  if (u.length < 24) return "••••••••";
  return u.slice(0, 28) + "…••••…" + u.slice(-12);
}

export function formatOrderTotal(total: string): string {
  const n = Number(String(total).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n) || n === 0) return total || "—";
  return new Intl.NumberFormat("vi-VN").format(n) + "đ";
}

export type CustomerAgg = {
  phone: string;
  name: string;
  orderCount: number;
  totalSpend: number;
  lastOrderAt: string;
  lastOrderId: string;
  notes: string[];
};

export function aggregateCustomers(orders: ShopOrder[]): CustomerAgg[] {
  const map = new Map<string, CustomerAgg>();
  for (const o of orders) {
    const phone = normalizePhone(o.phone);
    if (!phone || phone.length < 9) continue;
    const key = phone.slice(-9);
    let c = map.get(key);
    if (!c) {
      c = {
        phone,
        name: o.name || "Khách",
        orderCount: 0,
        totalSpend: 0,
        lastOrderAt: o.time || "",
        lastOrderId: o.orderId || "",
        notes: [],
      };
      map.set(key, c);
    }
    c.orderCount += 1;
    c.totalSpend += parseOrderTotalNum(o.total);
    if (o.name) c.name = o.name;
    if (o.phone) c.phone = phone;
    if (o.note?.trim()) c.notes.push(o.note.trim());
    if (o.internalNote?.trim()) c.notes.push(`[NB] ${o.internalNote.trim()}`);
    if (o.time && (!c.lastOrderAt || String(o.time) > String(c.lastOrderAt))) {
      c.lastOrderAt = o.time;
      c.lastOrderId = o.orderId;
    }
  }
  return [...map.values()].sort((a, b) => b.totalSpend - a.totalSpend);
}
