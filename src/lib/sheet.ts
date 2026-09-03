import { createServerFn } from "@tanstack/react-start";
import { LOCAL_PRODUCTS, productsFromCsv, type Product } from "./catalog";

export type SheetConfigInput = {
  sheetId?: string;
  csvUrl?: string;
  gid?: string;
  sheetName?: string;
};

export type CatalogResult = {
  products: Product[];
  source: "local" | "sheet";
  warning?: string;
};

function isProbablyCsv(text: string) {
  const t = text.trimStart();
  if (t.startsWith("<") || t.startsWith("{")) return false;
  return t.includes(",") || t.includes("\n");
}

async function fetchText(url: string) {
  const res = await fetch(url, {
    headers: {
      Accept: "text/csv,text/plain,*/*",
      "User-Agent": "VuonCuaMit/1.0",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Không tải được bảng (${res.status})`);
  return res.text();
}

function sheetUrls(input: SheetConfigInput): string[] {
  const urls: string[] = [];
  const csvUrl = input.csvUrl?.trim();
  if (csvUrl && !csvUrl.includes("/edit")) urls.push(csvUrl);

  const id = input.sheetId?.trim();
  if (id) {
    const name = encodeURIComponent(input.sheetName?.trim() || "SanPham");
    const gid = encodeURIComponent(input.gid?.trim() || "0");
    urls.push(
      `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${name}`,
    );
    urls.push(
      `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`,
    );
  }
  return urls;
}

export const fetchCatalog = createServerFn({ method: "POST" })
  .validator((input: SheetConfigInput) => input)
  .handler(async ({ data }): Promise<CatalogResult> => {
    const urls = sheetUrls(data);
    if (urls.length === 0) {
      return { products: LOCAL_PRODUCTS, source: "local" };
    }

    const errors: string[] = [];
    for (const url of urls) {
      try {
        const text = await fetchText(url);
        if (!isProbablyCsv(text)) {
          errors.push("Google trả về trang đăng nhập — hãy chia sẻ bảng cho 'bất kỳ ai có liên kết'.");
          continue;
        }
        const products = productsFromCsv(text);
        if (products.length === 0) {
          errors.push("Bảng không có dòng sản phẩm hợp lệ.");
          continue;
        }
        return { products, source: "sheet" };
      } catch (err) {
        errors.push(err instanceof Error ? err.message : "Lỗi mạng");
      }
    }

    return {
      products: LOCAL_PRODUCTS,
      source: "local",
      warning: errors[0] ?? "Không đọc được Google Sheet, đang dùng bảng mẫu.",
    };
  });

export type OrderLinePayload = {
  productId: string;
  name: string;
  qty: number;
  unit: string;
  price: number;
};

export type OrderPayload = {
  orderId: string;
  name: string;
  phone: string;
  address: string;
  note: string;
  total: number;
  items: string;
  itemsJson: string;
  type: string;
  createdAt: string;
};

export const submitSheetOrder = createServerFn({ method: "POST" })
  .validator((input: { webhookUrl: string; order: OrderPayload }) => input)
  .handler(async ({ data }): Promise<{ saved: boolean; error?: string }> => {
    const webhookUrl = data.webhookUrl.trim();
    if (!webhookUrl) return { saved: false, error: "Chưa cấu hình webhook" };
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data.order),
        redirect: "follow",
      });
      if (!res.ok) {
        return { saved: false, error: `Sheet trả ${res.status}` };
      }
      return { saved: true };
    } catch (err) {
      return {
        saved: false,
        error: err instanceof Error ? err.message : "Không ghi được đơn vào Sheet",
      };
    }
  });

export type OrdersLookupInput = {
  sheetId?: string;
  ordersSheetName?: string;
  phone?: string;
  limit?: number;
};

export type OrdersLookupResult = {
  orders: import("./orders").ShopOrder[];
  warning?: string;
};

export const lookupOrders = createServerFn({ method: "POST" })
  .validator((input: OrdersLookupInput) => input)
  .handler(async ({ data }): Promise<OrdersLookupResult> => {
    const { ordersFromCsv, normalizePhone } = await import("./orders");
    const id = data.sheetId?.trim();
    if (!id) {
      return { orders: [], warning: "Chưa cấu hình Sheet ID" };
    }
    const sheetName = encodeURIComponent(data.ordersSheetName?.trim() || "DonHang");
    const urls = [
      `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${sheetName}`,
      `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&sheet=${sheetName}`,
    ];
    const errors: string[] = [];
    for (const url of urls) {
      try {
        const text = await fetchText(url);
        if (!isProbablyCsv(text)) {
          errors.push("Không đọc được tab DonHang — kiểm tra chia sẻ Sheet.");
          continue;
        }
        let orders = ordersFromCsv(text);
        const phoneQ = data.phone?.trim();
        if (phoneQ) {
          const nq = normalizePhone(phoneQ);
          if (nq.length < 9) {
            return { orders: [], warning: "Số điện thoại chưa đủ" };
          }
          orders = orders.filter((o) => {
            const op = normalizePhone(o.phone);
            return op === nq || op.endsWith(nq.slice(-9)) || nq.endsWith(op.slice(-9));
          });
        }
        const limit = data.limit && data.limit > 0 ? data.limit : phoneQ ? 20 : 80;
        return { orders: orders.slice(0, limit) };
      } catch (err) {
        errors.push(err instanceof Error ? err.message : "Lỗi mạng");
      }
    }
    return {
      orders: [],
      warning: errors[0] ?? "Không tải được log đơn",
    };
  });

function withWebhookAction(url: string, action: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("action", action);
    return u.toString();
  } catch {
    const join = url.includes("?") ? "&" : "?";
    return `${url}${join}action=${encodeURIComponent(action)}`;
  }
}

async function postWebhookUpdate(
  webhookUrl: string,
  action: string,
  payload: Record<string, string>,
): Promise<{ ok: boolean; error?: string; raw?: string }> {
  const target = withWebhookAction(webhookUrl, action);
  const bodyObj = { ...payload, action, _vcmUpdateOnly: true };
  try {
    const res = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Vcm-Action": action,
      },
      body: JSON.stringify(bodyObj),
      redirect: "follow",
    });
    const text = await res.text();
    try {
      const json = JSON.parse(text) as { ok?: boolean; error?: string };
      if (json.ok === true) return { ok: true, raw: text };
      if (json.ok === false)
        return { ok: false, error: json.error || "Webhook từ chối", raw: text };
    } catch {
      /* ignore */
    }
    const form = new URLSearchParams();
    form.set("action", action);
    for (const [k, v] of Object.entries(payload)) form.set(k, v ?? "");
    form.set("_vcmUpdateOnly", "1");
    const res2 = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Vcm-Action": action,
      },
      body: form.toString(),
      redirect: "follow",
    });
    const text2 = await res2.text();
    try {
      const json2 = JSON.parse(text2) as { ok?: boolean; error?: string };
      if (json2.ok === true) return { ok: true, raw: text2 };
      if (json2.ok === false)
        return { ok: false, error: json2.error || "Webhook từ chối", raw: text2 };
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      error:
        "Webhook chưa deploy bản mới (hoặc URL sai). Vào /quan-ly → Copy mã Apps Script → Deploy Version New",
      raw: text2,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Không gọi được webhook",
    };
  }
}

export type UpdateOrderStatusInput = {
  webhookUrl: string;
  orderId: string;
  status: string;
  ordersSheetName?: string;
};

export const updateOrderStatus = createServerFn({ method: "POST" })
  .validator((input: UpdateOrderStatusInput) => input)
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const webhookUrl = data.webhookUrl.trim();
    if (!webhookUrl) return { ok: false, error: "Chưa cấu hình webhook" };
    if (!data.orderId?.trim()) return { ok: false, error: "Thiếu mã đơn" };
    const result = await postWebhookUpdate(webhookUrl, "updateStatus", {
      orderId: data.orderId.trim(),
      status: data.status.trim() || "Mới",
      ordersSheetName: (data.ordersSheetName || "").trim(),
    });
    return { ok: result.ok, error: result.error };
  });

export type UpdateOrderInternalNoteInput = {
  webhookUrl: string;
  orderId: string;
  internalNote: string;
  ordersSheetName?: string;
};

export const updateOrderInternalNote = createServerFn({ method: "POST" })
  .validator((input: UpdateOrderInternalNoteInput) => input)
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const webhookUrl = data.webhookUrl.trim();
    if (!webhookUrl) return { ok: false, error: "Chưa cấu hình webhook" };
    if (!data.orderId?.trim()) return { ok: false, error: "Thiếu mã đơn" };
    const result = await postWebhookUpdate(webhookUrl, "updateInternalNote", {
      orderId: data.orderId.trim(),
      internalNote: data.internalNote ?? "",
      ordersSheetName: (data.ordersSheetName || "").trim(),
    });
    return { ok: result.ok, error: result.error };
  });
