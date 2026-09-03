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

/** K80 = may in bill nhiet 80mm; A6/A5 = giay thuong */
export type SlipPaper = "K80" | "A6" | "A5";

const FRAME_ID = "vcm-print-frame";

function printHtmlInFrame(html: string) {
  if (typeof document === "undefined") {
    return { ok: false as const, error: "Chi in duoc tren trinh duyet" };
  }
  let iframe = document.getElementById(FRAME_ID) as HTMLIFrameElement | null;
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = FRAME_ID;
    iframe.setAttribute("title", "In");
    iframe.style.cssText =
      "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;";
    document.body.appendChild(iframe);
  }
  const win = iframe.contentWindow;
  const doc = iframe.contentDocument || win?.document;
  if (!win || !doc) {
    return { ok: false as const, error: "Khong tao duoc khung in" };
  }
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    try {
      win.focus();
      win.print();
    } catch {
      /* ignore */
    }
  }, 180);
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
  if (paper === "K80") {
    return { page: "size: 80mm auto; margin: 2mm;", maxW: "76mm", compact: true };
  }
  if (paper === "A6") {
    return { page: "size: A6 portrait; margin: 6mm;", maxW: "105mm", compact: false };
  }
  return { page: "size: A5 portrait; margin: 8mm;", maxW: "148mm", compact: false };
}

function oneSlipHtml(input: DeliverySlipInput, paper: SlipPaper, pageBreak: boolean) {
  const when =
    input.time ||
    new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  const orderId = input.orderId || "—";
  const name = input.name || "Khách";
  const phone = input.phone || "—";
  const address = input.address || "—";
  const items = input.items || "—";
  const total = input.total || "";
  const note = input.note || "";
  const { maxW, compact } = paperCss(paper);
  const zaloQr = qrImageUrl(SHOP.zalo, compact ? 64 : 96);
  const phoneQr = qrImageUrl(`tel:${SHOP.phone}`, compact ? 64 : 96);
  const breakStyle = pageBreak ? "page-break-after: always;" : "";

  if (compact) {
    return `<div class=\"slip k80\" style=\"${breakStyle}\">
  <div class=\"k-head\">
    <div class=\"k-shop\">${escapeHtml(SHOP.name)}</div>
    <div class=\"k-title\">PHIẾU GIAO</div>
  </div>
  <div class=\"k-id\">#${escapeHtml(orderId)}</div>
  <div class=\"k-time\">${escapeHtml(when)}</div>
  <div class=\"k-line\"></div>
  <div class=\"k-label\">Người nhận</div>
  <div class=\"k-name\">${escapeHtml(name)}</div>
  <div class=\"k-phone\">${escapeHtml(phone)}</div>
  <div class=\"k-label\">Địa chỉ</div>
  <div class=\"k-addr\">${escapeHtml(address)}</div>
  <div class=\"k-line\"></div>
  <div class=\"k-label\">Món</div>
  <div class=\"k-items\">${escapeHtml(items)}</div>
  ${total ? `<div class=\"k-total\">TỔNG: ${escapeHtml(total)}</div>` : ""}
  ${note ? `<div class=\"k-note\">GC: ${escapeHtml(note)}</div>` : ""}
  <div class=\"k-line\"></div>
  <div class=\"k-signs\"><div>Người giao</div><div>Người nhận</div></div>
  <div class=\"k-foot\">${escapeHtml(SHOP.owner)} · ${escapeHtml(SHOP.phoneDisplay)}</div>
</div>`;
  }

  return `<div class=\"slip\" style=\"max-width:${maxW};${breakStyle}\">
  <div class=\"head\">
    <div>
      <div class=\"head-brand\">${escapeHtml(SHOP.name)}</div>
      <div class=\"head-title\">Phiếu giao hàng</div>
      <span class=\"badge\">Giao tận nơi</span>
    </div>
    <div class=\"head-id\">
      <span style=\"opacity:0.8\">Mã đơn</span>
      <strong>${escapeHtml(orderId)}</strong>
      <span style=\"opacity:0.75;font-size:11px\">${escapeHtml(when)}</span>
    </div>
  </div>
  <div class=\"body\">
    <div class=\"section\">
      <div class=\"label\">Người nhận</div>
      <div class=\"name\">${escapeHtml(name)}</div>
      <div class=\"phone\">${escapeHtml(phone)}</div>
    </div>
    <div class=\"section\">
      <div class=\"label\">Địa chỉ giao</div>
      <div class=\"address\">${escapeHtml(address)}</div>
    </div>
    <div class=\"section\">
      <div class=\"label\">Nội dung đơn</div>
      <div class=\"items\">${escapeHtml(items)}</div>
    </div>
    ${total ? `<div class=\"total-row\"><span class=\"label\">Thu / tổng</span><span class=\"total-value\">${escapeHtml(total)}</span></div>` : ""}
    ${note ? `<div class=\"note\"><strong>Ghi chú:</strong> ${escapeHtml(note)}</div>` : ""}
    <div class=\"signs\">
      <div class=\"sign\"><div class=\"label\">Người giao</div></div>
      <div class=\"sign\"><div class=\"label\">Người nhận ký</div></div>
    </div>
    <div class=\"qr-row\">
      <div class=\"qr-box\">
        <img src=\"${zaloQr}\" alt=\"QR Zalo\" width=\"72\" height=\"72\" />
        <span>Zalo shop</span>
      </div>
      <div class=\"qr-box\">
        <img src=\"${phoneQr}\" alt=\"QR gọi\" width=\"72\" height=\"72\" />
        <span>${escapeHtml(SHOP.phoneDisplay)}</span>
      </div>
    </div>
    <div class=\"foot\">
      <span>${escapeHtml(SHOP.owner)} · ${escapeHtml(SHOP.phoneDisplay)}</span>
      <span>${escapeHtml(SHOP.address)}</span>
    </div>
  </div>
</div>`;
}

function sharedStyles(paper: SlipPaper) {
  const { page } = paperCss(paper);
  return `
    @page { ${page} }
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", system-ui, -apple-system, Roboto, "Courier New", monospace, sans-serif;
      color: #142018;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .slip {
      border: 2px solid #1c2e1c;
      border-radius: 6px;
      margin: 0 auto 8px;
      overflow: hidden;
      background: #fff;
    }
    .head {
      background: #fff;
      padding: 10px 14px 12px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 10px;
      border-bottom: 2px solid #1c2e1c;
    }
    .head-brand { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #5a6b5a; }
    .head-title { font-size: 18px; font-weight: 700; margin-top: 2px; }
    .head-id { text-align: right; font-size: 12px; line-height: 1.35; }
    .head-id strong { display: block; font-size: 15px; font-weight: 700; }
    .body { padding: 12px 14px 14px; }
    .section { margin-bottom: 10px; }
    .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #5a6b5a; font-weight: 600; margin-bottom: 2px; }
    .name { font-size: 17px; font-weight: 700; line-height: 1.25; }
    .phone { font-size: 22px; font-weight: 800; letter-spacing: 0.03em; line-height: 1.2; margin-top: 2px; }
    .address { font-size: 14px; line-height: 1.4; font-weight: 500; }
    .items { border: 1px dashed #9aab9a; border-radius: 4px; padding: 8px 10px; font-size: 13px; line-height: 1.45; white-space: pre-wrap; word-break: break-word; min-height: 48px; }
    .total-row { display: flex; justify-content: space-between; align-items: baseline; margin-top: 10px; padding-top: 8px; border-top: 2px solid #1c2e1c; }
    .total-row .label { margin: 0; }
    .total-value { font-size: 18px; font-weight: 800; }
    .note { margin-top: 8px; font-size: 12px; line-height: 1.4; border: 1px solid #ccc; border-left: 3px solid #1c2e1c; padding: 6px 8px; }
    .signs { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; }
    .sign { min-height: 48px; border-top: 1px dashed #999; padding-top: 6px; text-align: center; font-size: 11px; color: #555; }
    .qr-row { display: flex; gap: 16px; justify-content: center; margin-top: 12px; }
    .qr-box { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 10px; color: #555; }
    .qr-box img { display: block; }
    .foot { margin-top: 10px; font-size: 10px; color: #666; display: flex; flex-direction: column; gap: 2px; text-align: center; }
    .badge { display: inline-block; font-size: 10px; letter-spacing: 0.05em; text-transform: uppercase; border: 1px solid #1c2e1c; color: #1c2e1c; padding: 2px 6px; border-radius: 999px; margin-top: 4px; }
    .slip.k80 { border: none; border-radius: 0; max-width: 76mm; width: 76mm; font-family: "Courier New", Courier, monospace; padding: 2mm 1mm 4mm; }
    .k-head { text-align: center; }
    .k-shop { font-size: 12px; font-weight: 700; text-transform: uppercase; }
    .k-title { font-size: 14px; font-weight: 800; margin-top: 2px; }
    .k-id { text-align: center; font-size: 13px; font-weight: 700; margin-top: 4px; }
    .k-time { text-align: center; font-size: 10px; color: #333; margin-bottom: 4px; }
    .k-line { border-top: 1px dashed #000; margin: 6px 0; }
    .k-label { font-size: 9px; text-transform: uppercase; color: #444; margin-top: 4px; }
    .k-name { font-size: 13px; font-weight: 700; }
    .k-phone { font-size: 18px; font-weight: 800; letter-spacing: 0.02em; }
    .k-addr { font-size: 12px; line-height: 1.35; word-break: break-word; }
    .k-items { font-size: 11px; white-space: pre-wrap; word-break: break-word; line-height: 1.35; }
    .k-total { font-size: 14px; font-weight: 800; margin-top: 6px; }
    .k-note { font-size: 11px; margin-top: 4px; }
    .k-signs { display: flex; justify-content: space-between; margin-top: 12px; font-size: 10px; min-height: 36px; }
    .k-foot { text-align: center; font-size: 9px; margin-top: 8px; color: #333; }
    @media print { body { margin: 0; } .slip.k80 { width: 76mm; } }
  `;
}

export function printDeliverySlip(input: DeliverySlipInput, paper: SlipPaper = "A5") {
  const html = `<!DOCTYPE html>
<html lang=\"vi\">
<head>
  <meta charset=\"utf-8\"/>
  <title>Phieu giao ${escapeHtml(input.orderId || "")}</title>
  <style>${sharedStyles(paper)}</style>
</head>
<body>
  ${oneSlipHtml(input, paper, false)}
</body>
</html>`;
  return printHtmlInFrame(html);
}

export function printDeliverySlips(inputs: DeliverySlipInput[], paper: SlipPaper = "K80") {
  if (!inputs.length) {
    return { ok: false as const, error: "Chua chon don de in" };
  }
  const body = inputs
    .map((inp, i) => oneSlipHtml(inp, paper, i < inputs.length - 1))
    .join("\n");
  const html = `<!DOCTYPE html>
<html lang=\"vi\">
<head>
  <meta charset=\"utf-8\"/>
  <title>In ${inputs.length} phieu (${paper})</title>
  <style>${sharedStyles(paper)}</style>
</head>
<body>
  ${body}
</body>
</html>`;
  return printHtmlInFrame(html);
}

export function printOrderEstimate(input: PrintOrderInput) {
  if (!input.lines.length) {
    return { ok: false as const, error: "Chua co mon de in" };
  }
  const subtotal = cartTotal(input.lines);
  const ship = input.shippingFee ?? 0;
  const grand = subtotal + ship;
  const when = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  const linesHtml = input.lines
    .map((l) => {
      const note = l.note
        ? `<div style=\"color:#555;font-size:11px;margin-top:2px\">${escapeHtml(l.note)}</div>`
        : "";
      return `<tr>
        <td style=\"padding:6px 4px;border-bottom:1px solid #e5e7eb;vertical-align:top\">
          <div style=\"font-weight:600\">${escapeHtml(l.name)}</div>${note}
        </td>
        <td style=\"padding:6px 4px;border-bottom:1px solid #e5e7eb;text-align:center;white-space:nowrap\">${l.qty} ${escapeHtml(l.unit)}</td>
        <td style=\"padding:6px 4px;border-bottom:1px solid #e5e7eb;text-align:right;white-space:nowrap\">${formatVnd(l.price * l.qty)}</td>
      </tr>`;
    })
    .join("");
  const html = `<!DOCTYPE html><html lang=\"vi\"><head><meta charset=\"utf-8\"/><title>Bao gia</title>
  <style>
    body{font-family:system-ui,sans-serif;padding:16px;color:#111;max-width:480px;margin:0 auto}
    h1{font-size:18px;margin:0 0 4px}
    table{width:100%;border-collapse:collapse;font-size:13px;margin-top:12px}
    .total{font-size:16px;font-weight:700;margin-top:12px;text-align:right}
  </style></head><body>
  <h1>${escapeHtml(SHOP.name)}</h1>
  <p style=\"margin:0;color:#555;font-size:12px\">${escapeHtml(when)}${input.orderId ? " · " + escapeHtml(input.orderId) : ""}</p>
  <table><thead><tr>
    <th style=\"text-align:left;border-bottom:2px solid #111;padding:4px\">Mon</th>
    <th style=\"border-bottom:2px solid #111;padding:4px\">SL</th>
    <th style=\"text-align:right;border-bottom:2px solid #111;padding:4px\">Tien</th>
  </tr></thead><tbody>${linesHtml}</tbody></table>
  <div class=\"total\">Tong: ${formatVnd(grand)}</div>
  </body></html>`;
  return printHtmlInFrame(html);
}
