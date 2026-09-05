# Tự động hóa báo cáo — Vườn Của Mít

## Đã có trên web
- Trang `/bao-cao` và tab Báo cáo trong `/quan-ly`
- So sánh hôm nay / hôm qua / 3 ngày / tuần / tháng
- Xuất Excel CSV
- Nút **Đồng bộ → Sheet BaoCao** (cần Apps Script hỗ trợ `saveReport`)

## Tự động mỗi ngày 21:00 (giờ VN)

### Bước 1 — Dán code
1. Mở Google Sheet **sản phẩm** (file có tab `DonHang`)
2. **Tiện ích mở rộng → Apps Script**
3. Mở file addon trên repo: `public/apps-script-auto-report.gs`
4. **Dán toàn bộ** vào cuối project Apps Script (cùng project với webhook đơn hàng)
5. Lưu (Ctrl+S)

### Bước 2 — Hẹn giờ
1. Trong Apps Script, chọn hàm `setupDailyReportTrigger` → **Run**
2. Cho phép quyền (Sheets + Gmail) nếu hỏi
3. Hoặc: **Triggers** (đồng hồ) → Add trigger → `autoDailyReport` → Day timer → 21:00–22:00 → Timezone Asia/Ho_Chi_Minh

### Bước 3 — Thử ngay
- Chạy hàm `runReportNow`
- Kiểm tra tab **BaoCao** trên Sheet + email `trixd2026@gmail.com`

### Tab BaoCao (tự tạo)
| Cột | Ý nghĩa |
|------|----------|
| Ngay | yyyy-MM-dd |
| DonHomNay / DTHomNay | Số đơn & doanh thu hôm nay |
| DonHomQua / DTHomQua | Hôm qua |
| DonTuan / DTTuan | 7 ngày |
| DonThang / DTThang | 30 ngày |
| PctVsHomQua | % DT so với hôm qua |

Mỗi ngày 1 dòng (ghi đè nếu chạy lại cùng ngày).

### Email mẫu
```
[Vuon Cua Mit] Bao cao 2026-09-05
Hom nay: 4 don · 778.000d
Hom qua: 0 don · 0d
...
```

## Ghi chú
- Script đọc **tab DonHang** trên **cùng spreadsheet** gắn Apps Script
- Đổi email: sửa `ALERT_EMAIL` ở đầu `apps-script.gs`
- Webhook web chỉ ghi được BaoCao nếu đã thêm block `saveReport` trong `doPost`
