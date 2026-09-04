/** Vuon Cua Mit Apps Script + logging + upsert */
var ALERT_EMAIL = "trixd2026@gmail.com";
var LOW_STOCK_THRESHOLD = 3;
var SHOP_NAME = "Vuon Cua Mit";

function logVcm_(tag, detail) {
  try {
    var msg = "[VCM] " + String(tag || "");
    if (detail !== undefined && detail !== null) {
      if (typeof detail === "object") {
        try { msg += " " + JSON.stringify(detail); }
        catch (e1) { msg += " " + String(detail); }
      } else msg += " " + String(detail);
    }
    Logger.log(msg);
  } catch (e2) {}
}

function safeErr_(err) {
  if (!err) return "unknown";
  if (typeof err === "string") return err;
  return String(err.message || err) + (err.stack ? (" | " + String(err.stack).slice(0, 300)) : "");
}

function asPhoneText_(phone) {
  var s = String(phone == null ? "" : phone).replace(/[^\d+]/g, "");
  if (!s) return "";
  if (s.indexOf("+84") === 0) s = "0" + s.slice(3);
  else if (s.indexOf("84") === 0 && s.length >= 10) s = "0" + s.slice(2);
  if (/^[35789]\d{8}$/.test(s)) s = "0" + s;
  if (s.charAt(0) === "0") s = "0" + s.replace(/^0+/, "");
  return "'" + s;
}

function ensurePhoneColumnText_(sheet) {
  var col = findHeaderCol_(sheet, ["dienthoai", "dien_thoai", "phone", "sdt"]);
  if (col < 0) return;
  var lastRow = Math.max(sheet.getLastRow(), 2);
  try { sheet.getRange(2, col + 1, lastRow, col + 1).setNumberFormat("@"); } catch (e) {}
}

function findHeaderCol_(sheet, names) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i] || "").toLowerCase().replace(/\s+/g, "");
    for (var j = 0; j < names.length; j++) {
      if (h === names[j]) return i;
    }
  }
  return -1;
}

function ensureOrderStatusColumn_(sheet) {
  var col = findHeaderCol_(sheet, ["trangthai", "status"]);
  if (col >= 0) return col;
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) {
    sheet.getRange(1, 1, 1, 12).setValues([["ThoiGian", "MaDon", "Ten", "DienThoai", "DiaChi", "GhiChu", "TongTien", "ChiTiet", "Loai", "TrangThai", "GhiChuNoiBo", "StatusLog"]]);
    return 9;
  }
  sheet.getRange(1, lastCol + 1).setValue("TrangThai");
  return lastCol;
}

function ensureInternalNoteColumn_(sheet) {
  var col = findHeaderCol_(sheet, ["ghichunoibo", "ghi_chu_noi_bo", "internalnote", "internal_note", "adminnote"]);
  if (col >= 0) return col;
  var lastCol = sheet.getLastColumn();
  sheet.getRange(1, lastCol + 1).setValue("GhiChuNoiBo");
  return lastCol;
}

function ensureStatusLogColumn_(sheet) {
  var col = findHeaderCol_(sheet, ["statuslog", "status_log", "lichsutrangthai", "lich_su_trang_thai"]);
  if (col >= 0) return col;
  var lastCol = sheet.getLastColumn();
  sheet.getRange(1, lastCol + 1).setValue("StatusLog");
  return lastCol;
}

function appendStatusLog_(sheet, rowIndex1, fromStatus, toStatus) {
  var logCol = ensureStatusLogColumn_(sheet);
  var now = Utilities.formatDate(new Date(), "Asia/Ho_Chi_Minh", "HH:mm");
  var prev = String(sheet.getRange(rowIndex1, logCol + 1).getValue() || "").trim();
  var entry = String(fromStatus || "?") + "→" + String(toStatus || "?") + " " + now;
  var next = prev ? (prev + " | " + entry) : entry;
  if (next.length > 220) next = next.slice(next.length - 220);
  sheet.getRange(rowIndex1, logCol + 1).setValue(next);
  return next;
}

function updateOrderInfo_(sheet, orderId, fields) {
  var idCol = findHeaderCol_(sheet, ["madon", "ma_don", "orderid", "order_id"]);
  if (idCol < 0) idCol = 1;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  var ids = sheet.getRange(2, idCol + 1, lastRow, idCol + 1).getValues();
  var want = String(orderId || "").trim().toLowerCase();
  var phoneCol = findHeaderCol_(sheet, ["dienthoai", "dien_thoai", "phone", "sdt"]);
  var addrCol = findHeaderCol_(sheet, ["diachi", "dia_chi", "address"]);
  var noteCol = findHeaderCol_(sheet, ["ghichu", "ghi_chu", "note"]);
  var nameCol = findHeaderCol_(sheet, ["ten", "name"]);
  var found = 0;
  for (var r = 0; r < ids.length; r++) {
    if (String(ids[r][0] || "").trim().toLowerCase() === want) {
      var row = r + 2;
      if (fields.phone != null && String(fields.phone) !== "" && phoneCol >= 0) {
        sheet.getRange(row, phoneCol + 1).setNumberFormat("@");
        sheet.getRange(row, phoneCol + 1).setValue(asPhoneText_(fields.phone));
      }
      if (fields.address != null && addrCol >= 0) sheet.getRange(row, addrCol + 1).setValue(String(fields.address));
      if (fields.note != null && noteCol >= 0) sheet.getRange(row, noteCol + 1).setValue(String(fields.note));
      if (fields.name != null && String(fields.name) !== "" && nameCol >= 0) sheet.getRange(row, nameCol + 1).setValue(String(fields.name));
      found++;
    }
  }
  return found > 0;
}

function updateOrderStatus_(sheet, orderId, status) {
  var statusCol = ensureOrderStatusColumn_(sheet);
  var idCol = findHeaderCol_(sheet, ["madon", "ma_don", "orderid", "order_id"]);
  if (idCol < 0) idCol = 1;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    logVcm_("updateOrderStatus_.emptySheet", sheet.getName());
    return false;
  }
  var ids = sheet.getRange(2, idCol + 1, lastRow, idCol + 1).getValues();
  var want = String(orderId || "").trim().toLowerCase();
  var found = 0;
  for (var r = 0; r < ids.length; r++) {
    if (String(ids[r][0] || "").trim().toLowerCase() === want) {
      var row = r + 2;
      var prev = String(sheet.getRange(row, statusCol + 1).getValue() || "Mới").trim() || "Mới";
      sheet.getRange(row, statusCol + 1).setValue(status);
      try { appendStatusLog_(sheet, row, prev, status); } catch (e) { logVcm_("statusLog.error", safeErr_(e)); }
      found++;
      logVcm_("updateOrderStatus_.ok", { orderId: orderId, row: row, from: prev, to: status, sheet: sheet.getName() });
    }
  }
  if (!found) logVcm_("updateOrderStatus_.notFound", { orderId: orderId, sheet: sheet.getName(), lastRow: lastRow, idCol: idCol });
  return found > 0;
}

function updateOrderInternalNote_(sheet, orderId, note) {
  var noteCol = ensureInternalNoteColumn_(sheet);
  var idCol = findHeaderCol_(sheet, ["madon", "ma_don", "orderid", "order_id"]);
  if (idCol < 0) idCol = 1;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  var ids = sheet.getRange(2, idCol + 1, lastRow, idCol + 1).getValues();
  var want = String(orderId || "").trim().toLowerCase();
  var found = 0;
  for (var r = 0; r < ids.length; r++) {
    if (String(ids[r][0] || "").trim().toLowerCase() === want) {
      sheet.getRange(r + 2, noteCol + 1).setValue(String(note || ""));
      found++;
    }
  }
  return found > 0;
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function findOrdersSheet_(ss, preferredName) {
  var names = [];
  if (preferredName && String(preferredName).trim()) names.push(String(preferredName).trim());
  names = names.concat(["DonHang", "Don hang", "Đơn hàng", "Bang_2", "Bảng_2", "Orders"]);
  for (var i = 0; i < names.length; i++) {
    var sh = ss.getSheetByName(names[i]);
    if (sh) return sh;
  }
  var sheets = ss.getSheets();
  for (var j = 0; j < sheets.length; j++) {
    var lastCol = sheets[j].getLastColumn();
    if (lastCol < 2) continue;
    var h = sheets[j].getRange(1, 1, 1, lastCol).getValues()[0];
    var lower = h.map(function (x) { return String(x || "").toLowerCase().replace(/\s+/g, ""); });
    if (lower.indexOf("madon") >= 0 || lower.indexOf("orderid") >= 0) return sheets[j];
  }
  return null;
}

function parsePostData_(e) {
  var data = {};
  var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : "";
  var ctype = (e && e.postData && e.postData.type) ? String(e.postData.type) : "";
  if (raw) {
    try {
      if (ctype.indexOf("application/json") >= 0 || raw.trim().charAt(0) === "{") data = JSON.parse(raw);
      else {
        var parts = raw.split("&");
        for (var i = 0; i < parts.length; i++) {
          var kv = parts[i].split("=");
          if (kv.length >= 2) {
            data[decodeURIComponent(kv[0].replace(/\+/g, " "))] = decodeURIComponent(kv.slice(1).join("=").replace(/\+/g, " "));
          }
        }
      }
    } catch (err) {
      try { data = JSON.parse(raw); } catch (e2) { data = {}; }
    }
  }
  if (e && e.parameter) {
    var keys = Object.keys(e.parameter);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      if (data[key] === undefined || data[key] === null || data[key] === "") data[key] = e.parameter[key];
    }
  }
  return data;
}

function doPost(e) {
  try {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var data = parsePostData_(e);
  var action = String((data && data.action) || (e && e.parameter && e.parameter.action) || "").trim();
  logVcm_("doPost.start", {
    action: action,
    orderId: data.orderId || "",
    status: data.status || "",
    hasBody: !!(e && e.postData && e.postData.contents),
    ctype: (e && e.postData && e.postData.type) || "",
    keys: Object.keys(data || {}).slice(0, 24),
    _vcmUpdateOnly: data._vcmUpdateOnly,
    paramAction: (e && e.parameter && e.parameter.action) || ""
  });
  if (data._vcmUpdateOnly === true || data._vcmUpdateOnly === "true" || data._vcmUpdateOnly === "1") {
    if (!action) action = (data.internalNote !== undefined) ? "updateInternalNote" : "updateStatus";
    logVcm_("doPost.forceUpdateOnly", action);
  }
  var hasCustomer = !!(String(data.phone || "").trim() || String(data.name || "").trim());
  var hasItems = !!(String(data.items || "").trim() || String(data.itemsJson || "").trim());
  var hasOrderId = !!(String(data.orderId || "").trim());
  var hasStatusField = (data.status !== undefined && data.status !== null && String(data.status) !== "");
  var hasNoteField = (data.internalNote !== undefined);
  if (!action && hasOrderId && !hasCustomer && !hasItems) {
    if (hasNoteField && !hasStatusField) action = "updateInternalNote";
    else if (hasStatusField) action = "updateStatus";
    else if (hasNoteField) action = "updateInternalNote";
    logVcm_("doPost.inferAction", action);
  }
  if (!action && hasOrderId && hasStatusField && !hasItems) {
    action = "updateStatus";
    logVcm_("doPost.inferStatusUpdate", data.orderId);
  }
  var preferredSheet = data.ordersSheetName || data.sheetName || "";
  if (action === "updateStatus") {
    var ordersUp = findOrdersSheet_(ss, preferredSheet);
    if (!ordersUp) {
      logVcm_("updateStatus.noSheet", preferredSheet);
      return jsonOut_({ ok: false, error: "Khong tim thay tab don hang", action: "updateStatus" });
    }
    var st = String(data.status || "Mới").trim() || "Mới";
    var okUp = updateOrderStatus_(ordersUp, data.orderId, st);
    logVcm_("updateStatus.result", { ok: okUp, orderId: data.orderId, status: st, sheet: ordersUp.getName() });
    if (!okUp) {
      return jsonOut_({ ok: false, error: "Khong tim thay MaDon: " + String(data.orderId || ""), action: "updateStatus", sheet: ordersUp.getName(), created: false });
    }
    return jsonOut_({ ok: true, action: "updateStatus", sheet: ordersUp.getName(), created: false });
  }
  if (action === "updateOrderInfo") {
    var ordersInfo = findOrdersSheet_(ss, preferredSheet);
    if (!ordersInfo) {
      logVcm_("updateOrderInfo.noSheet", preferredSheet);
      return jsonOut_({ ok: false, error: "Khong tim thay tab don hang", action: "updateOrderInfo" });
    }
    var okInfo = updateOrderInfo_(ordersInfo, data.orderId, { phone: data.phone, address: data.address, note: data.note, name: data.name });
    logVcm_("updateOrderInfo.result", { ok: okInfo, orderId: data.orderId });
    return jsonOut_({ ok: okInfo, action: "updateOrderInfo", sheet: ordersInfo.getName(), created: false, error: okInfo ? undefined : ("Khong tim thay MaDon: " + String(data.orderId || "")) });
  }
  if (action === "updateInternalNote") {
    var ordersNote = findOrdersSheet_(ss, preferredSheet);
    if (!ordersNote) {
      logVcm_("updateInternalNote.noSheet", preferredSheet);
      return jsonOut_({ ok: false, error: "Khong tim thay tab don hang", action: "updateInternalNote" });
    }
    var okNote = updateOrderInternalNote_(ordersNote, data.orderId, data.internalNote || "");
    logVcm_("updateInternalNote.result", { ok: okNote, orderId: data.orderId });
    return jsonOut_({ ok: okNote, action: "updateInternalNote", sheet: ordersNote.getName(), created: false, error: okNote ? undefined : ("Khong tim thay MaDon: " + String(data.orderId || "")) });
  }
  if (action) {
    logVcm_("doPost.unknownAction", action);
    return jsonOut_({ ok: false, error: "Action khong ho tro: " + action });
  }
  if (!hasCustomer && !hasItems) {
    logVcm_("doPost.reject", "Thieu du lieu don hang");
    return jsonOut_({ ok: false, error: "Thieu du lieu don hang" });
  }
  if (hasOrderId && !hasCustomer) {
    logVcm_("doPost.reject", "Thieu ten/SDT khach");
    return jsonOut_({ ok: false, error: "Thieu ten/SDT khach" });
  }

  if (hasOrderId) {
    var ordersChk = findOrdersSheet_(ss, preferredSheet);
    if (ordersChk) {
      var idColChk = findHeaderCol_(ordersChk, ["madon", "ma_don", "orderid", "order_id"]);
      if (idColChk < 0) idColChk = 1;
      var lastR = ordersChk.getLastRow();
      if (lastR >= 2) {
        var wantId = String(data.orderId || "").trim().toLowerCase();
        var idVals = ordersChk.getRange(2, idColChk + 1, lastR, idColChk + 1).getValues();
        for (var ri = 0; ri < idVals.length; ri++) {
          if (String(idVals[ri][0] || "").trim().toLowerCase() === wantId) {
            if (hasStatusField) {
              var stE = String(data.status || "Mới").trim() || "Mới";
              updateOrderStatus_(ordersChk, data.orderId, stE);
            }
            logVcm_("doPost.upsertSkipCreate", { orderId: data.orderId, row: ri + 2, sheet: ordersChk.getName() });
            return jsonOut_({ ok: true, action: "upsert-skip-create", sheet: ordersChk.getName(), row: ri + 2, created: false });
          }
        }
      }
    }
  }

  logVcm_("doPost.createOrder", { orderId: data.orderId, name: data.name, phone: data.phone });
  var orders = findOrdersSheet_(ss, preferredSheet);
  if (!orders) {
    orders = ss.insertSheet("DonHang");
    orders.appendRow(["ThoiGian", "MaDon", "Ten", "DienThoai", "DiaChi", "GhiChu", "TongTien", "ChiTiet", "Loai", "TrangThai", "GhiChuNoiBo", "StatusLog"]);
  } else {
    ensureOrderStatusColumn_(orders);
    ensureInternalNoteColumn_(orders);
    ensureStatusLogColumn_(orders);
    ensurePhoneColumnText_(orders);
  }
  var lastCol = Math.max(orders.getLastColumn(), 10);
  var headers = orders.getRange(1, 1, 1, lastCol).getValues()[0];
  var row = [];
  for (var c = 0; c < headers.length; c++) {
    var h = String(headers[c] || "").toLowerCase().replace(/\s+/g, "");
    if (h === "thoigian" || h === "thoi_gian" || h === "time") row.push(new Date());
    else if (h === "madon" || h === "ma_don" || h === "orderid" || h === "order_id") row.push(data.orderId || "");
    else if (h === "ten" || h === "name") row.push(data.name || "");
    else if (h === "dienthoai" || h === "dien_thoai" || h === "phone" || h === "sdt") row.push(asPhoneText_(data.phone));
    else if (h === "diachi" || h === "dia_chi" || h === "address") row.push(data.address || "");
    else if (h === "ghichu" || h === "ghi_chu" || h === "note") row.push(data.note || "");
    else if (h === "tongtien" || h === "tong_tien" || h === "total") row.push(data.total || "");
    else if (h === "chitiet" || h === "chi_tiet" || h === "items") row.push(data.items || "");
    else if (h === "loai" || h === "type") row.push(data.type || "");
    else if (h === "trangthai" || h === "status") row.push(data.status || "Moi");
    else if (h === "ghichunoibo" || h === "ghi_chu_noi_bo" || h === "internalnote") row.push(data.internalNote || "");
    else if (h === "statuslog" || h === "status_log") row.push("");
    else row.push("");
  }
  if (row.length === 0) {
    orders.appendRow([new Date(), data.orderId, data.name, asPhoneText_(data.phone), data.address, data.note, data.total, data.items, data.type, data.status || "Moi", "", ""]);
  } else orders.appendRow(row);
  var alerts = [];
  try {
    if (data.itemsJson) {
      var lines = JSON.parse(data.itemsJson);
      var productSheet = findProductSheet_(ss);
      if (productSheet) alerts = decrementStock_(productSheet, lines) || [];
    }
  } catch (err) { logVcm_("stock.error", safeErr_(err)); }
  try { sendOrderEmail_(data); } catch (errN) { logVcm_("email.error", safeErr_(errN)); }
  try { if (alerts.length > 0) sendStockAlertEmail_(alerts, data.orderId || ""); } catch (err2) { logVcm_("stockAlert.error", safeErr_(err2)); }
  logVcm_("doPost.created", { orderId: data.orderId, alerts: alerts.length });
  return jsonOut_({ ok: true, alerts: alerts.length, created: true });
  } catch (fatal) {
    logVcm_("doPost.FATAL", safeErr_(fatal));
    return jsonOut_({ ok: false, error: "Loi he thong: " + safeErr_(fatal) });
  }
}

function sendOrderEmail_(data) {
  var to = getAlertEmail_();
  if (!to) return;
  var when = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  var body = "[" + SHOP_NAME + "] DON MOI " + (data.orderId || "") + "\nLuc: " + when + "\nTen: " + (data.name || "") + "\nSDT: " + (data.phone || "") + (data.address ? "\nDia chi: " + data.address : "") + (data.note ? "\nGhi chu: " + data.note : "") + "\nMon: " + (data.items || "") + "\nTong: " + (data.total || "");
  MailApp.sendEmail({ to: to, subject: "[" + SHOP_NAME + "] Don moi " + (data.orderId || "") + " — " + (data.phone || ""), body: body });
}

function getAlertEmail_() {
  try {
    var prop = PropertiesService.getScriptProperties().getProperty("ALERT_EMAIL");
    if (prop && String(prop).indexOf("@") > 0) return String(prop).trim();
  } catch (e) {}
  if (ALERT_EMAIL && ALERT_EMAIL.indexOf("@") > 0) return ALERT_EMAIL.trim();
  try { return Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || ""; } catch (e2) { return ""; }
}

function findProductSheet_(ss) {
  var names = ["san-pham-vuon-cua-mit", "SanPham", "San pham", "sanpham"];
  for (var i = 0; i < names.length; i++) {
    var sh = ss.getSheetByName(names[i]);
    if (sh) return sh;
  }
  return null;
}

function normalizeHeader_(h) { return String(h).toLowerCase().trim().replace(/\s+/g, "_"); }

function decrementStock_(sheet, lines) {
  var lastCol = sheet.getLastColumn();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(normalizeHeader_);
  var idCol = headers.indexOf("id"); if (idCol < 0) idCol = headers.indexOf("ma");
  var nameCol = headers.indexOf("ten"); if (nameCol < 0) nameCol = headers.indexOf("name");
  var stockCol = headers.indexOf("ton_kho"); if (stockCol < 0) stockCol = headers.indexOf("tonkho");
  var inStockCol = headers.indexOf("con_hang");
  if (idCol < 0 || stockCol < 0) return [];
  var data = sheet.getRange(2, 1, lastRow, lastCol).getValues();
  var idToRow = {};
  for (var r = 0; r < data.length; r++) idToRow[String(data[r][idCol]).trim()] = r;
  var alerts = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var pid = String(line.productId || "").trim();
    var qty = Number(line.qty) || 0;
    if (!pid || qty <= 0) continue;
    var idx = idToRow[pid];
    if (idx === undefined) continue;
    var cell = data[idx][stockCol];
    if (cell === "" || cell === null) continue;
    var cur = Number(cell);
    if (!isFinite(cur)) continue;
    var next = Math.max(0, cur - qty);
    data[idx][stockCol] = next;
    sheet.getRange(idx + 2, stockCol + 1).setValue(next);
    if (next <= 0 && inStockCol >= 0) sheet.getRange(idx + 2, inStockCol + 1).setValue(0);
    var pname = nameCol >= 0 ? String(data[idx][nameCol] || pid) : pid;
    if (next <= 0 && cur > 0) alerts.push({ id: pid, name: pname, stock: 0, kind: "het", before: cur });
    else if (next > 0 && next <= LOW_STOCK_THRESHOLD && cur > LOW_STOCK_THRESHOLD) alerts.push({ id: pid, name: pname, stock: next, kind: "sap_het", before: cur });
  }
  return alerts;
}

function sendStockAlertEmail_(alerts, context) {
  var to = getAlertEmail_();
  if (!to || !alerts.length) return;
  var body = "Canh bao ton kho " + SHOP_NAME + "\n" + (context || "") + "\n" + alerts.map(function(a){ return a.kind + " " + a.name + " -> " + a.stock; }).join("\n");
  MailApp.sendEmail({ to: to, subject: "[" + SHOP_NAME + "] Canh bao ton kho", body: body });
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu("Vuon Cua Mit").addItem("Thiet lap Sheet", "setupShopSheets").addToUi();
}

function setupShopSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var orders = ss.getSheetByName("DonHang") || ss.insertSheet("DonHang");
  ensureOrderStatusColumn_(orders);
  ensureInternalNoteColumn_(orders);
  ensureStatusLogColumn_(orders);
  ensurePhoneColumnText_(orders);
  SpreadsheetApp.getUi().alert("Da thiet lap DonHang");
}
