/**
 * Vuon Cua Mit — BAO CAO TU DONG
 * Dan vao cuoi file Apps Script (cung project voi webhook).
 *
 * Cach dung (1 lan):
 * 1) Extensions > Apps Script tren Google Sheet san-pham
 * 2) Dan TOAN BO file nay vao cuoi code
 * 3) Chay ham setupDailyReportTrigger()
 *
 * Moi ngay 21:00 (Asia/Ho_Chi_Minh):
 * - Doc tab DonHang
 * - Ghi 1 dong vao tab BaoCao (upsert theo Ngay)
 * - Gui email tom tat toi ALERT_EMAIL
 */

function ensureBaoCaoSheet_(ss, name) {
  var n = String(name || "BaoCao").trim() || "BaoCao";
  var sh = ss.getSheetByName(n);
  if (!sh) {
    sh = ss.insertSheet(n);
    sh.appendRow([
      "Ngay", "TaoLuc", "DonHomNay", "DTHomNay", "DonHomQua", "DTHomQua",
      "Don3Ngay", "DT3Ngay", "DonTuan", "DTTuan", "DonThang", "DTThang",
      "TongDon", "TongDT", "PctVsHomQua", "PctTuan", "PctThang", "GhiChu"
    ]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function appendReportRow_(sh, snap) {
  var dateKey = String(snap.dateKey || Utilities.formatDate(new Date(), "Asia/Ho_Chi_Minh", "yyyy-MM-dd"));
  var generatedAt = String(snap.generatedAt || Utilities.formatDate(new Date(), "Asia/Ho_Chi_Minh", "dd/MM/yyyy HH:mm"));
  var last = sh.getLastRow();
  var rowIndex = -1;
  if (last >= 2) {
    var dates = sh.getRange(2, 1, last, 1).getValues();
    for (var i = 0; i < dates.length; i++) {
      if (String(dates[i][0] || "").trim() === dateKey) { rowIndex = i + 2; break; }
    }
  }
  var row = [
    dateKey, generatedAt,
    Number(snap.todayCount) || 0, Number(snap.todayRev) || 0,
    Number(snap.yesterdayCount) || 0, Number(snap.yesterdayRev) || 0,
    Number(snap.d3Count) || 0, Number(snap.d3Rev) || 0,
    Number(snap.weekCount) || 0, Number(snap.weekRev) || 0,
    Number(snap.monthCount) || 0, Number(snap.monthRev) || 0,
    Number(snap.allCount) || 0, Number(snap.allRev) || 0,
    Number(snap.pctTodayVsYest) || 0, Number(snap.pctWeek) || 0,
    Number(snap.pctMonth) || 0, String(snap.note || "auto")
  ];
  if (rowIndex > 0) sh.getRange(rowIndex, 1, rowIndex, row.length).setValues([row]);
  else sh.appendRow(row);
}

function parseOrderTimeGas_(raw) {
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw;
  var s = String(raw || "").trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) {
    var n = Number(s);
    if (n > 20000 && n < 80000) {
      var epoch = new Date(Date.UTC(1899, 11, 30));
      return new Date(epoch.getTime() + n * 86400000);
    }
  }
  var m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    var a = +m[1], b = +m[2], y = +m[3];
    var day = a, mon = b;
    if (b > 12 && a <= 12) { day = b; mon = a; }
    return new Date(y, mon - 1, day, +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return null;
}

function dateKeyGas_(d) {
  return Utilities.formatDate(d, "Asia/Ho_Chi_Minh", "yyyy-MM-dd");
}

function parseTotalGas_(v) {
  var n = Number(String(v == null ? "" : v).replace(/[^\d.-]/g, ""));
  return isFinite(n) ? n : 0;
}

function autoDailyReport() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var orders = findOrdersSheet_(ss, "DonHang");
    if (!orders || orders.getLastRow() < 2) {
      logVcm_("autoDailyReport.empty");
      return;
    }
    var lastCol = Math.max(orders.getLastColumn(), 1);
    var headers = orders.getRange(1, 1, 1, lastCol).getValues()[0];
    var hmap = {};
    for (var c = 0; c < headers.length; c++) {
      hmap[String(headers[c] || "").toLowerCase().replace(/\s+/g, "")] = c;
    }
    var timeCol = hmap["thoigian"] != null ? hmap["thoigian"] : 0;
    var totalCol = hmap["tongtien"] != null ? hmap["tongtien"] : (hmap["tong"] != null ? hmap["tong"] : 6);
    var statusCol = hmap["trangthai"] != null ? hmap["trangthai"] : -1;
    var data = orders.getRange(2, 1, orders.getLastRow(), lastCol).getValues();

    var now = new Date();
    var todayKey = dateKeyGas_(now);

    function inLastN(offset, n) {
      var keys = {};
      for (var i = 0; i < n; i++) {
        keys[dateKeyGas_(new Date(now.getTime() - (offset + i) * 86400000))] = true;
      }
      return keys;
    }
    var kToday = inLastN(0, 1), kYest = inLastN(1, 1), k3 = inLastN(0, 3), k7 = inLastN(0, 7), k30 = inLastN(0, 30);

    var todayC = 0, todayR = 0, yestC = 0, yestR = 0, d3C = 0, d3R = 0, wC = 0, wR = 0, mC = 0, mR = 0, allC = 0, allR = 0, moi = 0, dangGiao = 0;

    for (var r = 0; r < data.length; r++) {
      var dt = parseOrderTimeGas_(data[r][timeCol]);
      var tot = parseTotalGas_(data[r][totalCol]);
      allC++; allR += tot;
      var st = statusCol >= 0 ? String(data[r][statusCol] || "") : "";
      if (/mới|moi/i.test(st)) moi++;
      if (/đang giao|dang giao/i.test(st)) dangGiao++;
      if (!dt) continue;
      var k = dateKeyGas_(dt);
      if (kToday[k]) { todayC++; todayR += tot; }
      if (kYest[k]) { yestC++; yestR += tot; }
      if (k3[k]) { d3C++; d3R += tot; }
      if (k7[k]) { wC++; wR += tot; }
      if (k30[k]) { mC++; mR += tot; }
    }

    function pct(a, b) {
      if (!b) return a ? 100 : 0;
      return Math.round(((a - b) / b) * 100);
    }

    var snap = {
      dateKey: todayKey,
      generatedAt: Utilities.formatDate(now, "Asia/Ho_Chi_Minh", "dd/MM/yyyy HH:mm"),
      todayCount: todayC, todayRev: Math.round(todayR),
      yesterdayCount: yestC, yesterdayRev: Math.round(yestR),
      d3Count: d3C, d3Rev: Math.round(d3R),
      weekCount: wC, weekRev: Math.round(wR),
      monthCount: mC, monthRev: Math.round(mR),
      allCount: allC, allRev: Math.round(allR),
      pctTodayVsYest: pct(todayR, yestR),
      pctWeek: 0, pctMonth: 0,
      note: "autoDailyReport"
    };
    appendReportRow_(ensureBaoCaoSheet_(ss, "BaoCao"), snap);

    var to = getAlertEmail_();
    if (to) {
      var body =
        "[" + SHOP_NAME + "] Bao cao ngay " + todayKey + "\n\n" +
        "Hom nay: " + todayC + " don · " + Math.round(todayR).toLocaleString("vi-VN") + "d\n" +
        "Hom qua: " + yestC + " don · " + Math.round(yestR).toLocaleString("vi-VN") + "d (" +
        (snap.pctTodayVsYest >= 0 ? "+" : "") + snap.pctTodayVsYest + "%)\n" +
        "7 ngay: " + wC + " don · " + Math.round(wR).toLocaleString("vi-VN") + "d\n" +
        "30 ngay: " + mC + " don · " + Math.round(mR).toLocaleString("vi-VN") + "d\n" +
        "Tong: " + allC + " don · " + Math.round(allR).toLocaleString("vi-VN") + "d\n" +
        "Cho XN (Moi): " + moi + " · Dang giao: " + dangGiao + "\n\n" +
        "Web: https://vuoncuamit.vercel.app/bao-cao";
      MailApp.sendEmail({
        to: to,
        subject: "[" + SHOP_NAME + "] Bao cao " + todayKey + " · " + todayC + " don · " + Math.round(todayR).toLocaleString("vi-VN") + "d",
        body: body
      });
    }
    logVcm_("autoDailyReport.ok", snap);
  } catch (err) {
    logVcm_("autoDailyReport.FATAL", safeErr_(err));
  }
}

function setupDailyReportTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "autoDailyReport") ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger("autoDailyReport")
    .timeBased()
    .atHour(21)
    .everyDays(1)
    .inTimezone("Asia/Ho_Chi_Minh")
    .create();
  try { SpreadsheetApp.getUi().alert("Da hen: moi ngay 21:00 (gio VN) chay autoDailyReport + email."); } catch (e) {}
}

function runReportNow() {
  autoDailyReport();
  try { SpreadsheetApp.getUi().alert("Da chay bao cao. Kiem tra tab BaoCao + email."); } catch (e) {}
}
