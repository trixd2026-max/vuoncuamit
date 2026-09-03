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
