import { useState, type ReactNode, useEffect, useCallback, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSheetConfig } from "@/lib/sheet-config";
import { useCatalog } from "@/lib/catalog-store";
import { LOCAL_PRODUCTS, productsToCsv } from "@/lib/catalog";
import { isAdminUnlocked, unlockAdmin, lockAdmin, setStoredPin } from "@/lib/admin-gate";
import { lookupOrders, updateOrderStatus, updateOrderInternalNote, updateOrderCustomer } from "@/lib/sheet";
import {
  formatOrderTotal, maskWebhookUrl, normalizeOrderStatus, normalizePhone,
  ORDER_STATUSES, type ShopOrder,
} from "@/lib/orders";
import { printDeliverySlip, printDeliverySlips, type SlipPaper } from "@/lib/order-print";
import { customerTelUrl, customerZaloUrl } from "@/lib/zalo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/quan-ly")({ component: AdminPage });
const SCRIPT_URL = "/apps-script.gs";

function AdminPage() {
  const [unlocked, setUnlocked] = useState(() =>
    typeof window !== "undefined" ? isAdminUnlocked() : false,
  );
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [newPin, setNewPin] = useState("");
  const [showPinChange, setShowPinChange] = useState(false);
  const [showWebhook, setShowWebhook] = useState(false);

  const cfg = useSheetConfig();
  const reload = useCatalog((s) => s.reload);
  const source = useCatalog((s) => s.source);
  const warning = useCatalog((s) => s.warning);
  const loading = useCatalog((s) => s.loading);
  const products = useCatalog((s) => s.products);
  const [sheetId, setSheetId] = useState(cfg.sheetId);
  const [csvUrl, setCsvUrl] = useState(cfg.csvUrl);
  const [sheetName, setSheetName] = useState(cfg.sheetName);
  const [gid, setGid] = useState(cfg.gid);
  const [webhookUrl, setWebhookUrl] = useState(cfg.webhookUrl);
  const [ordersSheetName, setOrdersSheetName] = useState(cfg.ordersSheetName || "DonHang");
  const [script, setScript] = useState("");
  const [scriptLoading, setScriptLoading] = useState(true);

  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersWarning, setOrdersWarning] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPhone, setFilterPhone] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState("Đã xác nhận");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [paperSize, setPaperSize] = useState<SlipPaper>("K80");
  const [statsRange, setStatsRange] = useState<"7" | "30">("7");
  const [editOrder, setEditOrder] = useState<ShopOrder | null>(null);
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editName, setEditName] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [noteSaving, setNoteSaving] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(SCRIPT_URL);
        const text = await res.text();
        if (!cancelled) setScript(text);
      } catch {
        if (!cancelled) setScript("// Khong tai duoc /apps-script.gs");
      } finally {
        if (!cancelled) setScriptLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    setOrdersWarning("");
    try {
      const res = await lookupOrders({
        data: {
          sheetId: sheetId.trim() || cfg.sheetId,
          ordersSheetName: ordersSheetName.trim() || "DonHang",
          limit: 80,
        },
      });
      setOrders(res.orders);
      setNoteDrafts((prev) => {
        const next = { ...prev };
        for (const o of res.orders) {
          const k = `${o.orderId}|${o.time}`;
          if (next[k] === undefined) next[k] = o.internalNote || "";
        }
        return next;
      });
      if (res.warning) setOrdersWarning(res.warning);
      else if (res.orders.length === 0)
        setOrdersWarning("Chưa có đơn trên tab DonHang (hoặc chưa đọc được Sheet).");
    } catch {
      setOrders([]);
      setOrdersWarning("Không tải được log đơn.");
    } finally {
      setOrdersLoading(false);
    }
  }, [sheetId, ordersSheetName, cfg.sheetId]);

  const orderKey = (o: ShopOrder) => `${o.orderId}|${o.time}`;
  const parseOrderTime = (t: string): Date | null => {
    if (!t) return null;
    try { const d = new Date(t); if (!Number.isNaN(d.getTime())) return d; } catch {}
    const m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (m) {
      const dt = new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0));
      if (!Number.isNaN(dt.getTime())) return dt;
    }
    return null;
  };
  const isNeedCallback = (o: ShopOrder) => {
    if (normalizeOrderStatus(o.status) !== "Mới") return false;
    const dt = parseOrderTime(o.time);
    return !!dt && Date.now() - dt.getTime() > 30 * 60 * 1000;
  };
  const toSlip = (o: ShopOrder) => ({
    orderId: o.orderId, time: o.time, name: o.name || "Khách", phone: o.phone,
    address: o.address, items: o.items, total: formatOrderTotal(o.total), note: o.note,
  });

  const filteredOrders = useMemo(() => {
    let list = orders;
    if (filterStatus) list = list.filter((o) => normalizeOrderStatus(o.status) === filterStatus);
    if (filterPhone.trim()) {
      const nq = normalizePhone(filterPhone);
      list = list.filter((o) => {
        const op = normalizePhone(o.phone);
        if (!nq) return true;
        return op.includes(nq) || nq.includes(op.slice(-9));
      });
    }
    if (filterDate) {
      list = list.filter((o) => {
        const t = o.time || "";
        if (t.includes(filterDate)) return true;
        const [y, m, d] = filterDate.split("-");
        if (y && m && d) {
          const vi = `${d}/${m}/${y}`;
          const vi2 = `${Number(d)}/${Number(m)}/${y}`;
          if (t.includes(vi) || t.includes(vi2)) return true;
        }
        try {
          const dt = new Date(t);
          if (!Number.isNaN(dt.getTime())) {
            return dt.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }) === filterDate;
          }
        } catch {}
        return false;
      });
    }
    return list;
  }, [orders, filterDate, filterStatus, filterPhone]);

  const todayStats = useMemo(() => {
    const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
    const isToday = (t: string) => {
      if (!t) return false;
      if (t.includes(todayIso)) return true;
      const [y, m, d] = todayIso.split("-");
      const vi = `${d}/${m}/${y}`;
      const vi2 = `${Number(d)}/${Number(m)}/${y}`;
      if (t.includes(vi) || t.includes(vi2)) return true;
      try {
        const dt = new Date(t);
        if (!Number.isNaN(dt.getTime())) {
          return dt.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }) === todayIso;
        }
      } catch {}
      return false;
    };
    const today = orders.filter((o) => isToday(o.time));
    let revenue = 0;
    for (const o of today) {
      const n = Number(String(o.total).replace(/[^\d.-]/g, ""));
      if (Number.isFinite(n)) revenue += n;
    }
    const pending = today.filter((o) => normalizeOrderStatus(o.status) === "Mới").length;
    const shipping = today.filter((o) => {
      const s = normalizeOrderStatus(o.status);
      return s === "Đang giao" || s === "Đã xác nhận";
    }).length;
    const needCallback = today.filter(isNeedCallback).length;
    return {
      count: today.length,
      revenueLabel: revenue > 0 ? new Intl.NumberFormat("vi-VN").format(revenue) + "đ" : "0đ",
      pending,
      shipping,
      needCallback,
    };
  }, [orders]);

  const periodStats = useMemo(() => {
    const days = statsRange === "7" ? 7 : 30;
    const now = new Date();
    const tz = "Asia/Ho_Chi_Minh";
    const buckets: { key: string; label: string; count: number; revenue: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const key = d.toLocaleDateString("en-CA", { timeZone: tz });
      const label = d.toLocaleDateString("vi-VN", { timeZone: tz, day: "2-digit", month: "2-digit" });
      buckets.push({ key, label, count: 0, revenue: 0 });
    }
    const map = new Map(buckets.map((b) => [b.key, b]));
    for (const o of orders) {
      const dt = parseOrderTime(o.time);
      if (!dt) continue;
      const key = dt.toLocaleDateString("en-CA", { timeZone: tz });
      const b = map.get(key);
      if (!b) continue;
      b.count += 1;
      const n = Number(String(o.total).replace(/[^\d.-]/g, ""));
      if (Number.isFinite(n)) b.revenue += n;
    }
    return {
      buckets,
      totalCount: buckets.reduce((s, b) => s + b.count, 0),
      totalRev: buckets.reduce((s, b) => s + b.revenue, 0),
      maxCount: Math.max(1, ...buckets.map((b) => b.count)),
      days,
    };
  }, [orders, statsRange]);

  useEffect(() => {
    if (unlocked) void loadOrders();
  }, [unlocked, loadOrders]);

  async function save() {
    cfg.setConfig({
      sheetId: sheetId.trim(),
      csvUrl: csvUrl.includes("/edit") ? "" : csvUrl.trim(),
      sheetName: sheetName.trim(),
      gid: gid.trim(),
      webhookUrl: webhookUrl.trim(),
      ordersSheetName: ordersSheetName.trim() || "DonHang",
    });
    await reload();
    const st = useCatalog.getState();
    if (st.source === "sheet") toast.success(`Đã đồng bộ Sheet · ${st.products.length} sản phẩm`);
    else toast.error(st.warning || "Chưa đọc được Sheet");
    void loadOrders();
  }

  function downloadCsv() {
    const blob = new Blob([productsToCsv(LOCAL_PRODUCTS)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "san-pham-vuon-cua-mit.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const tracked = products.filter((p) => typeof p.stock === "number").length;
  const low = products.filter((p) => typeof p.stock === "number" && p.stock > 0 && p.stock <= 3).length;
  const out = products.filter((p) => !p.inStock || (typeof p.stock === "number" && p.stock <= 0)).length;

  if (!unlocked) {
    return (
      <main className="mx-auto flex max-w-sm flex-col px-4 py-16">
        <p className="text-xs tracking-wide text-muted-foreground uppercase">Chủ cửa hàng</p>
        <h1 className="font-display mt-1 text-3xl">Nhập mã PIN</h1>
        <form className="mt-8 flex flex-col gap-3" onSubmit={(e) => {
          e.preventDefault();
          if (unlockAdmin(pinInput)) { setUnlocked(true); setPinError(""); setPinInput(""); toast.success("Đã mở khóa"); }
          else setPinError("PIN không đúng");
        }}>
          <Input type="password" inputMode="numeric" placeholder="Mã PIN" value={pinInput} onChange={(e) => setPinInput(e.target.value)} className="text-center text-lg tracking-widest" />
          {pinError ? <p className="text-sm text-destructive">{pinError}</p> : null}
          <Button type="submit" size="lg">Vào quản lý</Button>
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-display text-4xl">Quản lý đơn & Sheet</h1>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => { lockAdmin(); setUnlocked(false); }}>Khóa</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setShowPinChange((v) => !v)}>Đổi PIN</Button>
        <Button type="button" variant="ghost" size="sm" asChild><Link to="/tra-cuu-don">Tra cứu đơn</Link></Button>
      </div>

      <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-xl border border-border bg-card/70 px-3 py-3">
          <p className="text-[10px] uppercase text-muted-foreground">Đơn hôm nay</p>
          <p className="mt-1 font-display text-2xl tabular-nums">{todayStats.count}</p>
        </div>
        <div className="rounded-xl border border-border bg-card/70 px-3 py-3">
          <p className="text-[10px] uppercase text-muted-foreground">Doanh thu</p>
          <p className="mt-1 font-display text-2xl tabular-nums">{todayStats.revenueLabel}</p>
        </div>
        <div className="rounded-xl border border-border bg-card/70 px-3 py-3">
          <p className="text-[10px] uppercase text-muted-foreground">Chờ XN</p>
          <p className="mt-1 font-display text-2xl tabular-nums text-amber-700">{todayStats.pending}</p>
        </div>
        <div className="rounded-xl border border-border bg-card/70 px-3 py-3">
          <p className="text-[10px] uppercase text-muted-foreground">Đang giao</p>
          <p className="mt-1 font-display text-2xl tabular-nums text-orange-700">{todayStats.shipping}</p>
        </div>
        <div className={cn("rounded-xl border px-3 py-3", todayStats.needCallback > 0 ? "border-red-300 bg-red-50" : "border-border bg-card/70")}>
          <p className="text-[10px] uppercase text-muted-foreground">Cần gọi lại</p>
          <p className={cn("mt-1 font-display text-2xl tabular-nums", todayStats.needCallback > 0 && "text-red-700")}>{todayStats.needCallback}</p>
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-card/40 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg">Thống kê {periodStats.days} ngày</h2>
          <div className="flex gap-1">
            <Button type="button" size="sm" variant={statsRange === "7" ? "default" : "outline"} className="h-8 text-xs" onClick={() => setStatsRange("7")}>7 ngày</Button>
            <Button type="button" size="sm" variant={statsRange === "30" ? "default" : "outline"} className="h-8 text-xs" onClick={() => setStatsRange("30")}>30 ngày</Button>
          </div>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{periodStats.totalCount} đơn · {new Intl.NumberFormat("vi-VN").format(periodStats.totalRev)}đ</p>
        <div className="mt-3 flex h-28 items-end gap-0.5">
          {periodStats.buckets.map((b) => (
            <div key={b.key} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${b.label}: ${b.count}`}>
              <div className="w-full max-w-[18px] rounded-t bg-primary/80" style={{ height: `${Math.max(b.count ? 8 : 2, Math.round((b.count / periodStats.maxCount) * 100))}%` }} />
              <span className="truncate text-[9px] text-muted-foreground">{b.label}</span>
            </div>
          ))}
        </div>
      </section>

      <h2 className="font-display mt-10 text-xl">Đơn gần đây</h2>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Input type="date" className="h-9 w-auto" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
        <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Tất cả TT</option>
          {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <Input type="tel" className="h-9 w-28" placeholder="SĐT" value={filterPhone} onChange={(e) => setFilterPhone(e.target.value)} />
        <Button type="button" variant="outline" size="sm" className="h-9" disabled={ordersLoading} onClick={() => void loadOrders()}>{ordersLoading ? "…" : "Làm mới"}</Button>
        <select className="h-9 rounded-md border px-1.5 text-xs" value={paperSize} onChange={(e) => setPaperSize(e.target.value as SlipPaper)}>
          <option value="K80">K80</option><option value="A6">A6</option><option value="A5">A5</option>
        </select>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed px-3 py-2">
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={filteredOrders.length > 0 && filteredOrders.every((o) => selectedIds.has(orderKey(o)))}
            onChange={(e) => setSelectedIds(e.target.checked ? new Set(filteredOrders.map(orderKey)) : new Set())} />
          Chọn ({selectedIds.size})
        </label>
        <select className="h-8 rounded-md border px-2 text-xs" value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
          {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <Button type="button" size="sm" className="h-8 text-xs" disabled={!selectedIds.size || bulkBusy} onClick={() => {
          void (async () => {
            if (!webhookUrl.trim()) { toast.error("Chưa webhook"); return; }
            const targets = filteredOrders.filter((o) => selectedIds.has(orderKey(o)));
            setBulkBusy(true); let ok = 0;
            for (const o of targets) {
              const res = await updateOrderStatus({ data: { webhookUrl: webhookUrl.trim(), orderId: o.orderId, status: bulkStatus, ordersSheetName: ordersSheetName.trim() || "DonHang" } });
              if (res.ok) {
                ok++;
                const now = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
                const entry = `${normalizeOrderStatus(o.status)}→${bulkStatus} ${now}`;
                setOrders((prev) => prev.map((x) => x.orderId === o.orderId ? { ...x, status: bulkStatus, statusLog: x.statusLog ? `${x.statusLog} | ${entry}` : entry } : x));
              }
            }
            setBulkBusy(false); setSelectedIds(new Set());
            toast.success(`${ok}/${targets.length} → ${bulkStatus}`);
          })();
        }}>{bulkBusy ? "…" : "Đổi TT"}</Button>
        <Button type="button" size="sm" variant="outline" className="h-8 text-xs" disabled={!selectedIds.size} onClick={() => {
          const targets = filteredOrders.filter((o) => selectedIds.has(orderKey(o)));
          const res = printDeliverySlips(targets.map(toSlip), paperSize);
          if (!res.ok) toast.error(res.error || "Lỗi in"); else toast.success(`In ${targets.length} ${paperSize}`);
        }}>In phiếu chọn</Button>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">{filteredOrders.length}/{orders.length} đơn{ordersWarning ? ` · ${ordersWarning}` : ""}</p>

      {filteredOrders.length > 0 ? (
        <ul className="mt-4 max-h-[32rem] space-y-2 overflow-y-auto">
          {filteredOrders.map((o) => {
            const nk = `${o.orderId}|${o.time}`;
            const draft = noteDrafts[nk] ?? o.internalNote ?? "";
            return (
              <li key={nk} className={cn("rounded-xl border bg-card/60 px-3 py-2.5 text-sm", isNeedCallback(o) ? "border-red-400 ring-1 ring-red-200" : "border-border")}>
                <div className="mb-1 flex items-center gap-2">
                  <input type="checkbox" checked={selectedIds.has(orderKey(o))} onChange={(e) => {
                    setSelectedIds((prev) => { const n = new Set(prev); const k = orderKey(o); if (e.target.checked) n.add(k); else n.delete(k); return n; });
                  }} />
                  {isNeedCallback(o) ? <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-800">Cần gọi lại</span> : null}
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{o.orderId || "—"} · {o.phone || "?"}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium",
                    normalizeOrderStatus(o.status) === "Xong" && "bg-emerald-100 text-emerald-900",
                    normalizeOrderStatus(o.status) === "Hủy" && "bg-red-100 text-red-800",
                    (normalizeOrderStatus(o.status) === "Đang giao" || normalizeOrderStatus(o.status) === "Đã xác nhận") && "bg-amber-100 text-amber-900",
                    normalizeOrderStatus(o.status) === "Mới" && "bg-primary/10 text-primary",
                  )}>{normalizeOrderStatus(o.status)}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{o.time}{o.name ? ` · ${o.name}` : ""} · {formatOrderTotal(o.total)}</p>
                {o.items ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{o.items}</p> : null}
                {o.address ? <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{o.address}</p> : null}
                {o.statusLog ? <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">Log: {o.statusLog}</p> : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <select className="h-8 rounded-md border px-2 text-xs" value={normalizeOrderStatus(o.status)} onChange={(e) => {
                    const status = e.target.value;
                    void (async () => {
                      if (!webhookUrl.trim()) { toast.error("Chưa webhook"); return; }
                      const res = await updateOrderStatus({ data: { webhookUrl: webhookUrl.trim(), orderId: o.orderId, status, ordersSheetName: ordersSheetName.trim() || "DonHang" } });
                      if (res.ok) {
                        const now = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
                        const entry = `${normalizeOrderStatus(o.status)}→${status} ${now}`;
                        setOrders((prev) => prev.map((x) => x.orderId === o.orderId ? { ...x, status, statusLog: x.statusLog ? `${x.statusLog} | ${entry}` : entry } : x));
                        toast.success(status);
                      } else toast.error(res.error || "Lỗi");
                    })();
                  }}>
                    {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <Button type="button" size="sm" variant="outline" className="h-8 text-xs" asChild><a href={customerTelUrl(o.phone)}>Gọi</a></Button>
                  <Button type="button" size="sm" variant="outline" className="h-8 text-xs" asChild><a href={customerZaloUrl(o.phone)} target="_blank" rel="noreferrer">Zalo</a></Button>
                  <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => {
                    const res = printDeliverySlip(toSlip(o), paperSize);
                    if (!res.ok) toast.error(res.error); else toast.message(`In ${paperSize}`);
                  }}>In ({paperSize})</Button>
                  <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => {
                    setEditOrder(o); setEditName(o.name || ""); setEditPhone(o.phone || ""); setEditAddress(o.address || ""); setEditNote(o.note || "");
                  }}>Sửa</Button>
                </div>
                <div className="mt-2 flex flex-col gap-1.5">
                  <textarea className="min-h-[2.5rem] w-full rounded-md border px-2 py-1.5 text-xs" rows={2} placeholder="Ghi chú nội bộ" value={draft}
                    onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [nk]: e.target.value }))} />
                  <Button type="button" size="sm" variant="secondary" className="h-8 w-fit text-xs" disabled={noteSaving === nk || draft === (o.internalNote || "")} onClick={() => {
                    void (async () => {
                      if (!webhookUrl.trim()) return;
                      setNoteSaving(nk);
                      const res = await updateOrderInternalNote({ data: { webhookUrl: webhookUrl.trim(), orderId: o.orderId, internalNote: draft, ordersSheetName: ordersSheetName.trim() || "DonHang" } });
                      setNoteSaving(null);
                      if (res.ok) { setOrders((prev) => prev.map((x) => x.orderId === o.orderId ? { ...x, internalNote: draft } : x)); toast.success("Đã lưu ghi chú"); }
                      else toast.error(res.error || "Lỗi");
                    })();
                  }}>{noteSaving === nk ? "…" : "Lưu ghi chú"}</Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {editOrder ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border bg-background p-4 shadow-xl">
            <h3 className="font-display text-lg">Sửa {editOrder.orderId}</h3>
            <div className="mt-3 flex flex-col gap-2">
              <Input placeholder="Tên" value={editName} onChange={(e) => setEditName(e.target.value)} />
              <Input placeholder="SĐT" inputMode="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
              <Input placeholder="Địa chỉ" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} />
              <textarea className="min-h-[3rem] rounded-md border px-2 py-1.5 text-sm" placeholder="Ghi chú khách" value={editNote} onChange={(e) => setEditNote(e.target.value)} />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditOrder(null)}>Hủy</Button>
              <Button type="button" disabled={editSaving} onClick={() => {
                void (async () => {
                  if (!webhookUrl.trim() || !editOrder) return;
                  setEditSaving(true);
                  const res = await updateOrderCustomer({ data: { webhookUrl: webhookUrl.trim(), orderId: editOrder.orderId, name: editName, phone: editPhone, address: editAddress, note: editNote, ordersSheetName: ordersSheetName.trim() || "DonHang" } });
                  setEditSaving(false);
                  if (res.ok) {
                    setOrders((prev) => prev.map((x) => x.orderId === editOrder.orderId ? { ...x, name: editName, phone: normalizePhone(editPhone), address: editAddress, note: editNote } : x));
                    setEditOrder(null); toast.success("Đã lưu");
                  } else toast.error(res.error || "Deploy Apps Script");
                })();
              }}>{editSaving ? "…" : "Lưu"}</Button>
            </div>
          </div>
        </div>
      ) : null}

      <h2 className="font-display mt-12 text-xl">Cấu hình Sheet</h2>
      <div className="mt-4 grid gap-3">
        <Field label="Sheet ID"><Input value={sheetId} onChange={(e) => setSheetId(e.target.value)} /></Field>
        <Field label="Tab SP"><Input value={sheetName} onChange={(e) => setSheetName(e.target.value)} /></Field>
        <Field label="gid"><Input value={gid} onChange={(e) => setGid(e.target.value)} /></Field>
        <Field label="CSV URL"><Input value={csvUrl} onChange={(e) => setCsvUrl(e.target.value)} /></Field>
        <Field label="Webhook">
          <div className="flex gap-2">
            <Input type={showWebhook ? "text" : "password"} value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} />
            <Button type="button" variant="outline" size="icon" onClick={() => setShowWebhook((v) => !v)}>{showWebhook ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</Button>
          </div>
          {webhookUrl ? <p className="mt-1 text-xs text-muted-foreground">{maskWebhookUrl(webhookUrl)}</p> : null}
        </Field>
        <Field label="Tab đơn"><Input value={ordersSheetName} onChange={(e) => setOrdersSheetName(e.target.value)} /></Field>
        <div className="flex gap-2">
          <Button size="lg" onClick={() => void save()} disabled={loading}>{loading ? "…" : "Lưu & đồng bộ"}</Button>
          <Button size="lg" variant="outline" onClick={downloadCsv}>CSV mẫu</Button>
        </div>
        <p className="text-sm text-muted-foreground">Nguồn: {source} · {products.length} SP · tồn {tracked} · sắp hết {low} · hết {out}{warning ? ` · ${warning}` : ""}</p>
      </div>

      <h2 className="font-display mt-12 text-xl">Apps Script</h2>
      <p className="mt-2 text-sm text-muted-foreground">Copy mã → Deploy Version New.</p>
      <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-foreground p-4 text-xs text-background">{scriptLoading ? "Đang tải…" : script}</pre>
      <Button variant="ghost" className="mt-2" disabled={!script || scriptLoading} onClick={async () => { await navigator.clipboard.writeText(script); toast.success("Đã copy"); }}>Copy mã</Button>
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </label>
  );
}
