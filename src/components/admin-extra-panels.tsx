import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  formatOrderTotal,
  normalizeOrderStatus,
  PIPELINE_STATUSES,
  type ShopOrder,
  type CustomerAgg,
} from "@/lib/orders";
import { sendZaloTemplate, customerTelUrl, customerZaloUrl } from "@/lib/zalo";
import {
  buildOrdersCsv,
  buildReportSnapshot,
  computeAllTimeStats,
  computeDayCompare,
  compute3DayCompare,
  computeWeekCompare,
  computeMonthCompare,
  computeYesterdayStats,
} from "@/lib/admin-stats";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { updateOrderStatus, saveReportToSheet } from "@/lib/sheet";
import { useMemo, useState } from "react";

type CashRow = { id: string; type: string; amount: number; note: string; at: string };

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat("vi-VN").format(Math.round(n)) + "đ";
}

export function AdminPipelineBoard(props: {
  orders: ShopOrder[];
  webhookUrl: string;
  ordersSheetName: string;
  bulkBusy: boolean;
  setBulkBusy: (v: boolean) => void;
  setOrders: React.Dispatch<React.SetStateAction<ShopOrder[]>>;
  orderKey: (o: ShopOrder) => string;
  isNeedCallback: (o: ShopOrder) => boolean;
}) {
  const { orders, webhookUrl, ordersSheetName, bulkBusy, setBulkBusy, setOrders, orderKey, isNeedCallback } = props;
  return (
    <section className="mt-8">
      <h2 className="font-display text-xl">Xử lý đơn (pipeline)</h2>
      <p className="mt-1 text-sm text-muted-foreground">1 chạm: Mới → Đã XN → Đóng gói → Đang giao → Xong</p>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
        {PIPELINE_STATUSES.map((st) => {
          const col = orders.filter((o) => normalizeOrderStatus(o.status) === st);
          return (
            <div key={st} className="min-w-[11rem] flex-1 rounded-xl border border-border bg-card/50 p-2">
              <p className="text-xs font-semibold text-muted-foreground">{st} · {col.length}</p>
              <div className="mt-2 max-h-[28rem] space-y-2 overflow-y-auto">
                {col.map((o) => {
                  const idx = (PIPELINE_STATUSES as readonly string[]).indexOf(st);
                  const next = idx >= 0 && idx < PIPELINE_STATUSES.length - 1 ? PIPELINE_STATUSES[idx + 1] : null;
                  return (
                    <div key={orderKey(o)} className={cn("rounded-lg border bg-background p-2 text-xs", isNeedCallback(o) && "border-red-400 bg-red-50")}>
                      <p className="font-semibold">#{o.orderId}</p>
                      <p className="truncate">{o.name || "Khách"} · {o.phone}</p>
                      <p className="mt-0.5 truncate text-muted-foreground">{o.items}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {next ? (
                          <Button type="button" size="sm" className="h-7 text-[10px]" disabled={bulkBusy} onClick={() => {
                            void (async () => {
                              if (!webhookUrl.trim()) { toast.error("Chưa webhook"); return; }
                              setBulkBusy(true);
                              const res = await updateOrderStatus({ data: { webhookUrl: webhookUrl.trim(), orderId: o.orderId, status: next, ordersSheetName: ordersSheetName.trim() || "DonHang" } });
                              setBulkBusy(false);
                              if (res.ok) {
                                const now = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
                                const entry = `${st}→${next} ${now}`;
                                setOrders((prev) => prev.map((x) => x.orderId === o.orderId ? { ...x, status: next, statusLog: x.statusLog ? `${x.statusLog} | ${entry}` : entry } : x));
                                toast.success(`#${o.orderId} → ${next}`);
                              } else toast.error(res.error || "Lỗi");
                            })();
                          }}>→ {next}</Button>
                        ) : null}
                        <Button type="button" size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => {
                          void sendZaloTemplate(o.phone, st === "Xong" ? "done" : st === "Đang giao" ? "shipping" : "received", {
                            orderId: o.orderId, name: o.name, total: formatOrderTotal(o.total), items: o.items,
                          });
                          toast.message("Đã copy tin + mở Zalo");
                        }}>Zalo</Button>
                      </div>
                    </div>
                  );
                })}
                {col.length === 0 ? <p className="text-[11px] text-muted-foreground">Trống</p> : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function AdminCustomersPanel(props: {
  customers: CustomerAgg[];
  reorderList: CustomerAgg[];
}) {
  const { customers, reorderList } = props;
  return (
    <section className="mt-8">
      <h2 className="font-display text-xl">Sổ khách hàng</h2>
      <p className="mt-1 text-sm text-muted-foreground">{customers.length} khách · gom theo SĐT</p>
      <div className="mt-3 space-y-2">
        {customers.slice(0, 40).map((c) => (
          <div key={c.phone} className="rounded-xl border border-border bg-card/60 p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{c.name}</p>
                <p className="tabular-nums">{c.phone}</p>
                <p className="text-xs text-muted-foreground">{c.orderCount} đơn · {fmtMoney(c.totalSpend)} · gần nhất {c.lastOrderAt || "—"}</p>
              </div>
              <div className="flex gap-1">
                <Button type="button" size="sm" variant="outline" className="h-8 text-xs" asChild>
                  <a href={customerTelUrl(c.phone)}>Gọi</a>
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-8 text-xs" asChild>
                  <a href={customerZaloUrl(c.phone)} target="_blank" rel="noreferrer">Zalo</a>
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {reorderList.length > 0 ? (
        <div className="mt-6">
          <h3 className="font-display text-lg">Nên nhắn lại ({'>'} 30 ngày)</h3>
          <ul className="mt-2 space-y-2">
            {reorderList.map((c) => (
              <li key={c.phone} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                <span>{c.name} · {c.phone} · lần cuối {c.lastOrderAt}</span>
                <Button type="button" size="sm" className="h-8 text-xs" onClick={() => {
                  void sendZaloTemplate(c.phone, "received", { name: c.name });
                  toast.message("Đã copy tin + mở Zalo");
                }}>Zalo</Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function CompareCard({ title, value, sub, good }: {
  title: string;
  value: string;
  sub?: string;
  good?: boolean | null;
}) {
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

export function AdminReportsPanel(props: {
  orders: ShopOrder[];
  topItems: [string, number][];
  low: number;
  out: number;
  cashRows: CashRow[];
  setCashRows: (rows: CashRow[]) => void;
  cashType: "thu" | "chi";
  setCashType: (t: "thu" | "chi") => void;
  cashAmount: string;
  setCashAmount: (v: string) => void;
  cashNote: string;
  setCashNote: (v: string) => void;
  parseOrderTime: (t: string) => Date | null;
  webhookUrl?: string;
  ordersWarning?: string;
}) {
  const {
    orders, topItems, low, out, cashRows, setCashRows,
    cashType, setCashType, cashAmount, setCashAmount, cashNote, setCashNote,
    webhookUrl = "", ordersWarning = "",
  } = props;

  const [syncing, setSyncing] = useState(false);
  const dayCmp = useMemo(() => computeDayCompare(orders), [orders]);
  const yest = useMemo(() => computeYesterdayStats(orders), [orders]);
  const d3Cmp = useMemo(() => compute3DayCompare(orders), [orders]);
  const weekCmp = useMemo(() => computeWeekCompare(orders), [orders]);
  const monthCmp = useMemo(() => computeMonthCompare(orders), [orders]);
  const allStats = useMemo(() => computeAllTimeStats(orders), [orders]);

  function exportRange(days?: number) {
    const { csv, count, rev, filename } = buildOrdersCsv(orders, days);
    downloadCsv(csv, filename);
    toast.success(`Đã tải ${filename}: ${count} đơn · ${fmtMoney(rev)}`);
  }

  async function syncToSheet() {
    if (!webhookUrl.trim()) {
      toast.error("Chưa cấu hình webhook — kéo xuống cuối trang Quản lý để lưu webhook");
      return;
    }
    if (orders.length === 0) {
      toast.error("Chưa có đơn để ghi báo cáo — kiểm tra Sheet ID & tab DonHang");
      return;
    }
    setSyncing(true);
    const snap = buildReportSnapshot(orders);
    const res = await saveReportToSheet({
      data: {
        webhookUrl: webhookUrl.trim(),
        reportSheetName: "BaoCao",
        report: snap,
      },
    });
    setSyncing(false);
    if (res.ok) toast.success("Đã ghi báo cáo vào tab BaoCao trên Google Sheet");
    else toast.error(res.error || "Không ghi được — deploy lại Apps Script (action saveReport)");
  }

  return (
    <section className="mt-8 space-y-6">
      {orders.length === 0 ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">Chưa có dữ liệu đơn để báo cáo</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
            <li>Cuối trang Quản lý → nhập <strong>Sheet ID</strong> + tên tab đơn (<code>DonHang</code>) → <strong>Lưu & đồng bộ</strong></li>
            <li>Sheet phải chia sẻ "Bất kỳ ai có liên kết" (viewer)</li>
            <li>Header cột: ThoiGian, MaDon, Ten, DienThoai, TongTien, ChiTiet, TrangThai</li>
            {ordersWarning ? <li className="text-red-700">{ordersWarning}</li> : null}
          </ul>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm">
          Đã tải <strong>{allStats.count}</strong> đơn · DT tổng <strong>{fmtMoney(allStats.rev)}</strong>
          {allStats.unparsed > 0 ? (
            <span className="text-amber-800"> · {allStats.unparsed} đơn chưa parse được ngày</span>
          ) : null}
        </div>
      )}

      <div>
        <h2 className="font-display text-xl">Báo cáo & so sánh</h2>
        <p className="mt-1 text-sm text-muted-foreground">Hôm nay · Hôm qua · 3 ngày · tuần · tháng</p>

        <div className="mt-4 space-y-3">
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Hôm nay (so với hôm qua)</p>
            <div className="grid grid-cols-3 gap-2">
              <CompareCard title="Đơn" value={String(dayCmp.cur.count)} sub={`${dayCmp.pctCount >= 0 ? "+" : ""}${dayCmp.pctCount}% vs hôm qua`} good={dayCmp.pctCount >= 0} />
              <CompareCard title="Doanh thu" value={fmtMoney(dayCmp.cur.rev)} sub={`${dayCmp.pctRev >= 0 ? "+" : ""}${dayCmp.pctRev}% vs hôm qua`} good={dayCmp.pctRev >= 0} />
              <CompareCard title="AOV" value={fmtMoney(dayCmp.cur.aov)} sub={`${dayCmp.pctAov >= 0 ? "+" : ""}${dayCmp.pctAov}%`} good={dayCmp.pctAov >= 0} />
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Hôm qua {yest.dateKey ? `(${yest.dateKey})` : ""}</p>
            <div className="grid grid-cols-3 gap-2">
              <CompareCard title="Đơn" value={String(yest.count)} />
              <CompareCard title="Doanh thu" value={fmtMoney(yest.rev)} />
              <CompareCard title="AOV" value={fmtMoney(yest.aov)} />
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">{d3Cmp.label}</p>
            <div className="grid grid-cols-3 gap-2">
              <CompareCard title="Đơn" value={String(d3Cmp.cur.count)} sub={`${d3Cmp.pctCount >= 0 ? "+" : ""}${d3Cmp.pctCount}% vs ${d3Cmp.prevLabel}`} good={d3Cmp.pctCount >= 0} />
              <CompareCard title="Doanh thu" value={fmtMoney(d3Cmp.cur.rev)} sub={`${d3Cmp.pctRev >= 0 ? "+" : ""}${d3Cmp.pctRev}%`} good={d3Cmp.pctRev >= 0} />
              <CompareCard title="AOV" value={fmtMoney(d3Cmp.cur.aov)} sub={`${d3Cmp.pctAov >= 0 ? "+" : ""}${d3Cmp.pctAov}%`} good={d3Cmp.pctAov >= 0} />
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">{weekCmp.label}</p>
            <div className="grid grid-cols-3 gap-2">
              <CompareCard title="Đơn" value={String(weekCmp.cur.count)} sub={`${weekCmp.pctCount >= 0 ? "+" : ""}${weekCmp.pctCount}% vs tuần trước`} good={weekCmp.pctCount >= 0} />
              <CompareCard title="Doanh thu" value={fmtMoney(weekCmp.cur.rev)} sub={`${weekCmp.pctRev >= 0 ? "+" : ""}${weekCmp.pctRev}%`} good={weekCmp.pctRev >= 0} />
              <CompareCard title="AOV" value={fmtMoney(weekCmp.cur.aov)} sub={`${weekCmp.pctAov >= 0 ? "+" : ""}${weekCmp.pctAov}%`} good={weekCmp.pctAov >= 0} />
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">{monthCmp.label}</p>
            <div className="grid grid-cols-3 gap-2">
              <CompareCard title="Đơn" value={String(monthCmp.cur.count)} sub={`${monthCmp.pctCount >= 0 ? "+" : ""}${monthCmp.pctCount}% vs 30 ngày trước`} good={monthCmp.pctCount >= 0} />
              <CompareCard title="Doanh thu" value={fmtMoney(monthCmp.cur.rev)} sub={`${monthCmp.pctRev >= 0 ? "+" : ""}${monthCmp.pctRev}%`} good={monthCmp.pctRev >= 0} />
              <CompareCard title="AOV" value={fmtMoney(monthCmp.cur.aov)} sub={`${monthCmp.pctAov >= 0 ? "+" : ""}${monthCmp.pctAov}%`} good={monthCmp.pctAov >= 0} />
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => exportRange(1)}>Excel hôm nay</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => exportRange(3)}>Excel 3 ngày</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => exportRange(7)}>Excel 7 ngày</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => exportRange(30)}>Excel 30 ngày</Button>
          <Button type="button" size="sm" onClick={() => exportRange()}>Excel tất cả</Button>
          <Button type="button" size="sm" variant="secondary" disabled={syncing} onClick={() => void syncToSheet()}>
            {syncing ? "Đang ghi…" : "Đồng bộ → Sheet BaoCao"}
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          CSV mở bằng Excel. Nút <strong>Đồng bộ → Sheet BaoCao</strong> ghi 1 dòng tổng hợp vào tab <code>BaoCao</code> (cùng file Sheet, cần deploy Apps Script có action saveReport).
        </p>
      </div>

      <div>
        <h3 className="font-display text-lg">Top món (ước lượng)</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {topItems.map(([name, n]) => (
            <li key={name} className="flex justify-between border-b border-border/60 py-1">
              <span className="truncate pr-2">{name}</span>
              <span className="tabular-nums text-muted-foreground">{n}</span>
            </li>
          ))}
          {topItems.length === 0 ? <li className="text-muted-foreground">Chưa đủ dữ liệu</li> : null}
        </ul>
      </div>

      <div>
        <h3 className="font-display text-lg">Sổ quỹ nhẹ (máy này)</h3>
        <p className="text-xs text-muted-foreground">Lưu localStorage — không ghi Sheet</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <select className="h-9 rounded-md border px-2 text-sm" value={cashType} onChange={(e) => setCashType(e.target.value as "thu" | "chi")}>
            <option value="thu">Thu (COD)</option>
            <option value="chi">Chi</option>
          </select>
          <Input className="h-9 w-28" type="number" placeholder="Số tiền" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} />
          <Input className="h-9 min-w-[8rem] flex-1" placeholder="Ghi chú" value={cashNote} onChange={(e) => setCashNote(e.target.value)} />
          <Button type="button" size="sm" className="h-9" onClick={() => {
            const amount = Number(cashAmount);
            if (!Number.isFinite(amount) || amount <= 0) { toast.error("Nhập số tiền"); return; }
            const row = { id: String(Date.now()), type: cashType, amount, note: cashNote.trim(), at: new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) };
            const next = [row, ...cashRows].slice(0, 100);
            setCashRows(next);
            try { localStorage.setItem("vcm-cashbook", JSON.stringify(next)); } catch {}
            setCashAmount(""); setCashNote("");
            toast.success("Đã ghi sổ quỹ");
          }}>Ghi</Button>
        </div>
        <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-sm">
          {cashRows.slice(0, 20).map((r) => (
            <li key={r.id} className="flex justify-between gap-2 border-b py-1">
              <span className={r.type === "thu" ? "text-emerald-700" : "text-red-600"}>
                {r.type === "thu" ? "+" : "-"}{fmtMoney(r.amount)} · {r.note || "—"}
              </span>
              <span className="text-xs text-muted-foreground">{r.at}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="font-display text-lg">Tồn / sắp hết</h3>
        <p className="text-sm text-muted-foreground">Từ catalog: sắp hết {low} · hết {out}</p>
      </div>
    </section>
  );
}
