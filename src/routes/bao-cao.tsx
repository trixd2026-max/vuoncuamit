import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isAdminUnlocked, unlockAdmin, lockAdmin } from "@/lib/admin-gate";
import { lookupOrders, saveReportToSheet } from "@/lib/sheet";
import { type ShopOrder } from "@/lib/orders";
import {
  buildOrdersCsv,
  buildReportSnapshot,
  computeAllTimeStats,
  computeDayCompare,
  computeYesterdayStats,
  compute3DayCompare,
  computeWeekCompare,
  computeMonthCompare,
  computeTopItems,
  parseOrderTime,
} from "@/lib/admin-stats";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/bao-cao")({ component: BaoCaoPage });

/** Đơn thật nằm trên Sheet sản phẩm tab DonHang */
const DEFAULT_ORDERS_SHEET_ID = "1PIwNQOmYupdqww3_Y5i1a4sPYpmHs2LNZlWIUlPsb5U";
const DEFAULT_WEBHOOK =
  "https://script.google.com/macros/s/AKfycbxumqdKdq1meRnUgzSrrW9Q2cyTQisJJn77AbDtpL18_eXuN3tWINvSZg6kprLqLZQ/exec";
const DEFAULT_TAB = "DonHang";
const STORAGE_KEY = "vcm-bao-cao-cfg-v2";

function fmtMoney(n: number) {
  return new Intl.NumberFormat("vi-VN").format(Math.round(n)) + "đ";
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function Card({ title, value, sub, good }: { title: string; value: string; sub?: string; good?: boolean | null }) {
  return (
    <div className="rounded-xl border bg-card/70 px-3 py-2">
      <p className="text-[10px] uppercase text-muted-foreground">{title}</p>
      <p className="font-display text-xl tabular-nums">{value}</p>
      {sub ? (
        <p className={cn("text-[11px]", good === true ? "text-emerald-700" : good === false ? "text-red-600" : "text-muted-foreground")}>
          {sub}
        </p>
      ) : null}
    </div>
  );
}

function BaoCaoPage() {
  const [unlocked, setUnlocked] = useState(() => typeof window !== "undefined" && isAdminUnlocked());
  const [pin, setPin] = useState("");
  const [pinErr, setPinErr] = useState("");
  const [sheetId, setSheetId] = useState(DEFAULT_ORDERS_SHEET_ID);
  const [tabName, setTabName] = useState(DEFAULT_TAB);
  const [webhook, setWebhook] = useState(DEFAULT_WEBHOOK);
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [warning, setWarning] = useState("");
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const cfg = JSON.parse(raw) as { sheetId?: string; tabName?: string; webhook?: string };
        if (cfg.sheetId) setSheetId(cfg.sheetId);
        if (cfg.tabName) setTabName(cfg.tabName);
        if (cfg.webhook) setWebhook(cfg.webhook);
      }
    } catch { /* ignore */ }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setWarning("");
    try {
      const res = await lookupOrders({
        data: { sheetId: sheetId.trim(), ordersSheetName: tabName.trim() || "DonHang", limit: 500 },
      });
      setOrders(res.orders);
      if (res.warning) setWarning(res.warning);
      else if (res.orders.length === 0) setWarning("Tab trống hoặc header không khớp.");
    } catch {
      setOrders([]);
      setWarning("Không tải được đơn.");
    } finally {
      setLoading(false);
    }
  }, [sheetId, tabName]);

  useEffect(() => {
    if (unlocked) void load();
  }, [unlocked, load]);

  const all = useMemo(() => computeAllTimeStats(orders), [orders]);
  const day = useMemo(() => computeDayCompare(orders), [orders]);
  const yest = useMemo(() => computeYesterdayStats(orders), [orders]);
  const d3 = useMemo(() => compute3DayCompare(orders), [orders]);
  const week = useMemo(() => computeWeekCompare(orders), [orders]);
  const month = useMemo(() => computeMonthCompare(orders), [orders]);
  const top = useMemo(() => computeTopItems(orders), [orders]);

  function saveCfg() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ sheetId, tabName, webhook }));
    } catch { /* ignore */ }
    toast.success("Đã lưu cấu hình báo cáo");
    void load();
  }

  async function syncSheet() {
    if (!webhook.trim()) {
      toast.error("Chưa webhook");
      return;
    }
    setSyncing(true);
    const snap = buildReportSnapshot(orders);
    const res = await saveReportToSheet({
      data: { webhookUrl: webhook.trim(), reportSheetName: "BaoCao", report: snap },
    });
    setSyncing(false);
    if (res.ok) toast.success("Đã ghi tab BaoCao");
    else toast.error(res.error || "Lỗi ghi Sheet — cần action saveReport trên Apps Script");
  }

  function exportRange(days?: number) {
    const { csv, count, rev, filename } = buildOrdersCsv(orders, days);
    downloadCsv(csv, filename);
    toast.success(`${filename}: ${count} đơn · ${fmtMoney(rev)}`);
  }

  if (!unlocked) {
    return (
      <main className="mx-auto flex max-w-sm flex-col px-4 py-16">
        <p className="text-xs tracking-wide text-muted-foreground uppercase">Báo cáo</p>
        <h1 className="font-display mt-1 text-3xl">Nhập mã PIN</h1>
        <form className="mt-8 flex flex-col gap-3" onSubmit={(e) => {
          e.preventDefault();
          if (unlockAdmin(pin)) {
            setUnlocked(true);
            setPinErr("");
            setPin("");
            toast.success("Đã mở khóa");
          } else setPinErr("PIN không đúng");
        }}>
          <Input type="password" inputMode="numeric" placeholder="Mã PIN" value={pin} onChange={(e) => setPin(e.target.value)} className="text-center text-lg tracking-widest" />
          {pinErr ? <p className="text-sm text-destructive">{pinErr}</p> : null}
          <Button type="submit" size="lg">Vào báo cáo</Button>
        </form>
        <Button asChild variant="ghost" className="mt-4">
          <Link to="/quan-ly">← Quản lý đơn & Sheet</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs tracking-wide text-muted-foreground uppercase">Báo cáo</p>
          <h1 className="font-display text-4xl">Báo cáo bán hàng</h1>
          <p className="mt-1 text-xs text-muted-foreground">Đọc đơn từ Sheet sản phẩm · tab DonHang</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => { lockAdmin(); setUnlocked(false); }}>Khóa</Button>
          <Button type="button" variant="ghost" size="sm" asChild><Link to="/quan-ly">Quản lý đơn</Link></Button>
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void load()}>{loading ? "…" : "Làm mới"}</Button>
        </div>
      </div>

      {warning ? (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">{warning}</div>
      ) : null}

      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-sm">
        Đã tải <strong>{all.count}</strong> đơn · DT tổng <strong>{fmtMoney(all.rev)}</strong>
        {all.unparsed > 0 ? <span className="text-amber-800"> · {all.unparsed} đơn lỗi ngày</span> : null}
      </div>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card title="Hôm nay · đơn" value={String(day.cur.count)} sub={`${day.pctCount >= 0 ? "+" : ""}${day.pctCount}% vs hôm qua`} good={day.pctCount >= 0} />
        <Card title="Hôm nay · DT" value={fmtMoney(day.cur.rev)} sub={`${day.pctRev >= 0 ? "+" : ""}${day.pctRev}%`} good={day.pctRev >= 0} />
        <Card title="Hôm qua · đơn" value={String(yest.count)} sub={yest.dateKey || undefined} />
        <Card title="Hôm qua · DT" value={fmtMoney(yest.rev)} />
      </section>

      <section className="mt-4 space-y-3">
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">3 ngày gần đây</p>
          <div className="grid grid-cols-3 gap-2">
            <Card title="Đơn" value={String(d3.cur.count)} sub={`${d3.pctCount >= 0 ? "+" : ""}${d3.pctCount}%`} good={d3.pctCount >= 0} />
            <Card title="Doanh thu" value={fmtMoney(d3.cur.rev)} sub={`${d3.pctRev >= 0 ? "+" : ""}${d3.pctRev}%`} good={d3.pctRev >= 0} />
            <Card title="AOV" value={fmtMoney(d3.cur.aov)} />
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Tuần (7 ngày)</p>
          <div className="grid grid-cols-3 gap-2">
            <Card title="Đơn" value={String(week.cur.count)} sub={`${week.pctCount >= 0 ? "+" : ""}${week.pctCount}% vs tuần trước`} good={week.pctCount >= 0} />
            <Card title="Doanh thu" value={fmtMoney(week.cur.rev)} sub={`${week.pctRev >= 0 ? "+" : ""}${week.pctRev}%`} good={week.pctRev >= 0} />
            <Card title="AOV" value={fmtMoney(week.cur.aov)} />
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">30 ngày</p>
          <div className="grid grid-cols-3 gap-2">
            <Card title="Đơn" value={String(month.cur.count)} sub={`${month.pctCount >= 0 ? "+" : ""}${month.pctCount}%`} good={month.pctCount >= 0} />
            <Card title="Doanh thu" value={fmtMoney(month.cur.rev)} sub={`${month.pctRev >= 0 ? "+" : ""}${month.pctRev}%`} good={month.pctRev >= 0} />
            <Card title="AOV" value={fmtMoney(month.cur.aov)} />
          </div>
        </div>
      </section>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => exportRange(1)}>Excel hôm nay</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => exportRange(3)}>Excel 3 ngày</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => exportRange(7)}>Excel 7 ngày</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => exportRange(30)}>Excel 30 ngày</Button>
        <Button type="button" size="sm" onClick={() => exportRange()}>Excel tất cả</Button>
        <Button type="button" size="sm" variant="secondary" disabled={syncing} onClick={() => void syncSheet()}>
          {syncing ? "Đang ghi…" : "Đồng bộ → Sheet BaoCao"}
        </Button>
      </div>

      <section className="mt-8">
        <h2 className="font-display text-xl">Top món</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {top.map(([name, n]) => (
            <li key={name} className="flex justify-between border-b py-1">
              <span className="truncate pr-2">{name}</span>
              <span className="tabular-nums text-muted-foreground">{n}</span>
            </li>
          ))}
          {top.length === 0 ? <li className="text-muted-foreground">Chưa có dữ liệu</li> : null}
        </ul>
      </section>

      <section className="mt-8 rounded-xl border bg-card/40 p-4">
        <h2 className="font-display text-lg">Cấu hình nguồn đơn</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Mặc định: Sheet sản phẩm (có tab DonHang với đơn thật).{" "}
          <a className="underline" href={`https://docs.google.com/spreadsheets/d/${sheetId}/edit`} target="_blank" rel="noreferrer">mở Sheet</a>
        </p>
        <div className="mt-3 grid gap-3">
          <label className="flex flex-col gap-1.5">
            <Label>Sheet ID (đọc đơn)</Label>
            <Input value={sheetId} onChange={(e) => setSheetId(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5">
            <Label>Tên tab đơn</Label>
            <Input value={tabName} onChange={(e) => setTabName(e.target.value)} placeholder="DonHang" />
          </label>
          <label className="flex flex-col gap-1.5">
            <Label>Webhook (ghi tổng hợp BaoCao)</Label>
            <Input value={webhook} onChange={(e) => setWebhook(e.target.value)} />
          </label>
          <Button type="button" onClick={saveCfg}>Lưu & tải lại</Button>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-lg">Đơn đã tải ({orders.length})</h2>
        <ul className="mt-3 space-y-2">
          {orders.slice(0, 30).map((o) => {
            const dt = parseOrderTime(o.time);
            return (
              <li key={`${o.orderId}|${o.time}`} className="rounded-xl border px-3 py-2 text-sm">
                <p className="font-semibold">#{o.orderId} · {o.name || "Khách"}</p>
                <p className="text-xs text-muted-foreground">
                  {o.time}
                  {dt ? ` → ${dt.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}` : " · ⚠ không parse ngày"}
                  {" · "}{fmtMoney(Number(String(o.total).replace(/\D/g, "")) || 0)}
                </p>
                <p className="line-clamp-1 text-xs">{o.items}</p>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
