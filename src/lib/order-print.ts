import { SHOP } from "./shop";
import { formatVnd } from "./format";
import type { CartLine } from "./cart";
import { cartTotal } from "./cart";
import { qrImageUrl } from "./zalo";

export type PrintOrderInput = {
  title?: string;
  orderId?: string;
  lines: CartLine[];
  shippingFee?: number;
  shippingLabel?: string;
  customer?: { name?: string; phone?: string; address?: string; note?: string };
  extraNote?: string;
};

export type DeliverySlipInput = {
  orderId?: string;
  time?: string;
  name: string;
  phone: string;
  address: string;
  items: string;
  total?: string;
  note?: string;
};

export type SlipPaper = "K80" | "A6" | "A5";

const FRAME_ID = "vcm-print-frame";

function printHtmlInFrame(html: string) {
  if (typeof document === "undefined") {
    return { ok: false as const, error: "Chỉ in được trên trình duyệt" };
  }
  let iframe = document.getElementById(FRAME_ID) as HTMLIFrameElement | null;
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = FRAME_ID;
    iframe.setAttribute("title", "In");
    // 1x1 thay vì 0x0 — một số trình duyệt (đặc biệt mobile) chặn print từ iframe 0 kích thước
    iframe.style.cssText =
      "position:fixed;left:0;top:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;";
    document.body.appendChild(iframe);
  }
  const win = iframe.contentWindow;
  const doc = iframe.contentDocument || win?.document;
  if (!win || !doc) return { ok: false as const, error: "Không tạo được khung in" };
  doc.open();
  doc.write(html);
  doc.close();
  const doPrint = () => {
    try {
      win.focus();
      win.print();
    } catch {
      /* ignore */
    }
  };
  // Chờ layout/font sẵn sàng hơn 180ms cũ
  if (doc.readyState === "complete") {
    setTimeout(doPrint, 250);
  } else {
    iframe.onload = () => setTimeout(doPrint, 250);
    setTimeout(doPrint, 600);
  }
  return { ok: true as const };
}

function escapeHtml(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paperCss(paper: SlipPaper): { page: string; maxW: string; compact: boolean } {
  if (paper === "K80") return { page: "size: 80mm auto; margin: 2mm;", maxW: "76mm", compact: true };
  if (paper === "A6") return { page: "size: A6 portrait; margin: 6mm;", maxW: "105mm", compact: false };
  return { page: "size: A5 portrait; margin: 8mm;", maxW: "148mm", compact: false };
}

// REST_OF_FILE_PLACEHOLDER_SEE_LOCAL
