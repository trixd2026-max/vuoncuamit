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
      return {
        orders: [],
        warning:
          "Chưa cấu hình Sheet ID — vào cuối trang Quản lý → nhập Sheet ID sản phẩm → Lưu & đồng bộ",
      };
    }

    const preferred = (data.ordersSheetName || "DonHang").trim() || "DonHang";
    const tabCandidates = Array.from(
      new Set([
        preferred,
        "DonHang",
        "Don hang",
        "Đơn hàng",
        "Orders",
      ]),
    );

    const errors: string[] = [];

    for (const tab of tabCandidates) {
      const sheetName = encodeURIComponent(tab);
      const urls = [
        `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${sheetName}`,
        `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&sheet=${sheetName}`,
      ];
      for (const url of urls) {
        try {
          const text = await fetchText(url);
          if (!isProbablyCsv(text)) {
            errors.push(`Tab "${tab}": không đọc được CSV (chia sẻ Sheet?).`);
            continue;
          }
          // Tránh nhầm tab sản phẩm (header id,ten,gia...)
          const firstLine = text.trimStart().split(/\r?\n/)[0] || "";
          const lower = firstLine.toLowerCase();
          if (
            lower.includes("danh_muc") ||
            lower.includes("don_vi") ||
            (lower.includes(",ten,") && lower.startsWith("id,"))
          ) {
            errors.push(`Tab "${tab}" giống catalog SP, bỏ qua.`);
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
              return (
                op === nq ||
                op.endsWith(nq.slice(-9)) ||
                nq.endsWith(op.slice(-9))
              );
            });
          }
          const limit =
            data.limit && data.limit > 0 ? data.limit : phoneQ ? 20 : 500;
          if (orders.length === 0) {
            // Header có MaDon nhưng chưa có dòng → vẫn OK, không báo lỗi khớp cột
            if (
              /madon|ma_don|order/i.test(firstLine) &&
              /thoigian|thoi_gian|time/i.test(firstLine)
            ) {
              return {
                orders: [],
                warning: `Tab "${tab}" đúng cấu trúc nhưng chưa có đơn.`,
              };
            }
            errors.push(
              `Tab "${tab}": header không khớp (cần MaDon / ThoiGian / TongTien).`,
            );
            continue;
          }
          return { orders: orders.slice(0, limit) };
        } catch (err) {
          errors.push(
            err instanceof Error ? err.message : `Lỗi mạng tab ${tab}`,
          );
        }
      }
    }

    return {
      orders: [],
      warning:
        errors[0] ??
        "Không tải được log đơn — kiểm tra Sheet ID + tên tab DonHang + chia sẻ 'bất kỳ ai có liên kết'.",
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
      return JSON.parse(text) as {
        ok?: boolean;
        error?: string;
        created?: boolean;
        action?: string;
      };
    } catch {
      return null;
    }
  };

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
    const json = tryParse(text);
    if (json?.ok === true) return { ok: true, raw: text };
    if (json?.ok === false)
      return { ok: false, error: json.error || "Webhook tu choi", raw: text };

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

    const res3 = await fetch(target, { method: "GET", redirect: "follow" });
    const text3 = await res3.text();
    const json3 = tryParse(text3);
    if (json3?.ok === true) return { ok: true, raw: text3 };
    if (json3?.ok === false)
      return { ok: false, error: json3.error || "Webhook tu choi", raw: text3 };

    return {
      ok: false,
      error:
        "Webhook chua deploy ban moi. Vao Apps Script -> dan code moi -> Deploy -> New version",
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

export type SaveReportInput = {
  webhookUrl: string;
  report: Record<string, string | number>;
  reportSheetName?: string;
};

export const saveReportToSheet = createServerFn({ method: "POST" })
  .validator((input: SaveReportInput) => input)
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const webhookUrl = data.webhookUrl.trim();
    if (!webhookUrl) return { ok: false, error: "Chưa cấu hình webhook" };
    const payload: Record<string, string> = {
      reportSheetName: (data.reportSheetName || "BaoCao").trim(),
    };
    for (const [k, v] of Object.entries(data.report || {})) {
      payload[k] = String(v ?? "");
    }
    const result = await postWebhookUpdate(webhookUrl, "saveReport", payload);
    return { ok: result.ok, error: result.error };
  });
