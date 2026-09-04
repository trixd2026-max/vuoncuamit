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

/** Them ?t=timestamp de tranh cache Google / CDN / edge */
function withCacheBust(url: string): string {
  const join = url.includes("?") ? "&" : "?";
  return `${url}${join}t=${Date.now()}`;
}

async function fetchText(url: string) {
  const res = await fetch(withCacheBust(url), {
    headers: {
      Accept: "text/csv,text/plain,*/*",
      "User-Agent": "VuonCuaMit/1.0",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
    },
    cache: "no-store",
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Khong tai duoc bang (${res.status})`);
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
      `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`,
    );
    urls.push(
      `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${name}`,
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
          errors.push("Google tra ve trang dang nhap — hay chia se bang cho 'bat ky ai co lien ket'.");
          continue;
        }
        const products = productsFromCsv(text);
        if (products.length === 0) {
          errors.push("Bang khong co dong san pham hop le.");
          continue;
        }
        return { products, source: "sheet" };
      } catch (err) {
        errors.push(err instanceof Error ? err.message : "Loi mang");
      }
    }

    return {
      products: LOCAL_PRODUCTS,
      source: "local",
      warning: errors[0] ?? "Khong doc duoc Google Sheet, dang dung bang mau.",
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
    if (!webhookUrl) return { saved: false, error: "Chua cau hinh webhook" };
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data.order),
        redirect: "follow",
      });
      if (!res.ok) {
        return { saved: false, error: `Sheet tra ${res.status}` };
      }
      return { saved: true };
    } catch (err) {
      return {
        saved: false,
        error: err instanceof Error ? err.message : "Khong ghi duoc don vao Sheet",
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
      return { orders: [], warning: "Chua cau hinh Sheet ID" };
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
          errors.push("Khong doc duoc tab DonHang — kiem tra chia se Sheet.");
          continue;
        }
        let orders = ordersFromCsv(text);
        const phoneQ = data.phone?.trim();
        if (phoneQ) {
          const nq = normalizePhone(phoneQ);
          if (nq.length < 9) {
            return { orders: [], warning: "So dien thoai chua du" };
          }
          orders = orders.filter((o) => {
            const op = normalizePhone(o.phone);
            return op === nq || op.endsWith(nq.slice(-9)) || nq.endsWith(op.slice(-9));
          });
        }
        const limit = data.limit && data.limit > 0 ? data.limit : phoneQ ? 20 : 80;
        return { orders: orders.slice(0, limit) };
      } catch (err) {
        errors.push(err instanceof Error ? err.message : "Loi mang");
      }
    }
    return {
      orders: [],
      warning: errors[0] ?? "Khong tai duoc log don",
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
  // Dua TOAN BO field len query + body de chiu duoc redirect POST->GET cua Google
  const target = (() => {
    try {
      const u = new URL(webhookUrl);
      u.searchParams.set("action", action);
      u.searchParams.set("_vcmUpdateOnly", "1");
      for (const [k, v] of Object.entries(payload)) {
        if (v != null && String(v) !== "") u.searchParams.set(k, String(v));
      }
      return u.toString();
    } catch {
      return withWebhookAction(webhookUrl, action);
    }
  })();
  const bodyObj = { ...payload, action, _vcmUpdateOnly: true };

  const tryParse = (text: string) => {
    try {
      return JSON.parse(text) as { ok?: boolean; error?: string; created?: boolean; action?: string };
    } catch {
      return null;
    }
  };

  try {
    // 1) JSON POST
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
    const json = tryParse(text);
    if (json?.ok === true) return { ok: true, raw: text };
    if (json?.ok === false)
      return { ok: false, error: json.error || "Webhook tu choi", raw: text };

    // 2) form POST
    const form = new URLSearchParams();
    form.set("action", action);
    form.set("_vcmUpdateOnly", "1");
    for (const [k, v] of Object.entries(payload)) form.set(k, v ?? "");
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
    const json2 = tryParse(text2);
    if (json2?.ok === true) return { ok: true, raw: text2 };
    if (json2?.ok === false)
      return { ok: false, error: json2.error || "Webhook tu choi", raw: text2 };

    // 3) GET fallback (khi Google nuot body POST)
    const res3 = await fetch(target, { method: "GET", redirect: "follow" });
    const text3 = await res3.text();
    const json3 = tryParse(text3);
    if (json3?.ok === true) return { ok: true, raw: text3 };
    if (json3?.ok === false)
      return { ok: false, error: json3.error || "Webhook tu choi", raw: text3 };

    return {
      ok: false,
      error:
        "Webhook chua deploy ban moi (co logVcm_/doGet). Vao Apps Script -> dan code moi -> Deploy -> New version",
      raw: text3 || text2 || text,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Khong goi duoc webhook",
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
    if (!webhookUrl) return { ok: false, error: "Chua cau hinh webhook" };
    if (!data.orderId?.trim()) return { ok: false, error: "Thieu ma don" };
    const result = await postWebhookUpdate(webhookUrl, "updateStatus", {
      orderId: data.orderId.trim(),
      status: data.status.trim() || "Moi",
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
    if (!webhookUrl) return { ok: false, error: "Chua cau hinh webhook" };
    if (!data.orderId?.trim()) return { ok: false, error: "Thieu ma don" };
    const result = await postWebhookUpdate(webhookUrl, "updateInternalNote", {
      orderId: data.orderId.trim(),
      internalNote: data.internalNote ?? "",
      ordersSheetName: (data.ordersSheetName || "").trim(),
    });
    return { ok: result.ok, error: result.error };
  });

export type UpdateOrderCustomerInput = {
  webhookUrl: string;
  orderId: string;
  phone?: string;
  address?: string;
  note?: string;
  name?: string;
  ordersSheetName?: string;
};

export const updateOrderCustomer = createServerFn({ method: "POST" })
  .validator((input: UpdateOrderCustomerInput) => input)
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const webhookUrl = data.webhookUrl.trim();
    if (!webhookUrl) return { ok: false, error: "Chua cau hinh webhook" };
    if (!data.orderId?.trim()) return { ok: false, error: "Thieu ma don" };
    const result = await postWebhookUpdate(webhookUrl, "updateOrderInfo", {
      orderId: data.orderId.trim(),
      phone: data.phone ?? "",
      address: data.address ?? "",
      note: data.note ?? "",
      name: data.name ?? "",
      ordersSheetName: (data.ordersSheetName || "").trim(),
    });
    return { ok: result.ok, error: result.error };
  });
