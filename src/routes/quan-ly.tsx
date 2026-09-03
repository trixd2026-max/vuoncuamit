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
import { lookupOrders, updateOrderStatus, updateOrderInternalNote } from "@/lib/sheet";
import {
  formatOrderTotal, maskWebhookUrl, normalizeOrderStatus, normalizePhone,
  ORDER_STATUSES, type ShopOrder,
} from "@/lib/orders";
import { printDeliverySlip } from "@/lib/order-print";
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

  const filteredOrders = useMemo(() => {
    let list = orders;
    if (filterStatus) {
      list = list.filter((o) => normalizeOrderStatus(o.status) === filterStatus);
    }
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
          if (t.startsWith(filterDate)) return true;
        }
        try {
          const dt = new Date(t);
          if (!Number.isNaN(dt.getTime())) {
            const iso = dt.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
            return iso === filterDate;
          }
        } catch { /* ignore */ }
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
      } catch { /* ignore */ }
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
    return {
      count: today.length,
      revenue,
      revenueLabel: revenue > 0
        ? new Intl.NumberFormat("vi-VN").format(revenue) + "đ"
        : "0đ",
      pending,
      shipping,
    };
  }, [orders]);

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
    else toast.error(st.warning || "Chưa đọc được Sheet — kiểm tra chia sẻ & tên tab");
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
        <p className="mt-2 text-sm text-muted-foreground">
          Nhập mã PIN để vào trang quản lý đơn hàng. Có thể đổi PIN sau khi đăng nhập.
        </p>
        <form className="mt-8 flex flex-col gap-3" onSubmit={(e) => {
          e.preventDefault();
          if (unlockAdmin(pinInput)) {
            setUnlocked(true); setPinError(""); setPinInput("");
            toast.success("Đã mở khóa quản lý");
          } else setPinError("PIN không đúng");
        }}>
          <Input type="password" inputMode="numeric" autoComplete="current-password"
            placeholder="Mã PIN" value={pinInput} onChange={(e) => setPinInput(e.target.value)}
            className="text-center text-lg tracking-widest" />
          {pinError ? <p className="text-sm text-destructive">{pinError}</p> : null}
          <Button type="submit" size="lg">Vào quản lý</Button>
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-xs tracking-wide text-muted-foreground uppercase">Chủ cửa hàng</p>
      <h1 className="font-display mt-1 text-4xl">Google Sheet & tồn kho</h1>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => { lockAdmin(); setUnlocked(false); toast.message("Đã khóa trang quản lý"); }}>Khóa trang</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setShowPinChange((v) => !v)}>Đổi PIN</Button>
        <Button type="button" variant="ghost" size="sm" asChild><Link to="/tra-cuu-don">Tra cứu đơn (SĐT)</Link></Button>
      </div>
      {showPinChange ? (
        <form className="mt-3 flex flex-col gap-2 rounded-xl border border-border p-4 sm:flex-row sm:items-end" onSubmit={(e) => {
          e.preventDefault();
          if (newPin.trim().length < 4) { toast.error("PIN mới ít nhất 4 ký tự"); return; }
          setStoredPin(newPin.trim()); setNewPin(""); setShowPinChange(false);
          toast.success("Đã đổi PIN (lưu trên trình duyệt này)");
        }}>
          <Field label="PIN mới"><Input type="password" inputMode="numeric" value={newPin} onChange={(e) => setNewPin(e.target.value)} placeholder="Ít nhất 4 số" /></Field>
          <Button type="submit">Lưu PIN</Button>
        </form>
      ) : null}

      <p className="mt-3 text-sm text-muted-foreground">
        Sửa giá / tồn trên Sheet → web cập nhật. Đặt hàng: trừ ton_kho, email đơn + cảnh báo tồn.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Nguồn: {source === "sheet" ? `Google Sheet · ${products.length} SP · tồn: ${tracked} · sắp hết: ${low} · hết: ${out}` : "bảng mẫu"}
        {warning ? ` · ${warning}` : ""}
      </p>

      <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card/70 px-3 py-3">
          <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Đơn hôm nay</p>
          <p className="mt-1 font-display text-2xl tabular-nums">{todayStats.count}</p>
        </div>
        <div className="rounded-xl border border-border bg-card/70 px-3 py-3">
          <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Doanh thu hôm nay</p>
          <p className="mt-1 font-display text-2xl tabular-nums">{todayStats.revenueLabel}</p>
        </div>
        <div className="rounded-xl border border-border bg-card/70 px-3 py-3">
          <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Chờ xác nhận</p>
          <p className="mt-1 font-display text-2xl tabular-nums text-amber-700">{todayStats.pending}</p>
        </div>
        <div className="rounded-xl border border-border bg-card/70 px-3 py-3">
          <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Đang giao</p>
          <p className="mt-1 font-display text-2xl tabular-nums text-orange-700">{todayStats.shipping}</p>
        </div>
      </section>

      <h2 className="font-display mt-10 text-xl">Đơn gần đây</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Tab <code>{ordersSheetName || "DonHang"}</code>. Cột <code>TrangThai</code> + <code>GhiChuNoiBo</code>. Lọc ngày / trạng thái / SĐT.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Ngày</span>
          <Input type="date" className="h-9 w-full sm:w-auto" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Trạng thái</span>
          <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">Tất cả</option>
            {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="flex min-w-[9rem] flex-1 flex-col gap-1 text-xs">
          <span className="text-muted-foreground">SĐT</span>
          <Input type="tel" inputMode="tel" placeholder="09…" className="h-9" value={filterPhone} onChange={(e) => setFilterPhone(e.target.value)} />
        </label>
        <Button type="button" variant="outline" size="sm" className="h-9" disabled={ordersLoading} onClick={() => void loadOrders()}>
          {ordersLoading ? "Đang tải…" : "Làm mới"}
        </Button>
        {(filterDate || filterStatus || filterPhone) && (
          <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => { setFilterDate(""); setFilterStatus(""); setFilterPhone(""); }}>Xóa lọc</Button>
        )}
        <Button type="button" variant="outline" size="sm" className="h-9" disabled={filteredOrders.length === 0} onClick={() => exportOrdersExcel(filteredOrders, filterDate)}>
          Xuất Excel
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-9" disabled={filteredOrders.length === 0} onClick={() => printOrdersList(filteredOrders, filterDate)}>
          In danh sách
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Hiển thị {filteredOrders.length}/{orders.length} đơn{ordersWarning ? ` · ${ordersWarning}` : ""}
      </p>
      {ordersWarning && orders.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">{ordersWarning}</p> : null}

      {filteredOrders.length > 0 ? (
        <ul className="mt-4 max-h-[32rem] space-y-2 overflow-y-auto">
          {filteredOrders.map((o) => {
            const nk = `${o.orderId}|${o.time}`;
            const draft = noteDrafts[nk] ?? o.internalNote ?? "";
            return (
              <li key={`${o.orderId}-${o.time}-${o.phone}`} className="rounded-xl border border-border bg-card/60 px-3 py-2.5 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{o.orderId || "—"} · {o.phone || "?"}</span>
                  <span className="flex items-center gap-2">
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium",
                      normalizeOrderStatus(o.status) === "Xong" && "bg-emerald-100 text-emerald-900",
                      normalizeOrderStatus(o.status) === "Hủy" && "bg-red-100 text-red-800",
                      (normalizeOrderStatus(o.status) === "Đang giao" || normalizeOrderStatus(o.status) === "Đã xác nhận") && "bg-amber-100 text-amber-900",
                      normalizeOrderStatus(o.status) === "Mới" && "bg-primary/10 text-primary",
                    )}>{normalizeOrderStatus(o.status)}</span>
                    <span className="tabular-nums text-muted-foreground">{formatOrderTotal(o.total)}</span>
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{o.time}{o.name ? ` · ${o.name}` : ""}</p>
                {o.items ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{o.items}</p> : null}
                {o.address ? <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{o.address}</p> : null}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    value={normalizeOrderStatus(o.status)}
                    onChange={(e) => {
                      const status = e.target.value;
                      void (async () => {
                        if (!webhookUrl.trim()) { toast.error("Chưa cấu hình webhook"); return; }
                        const res = await updateOrderStatus({
                          data: {
                            webhookUrl: webhookUrl.trim(),
                            orderId: o.orderId,
                            status,
                            ordersSheetName: ordersSheetName.trim() || "DonHang",
                          },
                        });
                        if (res.ok) {
                          setOrders((prev) => prev.map((x) =>
                            x.orderId === o.orderId ? { ...x, status } : x
                          ));
                          toast.success(`Đã cập nhật: ${status}`);
                        } else toast.error(res.error || "Không cập nhật được — hãy Copy mã Apps Script → Deploy Version New");
                      })();
                    }}>
                    {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <Button type="button" size="sm" variant="outline" className="h-8 text-xs" asChild><a href={customerTelUrl(o.phone)}>Gọi</a></Button>
                  <Button type="button" size="sm" variant="outline" className="h-8 text-xs" asChild>
                    <a href={customerZaloUrl(o.phone)} target="_blank" rel="noreferrer">Zalo</a>
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => {
                    const res = printDeliverySlip({
                      orderId: o.orderId, time: o.time, name: o.name || "Khách", phone: o.phone,
                      address: o.address, items: o.items, total: formatOrderTotal(o.total), note: o.note,
                    });
                    if (!res.ok) toast.error(res.error);
                    else toast.message("Mở hộp thoại in phiếu giao");
                  }}>In phiếu giao</Button>
                </div>
                <div className="mt-2 flex flex-col gap-1.5">
                  <label className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Ghi chú nội bộ</label>
                  <textarea className="min-h-[2.5rem] w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                    placeholder="VD: gọi trước 10’, cổng sau…" rows={2}
                    value={draft}
                    onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [nk]: e.target.value }))}
                  />
                  <Button type="button" size="sm" variant="secondary" className="h-8 w-fit text-xs"
                    disabled={noteSaving === nk || draft === (o.internalNote || "")}
                    onClick={() => {
                      void (async () => {
                        if (!webhookUrl.trim()) { toast.error("Chưa cấu hình webhook"); return; }
                        setNoteSaving(nk);
                        const res = await updateOrderInternalNote({
                          data: {
                            webhookUrl: webhookUrl.trim(),
                            orderId: o.orderId,
                            internalNote: draft,
                            ordersSheetName: ordersSheetName.trim() || "DonHang",
                          },
                        });
                        setNoteSaving(null);
                        if (res.ok) {
                          setOrders((prev) => prev.map((x) =>
                            x.orderId === o.orderId ? { ...x, internalNote: draft } : x
                          ));
                          toast.success("Đã lưu ghi chú nội bộ");
                        } else toast.error(res.error || "Không lưu được — Deploy lại Apps Script Version New");
                      })();
                    }}>
                    {noteSaving === nk ? "Đang lưu…" : "Lưu ghi chú"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <h2 className="font-display mt-10 text-xl">Sheet nhanh</h2>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
        <li><strong className="text-foreground">Hôm nay ngon:</strong> cột <code>noi_bat</code> = <code>1</code></li>
        <li><strong className="text-foreground">Trạng thái:</strong> <code>TrangThai</code> hoặc dropdown log đơn</li>
        <li><strong className="text-foreground">Ghi chú nội bộ:</strong> <code>GhiChuNoiBo</code> — chỉ shop, không hiện khách</li>
      </ul>

      <h2 className="font-display mt-10 text-xl">Thông báo đơn (email)</h2>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
        <li>Email tới <code className="text-foreground">trixd2026@gmail.com</code></li>
        <li>Deploy Apps Script Version: <strong>New</strong> sau khi copy mã mới.</li>
      </ol>

      <h2 className="font-display mt-10 text-xl">Cấu hình Sheet</h2>
      <div className="mt-4 flex flex-col gap-4">
        <Field label="Mã bảng (Sheet ID)"><Input value={sheetId} onChange={(e) => setSheetId(e.target.value)} placeholder="1AbCDef..." /></Field>
        <Field label="URL CSV xuất bản (để trống nếu dùng Sheet ID)">
          <Input value={csvUrl} onChange={(e) => setCsvUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tên tab sản phẩm"><Input value={sheetName} onChange={(e) => setSheetName(e.target.value)} /></Field>
          <Field label="gid tab SP"><Input value={gid} onChange={(e) => setGid(e.target.value)} /></Field>
        </div>
        <Field label="Tên tab đơn hàng"><Input value={ordersSheetName} onChange={(e) => setOrdersSheetName(e.target.value)} placeholder="DonHang" /></Field>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label>Webhook đơn hàng (Apps Script)</Label>
            <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 px-2" onClick={() => setShowWebhook((v) => !v)}>
              {showWebhook ? <><EyeOff className="size-3.5" /> Ẩn</> : <><Eye className="size-3.5" /> Hiện</>}
            </Button>
          </div>
          {showWebhook ? (
            <Input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://script.google.com/macros/s/.../exec" autoComplete="off" />
          ) : (
            <div className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 font-mono text-xs text-muted-foreground">
              {webhookUrl.trim() ? maskWebhookUrl(webhookUrl) : "Chưa cấu hình webhook"}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button size="lg" onClick={() => void save()} disabled={loading}>{loading ? "Đang đọc bảng…" : "Lưu và đồng bộ"}</Button>
          <Button size="lg" variant="outline" onClick={downloadCsv}>Tải CSV mẫu</Button>
        </div>
      </div>

      <h2 className="font-display mt-12 text-xl">Apps Script</h2>
      <p className="mt-2 text-sm text-muted-foreground">Copy mã → Apps Script → Lưu → Deploy Version New.</p>
      <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-foreground p-4 text-xs leading-relaxed text-background">
        {scriptLoading ? "Đang tải mã…" : script}
      </pre>
      <Button variant="ghost" className="mt-2" disabled={!script || scriptLoading} onClick={async () => {
        await navigator.clipboard.writeText(script);
        toast.success("Đã copy mã");
      }}>Copy mã</Button>
    </main>
  );
}

function exportOrdersExcel(list: ShopOrder[], filterDate: string) {
  const headers = ["ThoiGian", "MaDon", "Ten", "DienThoai", "DiaChi", "GhiChu", "TongTien", "ChiTiet", "Loai", "TrangThai", "GhiChuNoiBo"];
  const escape = (v: string) => {
    const s = String(v ?? "");
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(",")];
  for (const o of list) {
    lines.push([
      o.time, o.orderId, o.name, o.phone, o.address, o.note, o.total, o.items, o.type, o.status, o.internalNote,
    ].map(escape).join(","));
  }
  const bom = "\uFEFF";
  const blob = new Blob([bom + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const day = filterDate || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  a.download = `don-hang-${day}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`Đã xuất ${list.length} đơn (mở bằng Excel)`);
}

function printOrdersList(list: ShopOrder[], filterDate: string) {
  const day = filterDate || new Date().toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  const rows = list.map((o) => `
    <tr>
      <td>${esc(o.time)}</td>
      <td>${esc(o.orderId)}</td>
      <td>${esc(o.name)}</td>
      <td>${esc(o.phone)}</td>
      <td>${esc(o.items)}</td>
      <td style="text-align:right">${esc(formatOrderTotal(o.total))}</td>
      <td>${esc(normalizeOrderStatus(o.status))}</td>
    </tr>`).join("");
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"/><title>Đơn hàng ${esc(day)}</title>
    <style>
      body{font-family:system-ui,sans-serif;padding:16px;color:#111}
      h1{font-size:18px;margin:0 0 4px}
      p{margin:0 0 12px;color:#555;font-size:12px}
      table{border-collapse:collapse;width:100%;font-size:12px}
      th,td{border:1px solid #ccc;padding:6px 8px;vertical-align:top}
      th{background:#f3f4f6;text-align:left}
      @media print{button{display:none}}
    </style></head><body>
    <h1>Vườn Của Mít — Danh sách đơn</h1>
    <p>Ngày lọc: ${esc(day)} · ${list.length} đơn · In lúc ${new Date().toLocaleString("vi-VN")}</p>
    <table>
      <thead><tr><th>Thời gian</th><th>Mã đơn</th><th>Tên</th><th>SĐT</th><th>Chi tiết</th><th>Tổng</th><th>Trạng thái</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <script>window.onload=()=>window.print()</script>
    </body></html>`;
  const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
  if (!w) { toast.error("Trình duyệt chặn cửa sổ in"); return; }
  w.document.write(html);
  w.document.close();
}

function esc(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, """);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </label>
  );
}
