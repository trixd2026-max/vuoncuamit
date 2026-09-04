import { SHOP } from "./shop";
import { formatVnd } from "./format";
import type { CartLine } from "./cart";
import { cartTotal } from "./cart";

export function buildOrderMessage(input: {
  orderId: string;
  name: string;
  phone: string;
  address?: string;
  note: string;
  lines: CartLine[];
  /** Phí ship (đồng), 0 nếu tự lấy / thỏa thuận */
  shippingFee?: number;
  shippingLabel?: string;
  deliveryDay?: string;
  deliverySlot?: string;
  /** Tổng = hàng + ship */
  grandTotal?: number;
}) {
  const items = input.lines
    .map((l) => {
      const note = l.note ? ` (${l.note})` : "";
      return `- ${l.qty} ${l.unit} ${l.name}${note}: ${formatVnd(l.price * l.qty)}`;
    })
    .join("\n");
  const subtotal = cartTotal(input.lines);
  const fee = input.shippingFee ?? 0;
  const grand = input.grandTotal ?? subtotal + fee;

  return [
    `Xin chào ${SHOP.name},`,
    `Em muốn đặt đơn ${input.orderId}:`,
    "",
    items,
    "",
    `Tiền hàng: ${formatVnd(subtotal)}`,
    input.shippingLabel
      ? `Ship: ${input.shippingLabel}${fee > 0 ? ` (${formatVnd(fee)})` : fee === 0 && input.shippingLabel.includes("thỏa") ? " (thỏa thuận)" : " (miễn phí)"}`
      : null,
    `Tổng: ${formatVnd(grand)}`,
    `Tên: ${input.name}`,
    `SĐT: ${input.phone}`,
    input.address ? `Địa chỉ: ${input.address}` : "",
    input.deliveryDay ? `Ngày nhận: ${input.deliveryDay}` : "",
    input.deliverySlot ? `Giờ nhận: ${input.deliverySlot}` : "",
    input.note ? `Ghi chú: ${input.note}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function zaloHref() {
  return SHOP.zalo;
}

export function openZalo() {
  window.open(SHOP.zalo, "_blank", "noopener,noreferrer");
}

export async function copyZaloMessage(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function copyAndOpenZalo(text: string) {
  openZalo();
  return copyZaloMessage(text);
}

/** Link Zalo chat theo SĐT khách (fallback Zalo shop) */
export function customerZaloUrl(phone: string) {
  const digits = phone.replace(/\D/g, "");
  let n = digits;
  if (n.startsWith("84") && n.length >= 10) n = "0" + n.slice(2);
  // Sheet mất 0 đầu → 9 số bắt đầu 3/5/7/8/9
  if (/^[35789]\d{8}$/.test(n)) n = "0" + n;
  if (n.length >= 9 && n.length <= 11) return `https://zalo.me/${n}`;
  return SHOP.zalo;
}

export function customerTelUrl(phone: string) {
  const digits = phone.replace(/\D/g, "");
  let n = digits;
  if (n.startsWith("84") && n.length >= 10) n = "0" + n.slice(2);
  if (/^[35789]\d{8}$/.test(n)) n = "0" + n;
  if (n.length >= 9) return `tel:${n}`;
  return `tel:${SHOP.phone}`;
}

/** QR image URL (không cần lib thêm) */
export function qrImageUrl(data: string, size = 160) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`;
}

/** Mẫu tin nhắn shop → khách (copy + mở Zalo) */
export type ZaloTplKind = "received" | "shipping" | "done";

export function buildCustomerZaloMessage(
  kind: ZaloTplKind,
  o: { orderId?: string; name?: string; total?: string; items?: string },
) {
  const name = o.name || "bạn";
  const id = o.orderId ? ` #${o.orderId}` : "";
  if (kind === "received") {
    return [
      `Xin chào ${name},`,
      `Shop đã nhận đơn${id} của bạn.`,
      o.items ? `Nội dung: ${o.items}` : "",
      o.total ? `Tổng: ${o.total}` : "",
      `Shop sẽ xác nhận và giao sớm nhất. Cảm ơn bạn ạ!`,
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (kind === "shipping") {
    return [
      `Xin chào ${name},`,
      `Đơn${id} đang được giao đến bạn.`,
      `Vui lòng giữ máy để shipper liên hệ nhận hàng nhé!`,
    ].join("\n");
  }
  return [
    `Xin chào ${name},`,
    `Đơn${id} đã giao xong.`,
    `Cảm ơn bạn đã ủng hộ ${SHOP.name}! Hẹn gặp lại ạ 🌿`,
  ].join("\n");
}

export async function sendZaloTemplate(
  phone: string,
  kind: ZaloTplKind,
  o: { orderId?: string; name?: string; total?: string; items?: string },
) {
  const text = buildCustomerZaloMessage(kind, o);
  const url = customerZaloUrl(phone);
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* ignore */
  }
  window.open(url, "_blank", "noopener,noreferrer");
  return text;
}
