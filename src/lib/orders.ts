import { parseCsv } from "./csv";

export type ShopOrder = {
  time: string;
  orderId: string;
  name: string;
  phone: string;
  address: string;
  note: string;
  /** Ghi chú nội bộ (chỉ shop) — cột Sheet GhiChuNoiBo */
  internalNote: string;
  total: string;
  items: string;
  type: string;
  /** Trạng thái: Mới | Đã xác nhận | Đang giao | Xong | Hủy */
  status: string;
};

export const ORDER_STATUSES = [
  "Mới",
  "Đã xác nhận",
  "Đang giao",
  "Xong",
  "Hủy",
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
  if (s === "Đang giao" || s === "Đã xác nhận") return "warn";
  if (s === "Hủy") return "danger";
  if (s === "Mới") return "default";
  return "muted";
}

export function normalizePhone(raw: string): string {
  let s = raw.replace(/[^\d+]/g, "");
  if (s.startsWith("+84")) s = "0" + s.slice(3);
  else if (s.startsWith("84") && s.length >= 10) s = "0" + s.slice(2);
  s = s.replace(/^0+/, "0");
  return s;
}

function headerKey(h: string) {
  return h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

const COL_MAP: Record<string, keyof ShopOrder> = {
  thoigian: "time",
  thoi_gian: "time",
  time: "time",
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
  total: "total",
  chitiet: "items",
  chi_tiet: "items",
  items: "items",
  loai: "type",
  type: "type",
  trangthai: "status",
  trang_thai: "status",
  status: "status",
  state: "status",
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
      phone: o.phone ?? "",
      address: o.address ?? "",
      note: o.note ?? "",
      internalNote: o.internalNote ?? "",
      total: o.total ?? "",
      items: o.items ?? "",
      type: o.type ?? "",
      status: normalizeOrderStatus(o.status ?? ""),
    });
  }
  return out.reverse();
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
