import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSheetConfig } from "@/lib/sheet-config";
import { useCatalog } from "@/lib/catalog-store";
import { LOCAL_PRODUCTS, productsToCsv } from "@/lib/catalog";
import { isAdminUnlocked, unlockAdmin, lockAdmin, setStoredPin } from "@/lib/admin-gate";
import { lookupOrders, updateOrderStatus } from "@/lib/sheet";
import {
  formatOrderTotal, maskWebhookUrl, normalizeOrderStatus, normalizePhone,
  ORDER_STATUSES, type ShopOrder,
} from "@/lib/orders";
import { printDeliverySlip, printDeliverySlips, printBoxLabels, printPackingList, type SlipPaper } from "@/lib/order-print";
import { customerTelUrl, sendZaloTemplate } from "@/lib/zalo";
import {
  parseOrderTime, isNeedCallback, computeWeekCompare, computeOpsAlerts,
  computeReorderList, computeTopItems, aggregateCustomers,
} from "@/lib/admin-stats";
import { AdminPipelineBoard, AdminCustomersPanel, AdminReportsPanel } from "@/components/admin-extra-panels";
import { cn } from "@/lib/utils";

const SCRIPT_URL = "/apps-script.gs";

export function AdminPage() {
  const [unlocked, setUnlocked] = useState(() => typeof window !== "undefined" ? isAdminUnlocked() : false);
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
  const [adminTab, setAdminTab] = useState<"don" | "pipeline" | "khach" | "baocao">("don");
  const [cashNote, setCashNote] = useState("");
  const [cashAmount, setCashAmount] = useState("");
  const [cashType, setCashType] = useState<"thu" | "chi">("thu");
  const [cashRows, setCashRows] = useState<{ id: string; type: string; amount: number; note: string; at: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(SCRIPT_URL);
        const text = await res.text();
        if (!cancelled) setScript(text);
      } catch {
        if (!cancelled) setScript("// Khong tai duoc");
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
        data: { sheetId: sheetId.trim() || cfg.sheetId, ordersSheetName: ordersSheetName.trim() || "DonHang", limit: 80 },
      });
      setOrders(res.orders);
      if (res.warning) setOrdersWarning(res.warning);
      else if (res.orders.length === 0) setOrdersWarning("Chưa có đơn.");
    } catch {
      setOrders([]);
      setOrdersWarning("Không tải được log đơn.");
    } finally {
      setOrdersLoading(false);
    }
  }, [sheetId, ordersSheetName, cfg.sheetId]);

  const orderKey = (o: ShopOrder) => `${o.orderId}|${o.time}`;
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
        return !nq || op.includes(nq) || nq.includes(op.slice(-9));
      });
    }
    if (filterDate) {
      list = list.filter((o) => {
        const t = o.time || "";
        if (t.includes(filterDate)) return true;
        const dt = parseOrderTime(t);
        return !!dt && dt.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }) === filterDate;
      });
    }
    return list;
  }, [orders, filterDate, filterStatus, filterPhone]);

  const todayStats = useMemo(() => {
    const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
    const today = orders.filter((o) => {
      const dt = parseOrderTime(o.time);
      return dt ? dt.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }) === todayIso : (o.time || "").includes(todayIso);
    });
    let revenue = 0;
    for (const o of today) {
      const n = Number(String(o.total).replace(/[^\d.-]/g, ""));
      if (Number.isFinite(n)) revenue += n;
    }
    return {
      count: today.length,
      revenueLabel: revenue > 0 ? new Intl.NumberFormat("vi-VN").format(revenue) + "đ" : "0đ",
      pending: today.filter((o) => normalizeOrderStatus(o.status) === "Mới").length,
      shipping: today.filter((o) => ["Đang giao", "Đã xác nhận"].includes(normalizeOrderStatus(o.status))).length,
      needCallback: today.filter(isNeedCallback).length,
    };
  }, [orders]);

  const periodStats = useMemo(() => {
    const days = statsRange === "7" ? 7 : 30;
    const now = new Date();
    const tz = "Asia/Ho_Chi_Minh";
    const buckets: { key: string; label: string; count: number; revenue: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      buckets.push({
        key: d.toLocaleDateString("en-CA", { timeZone: tz }),
        label: d.toLocaleDateString("vi-VN", { timeZone: tz, day: "2-digit", month: "2-digit" }),
        count: 0, revenue: 0,
      });
    }
    const map = new Map(buckets.map((b) => [b.key, b]));
    for (const o of orders) {
      const dt = parseOrderTime(o.time);
      if (!dt) continue;
      const b = map.get(dt.toLocaleDateString("en-CA", { timeZone: tz }));
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

  const weekCompare = useMemo(() => computeWeekCompare(orders), [orders]);
  const opsAlerts = useMemo(() => computeOpsAlerts(orders), [orders]);
  const customers = useMemo(() => aggregateCustomers(orders), [orders]);
  const reorderList = useMemo(() => computeReorderList(customers), [customers]);
  const topItems = useMemo(() => computeTopItems(orders), [orders]);

  useEffect(() => { if (unlocked) void loadOrders(); }, [unlocked, loadOrders]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("vcm-cashbook");
      if (raw) setCashRows(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

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
    if (st.source === "sheet") toast.success(`Đã đồng bộ · ${st.products.length} SP`);
    else toast.error(st.warning || "Chưa đọc được Sheet");
    void loadOrders();
  }

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

      {showPinChange ? (
        <form className="mt-4 flex flex-wrap items-end gap-2 rounded-xl border bg-card/50 p-3" onSubmit={(e) => {
          e.preventDefault();
          if (newPin.trim().length < 4) { toast.error("PIN tối thiểu 4 ký tự"); return; }
          setStoredPin(newPin.trim());
          setNewPin("");
          setShowPinChange(false);
          toast.success("Đã đổi PIN");
        }}>
          <div className="flex-1"><Label>PIN mới</Label><Input type="password" value={newPin} onChange={(e) => setNewPin(e.target.value)} /></div>
          <Button type="submit" size="sm">Lưu PIN</Button>
        </form>
      ) : null}

      <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-xl border bg-card/70 px-3 py-3"><p className="text-[10px] uppercase text-muted-foreground">Đơn hôm nay</p><p className="mt-1 font-display text-2xl tabular-nums">{todayStats.count}</p></div>
        <div className="rounded-xl border bg-card/70 px-3 py-3"><p className="text-[10px] uppercase text-muted-foreground">Doanh thu</p><p className="mt-1 font-display text-2xl tabular-nums">{todayStats.revenueLabel}</p></div>
        <div className="rounded-xl border bg-card/70 px-3 py-3"><p className="text-[10px] uppercase text-muted-foreground">Chờ XN</p><p className="mt-1 font-display text-2xl tabular-nums text-amber-700">{todayStats.pending}</p></div>
        <div className="rounded-xl border bg-card/70 px-3 py-3"><p className="text-[10px] uppercase text-muted-foreground">Đang giao</p><p className="mt-1 font-display text-2xl tabular-nums text-orange-700">{todayStats.shipping}</p></div>
        <div className={cn("rounded-xl border px-3 py-3", todayStats.needCallback > 0 ? "border-red-300 bg-red-50" : "bg-card/70")}>
          <p className="text-[10px] uppercase text-muted-foreground">Cần gọi lại</p>
          <p className={cn("mt-1 font-display text-2xl tabular-nums", todayStats.needCallback > 0 && "text-red-700")}>{todayStats.needCallback}</p>
        </div>
      </section>

      <div className="mt-6 flex flex-wrap gap-1.5">
        {([["don","Đơn"],["pipeline","Xử lý đơn"],["khach","Khách"],["baocao","Báo cáo"]] as const).map(([k,label]) => (
          <Button key={k} type="button" size="sm" variant={adminTab===k?"default":"outline"} className="h-8 text-xs" onClick={()=>setAdminTab(k)}>{label}</Button>
        ))}
      </div>

      <section className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl border bg-card/70 px-3 py-2">
          <p className="text-[10px] uppercase text-muted-foreground">Đơn tuần này</p>
          <p className="font-display text-xl tabular-nums">{weekCompare.cur.count}</p>
          <p className={cn("text-[11px]", weekCompare.pctCount>=0?"text-emerald-700":"text-red-600")}>{weekCompare.pctCount>=0?"+":""}{weekCompare.pctCount}% vs tuần trước</p>
        </div>
        <div className="rounded-xl border bg-card/70 px-3 py-2">
          <p className="text-[10px] uppercase text-muted-foreground">DT tuần này</p>
          <p className="font-display text-xl tabular-nums">{new Intl.NumberFormat("vi-VN").format(Math.round(weekCompare.cur.rev))}đ</p>
          <p className={cn("text-[11px]", weekCompare.pctRev>=0?"text-emerald-700":"text-red-600")}>{weekCompare.pctRev>=0?"+":""}{weekCompare.pctRev}%</p>
        </div>
        <div className="rounded-xl border bg-card/70 px-3 py-2">
          <p className="text-[10px] uppercase text-muted-foreground">AOV</p>
          <p className="font-display text-xl tabular-nums">{new Intl.NumberFormat("vi-VN").format(Math.round(weekCompare.cur.aov))}đ</p>
          <p className={cn("text-[11px]", weekCompare.pctAov>=0?"text-emerald-700":"text-red-600")}>{weekCompare.pctAov>=0?"+":""}{weekCompare.pctAov}%</p>
        </div>
      </section>

      {(opsAlerts.needCb.length+opsAlerts.shippingLate.length+opsAlerts.badPhone.length+opsAlerts.badAddr.length)>0 ? (
        <section className="mt-4 rounded-xl border border-red-200 bg-red-50/80 p-3">
          <h2 className="font-display text-base text-red-800">Cảnh báo vận hành</h2>
          <ul className="mt-2 space-y-1 text-sm text-red-900">
            {opsAlerts.needCb.length ? <li>Cần gọi lại (Mới {'>'} 30p): <strong>{opsAlerts.needCb.length}</strong></li> : null}
            {opsAlerts.shippingLate.length ? <li>Đang giao {'>'} 1 ngày: <strong>{opsAlerts.shippingLate.length}</strong></li> : null}
            {opsAlerts.badPhone.length ? <li>SĐT lạ: <strong>{opsAlerts.badPhone.length}</strong></li> : null}
            {opsAlerts.badAddr.length ? <li>Địa chỉ thiếu: <strong>{opsAlerts.badAddr.length}</strong></li> : null}
          </ul>
        </section>
      ) : null}

      <section className="mt-6 rounded-xl border bg-card/40 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg">Thống kê {periodStats.days} ngày</h2>
          <div className="flex gap-1">
            <Button type="button" size="sm" variant={statsRange==="7"?"default":"outline"} className="h-8 text-xs" onClick={()=>setStatsRange("7")}>7 ngày</Button>
            <Button type="button" size="sm" variant={statsRange==="30"?"default":"outline"} className="h-8 text-xs" onClick={()=>setStatsRange("30")}>30 ngày</Button>
          </div>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{periodStats.totalCount} đơn · {new Intl.NumberFormat("vi-VN").format(periodStats.totalRev)}đ</p>
        <div className="mt-3 flex h-28 items-end gap-0.5">
          {periodStats.buckets.map((b) => (
            <div key={b.key} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${b.label}: ${b.count}`}>
              <div className="w-full max-w-[18px] rounded-t bg-primary/80" style={{ height: `${Math.max(b.count?8:2, Math.round((b.count/periodStats.maxCount)*100))}%` }} />
              <span className="truncate text-[9px] text-muted-foreground">{b.label}</span>
            </div>
          ))}
        </div>
      </section>

      {adminTab==="don" ? (
        <div className="mt-8">
          <h2 className="font-display text-xl">Đơn gần đây</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <Input type="date" className="h-9 w-auto" value={filterDate} onChange={(e)=>setFilterDate(e.target.value)} />
            <select className="h-9 rounded-md border px-2 text-sm" value={filterStatus} onChange={(e)=>setFilterStatus(e.target.value)}>
              <option value="">Tất cả</option>
              {ORDER_STATUSES.map((s)=><option key={s} value={s}>{s}</option>)}
            </select>
            <Input type="tel" className="h-9 w-28" placeholder="SĐT" value={filterPhone} onChange={(e)=>setFilterPhone(e.target.value)} />
            <Button type="button" variant="outline" size="sm" className="h-9" disabled={ordersLoading} onClick={()=>void loadOrders()}>{ordersLoading?"…":"Làm mới"}</Button>
            <select className="h-9 rounded-md border px-1 text-xs" value={paperSize} onChange={(e)=>setPaperSize(e.target.value as SlipPaper)}>
              <option value="K80">K80</option><option value="A6">A6</option><option value="A5">A5</option>
            </select>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 rounded-xl border border-dashed px-3 py-2">
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={filteredOrders.length>0&&filteredOrders.every((o)=>selectedIds.has(orderKey(o)))}
                onChange={(e)=>setSelectedIds(e.target.checked?new Set(filteredOrders.map(orderKey)):new Set())} />
              Chọn ({selectedIds.size})
            </label>
            <select className="h-8 rounded-md border px-2 text-xs" value={bulkStatus} onChange={(e)=>setBulkStatus(e.target.value)}>
              {ORDER_STATUSES.map((s)=><option key={s} value={s}>{s}</option>)}
            </select>
            <Button type="button" size="sm" className="h-8 text-xs" disabled={!selectedIds.size||bulkBusy} onClick={()=>{
              void (async()=>{
                if(!webhookUrl.trim()){toast.error("Chưa webhook");return;}
                const targets=filteredOrders.filter((o)=>selectedIds.has(orderKey(o)));
                setBulkBusy(true); let ok=0;
                for(const o of targets){
                  const res=await updateOrderStatus({data:{webhookUrl:webhookUrl.trim(),orderId:o.orderId,status:bulkStatus,ordersSheetName:ordersSheetName.trim()||"DonHang"}});
                  if(res.ok){ok++; setOrders((prev)=>prev.map((x)=>x.orderId===o.orderId?{...x,status:bulkStatus}:x));}
                }
                setBulkBusy(false); setSelectedIds(new Set());
                toast.success(`${ok}/${targets.length} → ${bulkStatus}`);
              })();
            }}>{bulkBusy?"…":"Đổi TT"}</Button>
            <Button type="button" size="sm" variant="outline" className="h-8 text-xs" disabled={!selectedIds.size} onClick={()=>{
              const t=filteredOrders.filter((o)=>selectedIds.has(orderKey(o)));
              const r=printDeliverySlips(t.map(toSlip),paperSize);
              if(r.ok) toast.success(`In ${t.length}`); else toast.error(r.error||"Lỗi");
            }}>In phiếu</Button>
            <Button type="button" size="sm" variant="outline" className="h-8 text-xs" disabled={!selectedIds.size} onClick={()=>{
              const t=filteredOrders.filter((o)=>selectedIds.has(orderKey(o)));
              const r=printBoxLabels(t.map(toSlip));
              if(r.ok) toast.success(`Tem ${t.length}`); else toast.error(r.error||"Lỗi");
            }}>In tem</Button>
            <Button type="button" size="sm" variant="outline" className="h-8 text-xs" disabled={!selectedIds.size} onClick={()=>{
              const t=filteredOrders.filter((o)=>selectedIds.has(orderKey(o)));
              const r=printPackingList(t.map(toSlip),filterDate||"Chuyến");
              if(r.ok) toast.success(`DS ${t.length}`); else toast.error(r.error||"Lỗi");
            }}>DS đóng gói</Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{filteredOrders.length}/{orders.length} đơn{ordersWarning?` · ${ordersWarning}`:""}</p>
          <ul className="mt-4 space-y-3">
            {filteredOrders.map((o)=>{
              const need=isNeedCallback(o);
              return (
                <li key={orderKey(o)} className={cn("rounded-xl border p-3", need&&"border-red-400 bg-red-50")}>
                  <div className="flex gap-2">
                    <input type="checkbox" className="mt-1" checked={selectedIds.has(orderKey(o))}
                      onChange={(e)=>{
                        setSelectedIds((prev)=>{
                          const n=new Set(prev);
                          if(e.target.checked) n.add(orderKey(o)); else n.delete(orderKey(o));
                          return n;
                        });
                      }} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">#{o.orderId} · {o.name||"Khách"}</p>
                      <p className="text-sm">{o.phone} · {formatOrderTotal(o.total)}</p>
                      <p className="text-xs text-muted-foreground">{o.time} · {normalizeOrderStatus(o.status)}</p>
                      <p className="mt-1 text-sm line-clamp-2">{o.items}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <select className="h-8 rounded-md border px-1 text-xs" value={normalizeOrderStatus(o.status)}
                          onChange={(e)=>{
                            const st=e.target.value;
                            void (async()=>{
                              if(!webhookUrl.trim()){toast.error("Chưa webhook");return;}
                              const res=await updateOrderStatus({data:{webhookUrl:webhookUrl.trim(),orderId:o.orderId,status:st,ordersSheetName:ordersSheetName.trim()||"DonHang"}});
                              if(res.ok){setOrders((prev)=>prev.map((x)=>x.orderId===o.orderId?{...x,status:st}:x)); toast.success(`→ ${st}`);}
                              else toast.error(res.error||"Lỗi");
                            })();
                          }}>
                          {ORDER_STATUSES.map((s)=><option key={s} value={s}>{s}</option>)}
                        </select>
                        <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={()=>{
                          const r=printDeliverySlip(toSlip(o),paperSize);
                          if(r.ok) toast.message(`In ${paperSize}`);
                        }}>In</Button>
                        <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={()=>{
                          void sendZaloTemplate(o.phone,"received",{orderId:o.orderId,name:o.name,total:formatOrderTotal(o.total),items:o.items});
                          toast.message("Zalo nhận");
                        }}>Zalo nhận</Button>
                        <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={()=>{
                          void sendZaloTemplate(o.phone,"shipping",{orderId:o.orderId,name:o.name});
                          toast.message("Zalo giao");
                        }}>Zalo giao</Button>
                        <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={()=>{
                          void sendZaloTemplate(o.phone,"done",{orderId:o.orderId,name:o.name});
                          toast.message("Zalo xong");
                        }}>Zalo xong</Button>
                        <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" asChild>
                          <a href={customerTelUrl(o.phone)}>Gọi</a>
                        </Button>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {adminTab==="pipeline" ? (
        <AdminPipelineBoard orders={orders} webhookUrl={webhookUrl} ordersSheetName={ordersSheetName}
          bulkBusy={bulkBusy} setBulkBusy={setBulkBusy} setOrders={setOrders} orderKey={orderKey} isNeedCallback={isNeedCallback} />
      ) : null}
      {adminTab==="khach" ? <AdminCustomersPanel customers={customers} reorderList={reorderList} /> : null}
      {adminTab==="baocao" ? (
        <AdminReportsPanel orders={orders} topItems={topItems} low={low} out={out}
          cashRows={cashRows} setCashRows={setCashRows} cashType={cashType} setCashType={setCashType}
          cashAmount={cashAmount} setCashAmount={setCashAmount} cashNote={cashNote} setCashNote={setCashNote}
          parseOrderTime={parseOrderTime} />
      ) : null}

      <h2 className="font-display mt-12 text-xl">Cấu hình Sheet</h2>
      <div className="mt-4 grid gap-3">
        <Field label="Sheet ID"><Input value={sheetId} onChange={(e)=>setSheetId(e.target.value)} /></Field>
        <Field label="Tab SP"><Input value={sheetName} onChange={(e)=>setSheetName(e.target.value)} /></Field>
        <Field label="gid"><Input value={gid} onChange={(e)=>setGid(e.target.value)} /></Field>
        <Field label="CSV URL"><Input value={csvUrl} onChange={(e)=>setCsvUrl(e.target.value)} /></Field>
        <Field label="Webhook">
          <div className="flex gap-2">
            <Input type={showWebhook?"text":"password"} value={webhookUrl} onChange={(e)=>setWebhookUrl(e.target.value)} />
            <Button type="button" variant="outline" size="icon" onClick={()=>setShowWebhook((v)=>!v)}>{showWebhook?<EyeOff className="size-4"/>:<Eye className="size-4"/>}</Button>
          </div>
          {webhookUrl?<p className="mt-1 text-xs text-muted-foreground">{maskWebhookUrl(webhookUrl)}</p>:null}
        </Field>
        <Field label="Tab đơn"><Input value={ordersSheetName} onChange={(e)=>setOrdersSheetName(e.target.value)} /></Field>
        <div className="flex gap-2">
          <Button size="lg" onClick={()=>void save()} disabled={loading}>{loading?"…":"Lưu & đồng bộ"}</Button>
          <Button size="lg" variant="outline" onClick={()=>{
            const blob=new Blob([productsToCsv(LOCAL_PRODUCTS)],{type:"text/csv;charset=utf-8"});
            const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="san-pham.csv"; a.click();
          }}>CSV mẫu</Button>
        </div>
        <p className="text-sm text-muted-foreground">Nguồn: {source} · {products.length} SP · sắp hết {low} · hết {out}{warning?` · ${warning}`:""}</p>
      </div>
      <h2 className="font-display mt-12 text-xl">Apps Script</h2>
      <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-foreground p-4 text-xs text-background">{scriptLoading?"Đang tải…":script}</pre>
      <Button variant="ghost" className="mt-2" disabled={!script||scriptLoading} onClick={async()=>{await navigator.clipboard.writeText(script);toast.success("Đã copy");}}>Copy mã</Button>
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
