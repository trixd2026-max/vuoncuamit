# Tự động hóa báo cáo — Vườn Của Mít

## Đã có trên web
- Trang `/bao-cao` và tab Báo cáo trong `/quan-ly`
- So sánh hôm nay / hôm qua / 3 ngày / tuần / tháng
- Xuất Excel CSV
- Nút **Đồng bộ → Sheet BaoCao**

## Tự động mỗi ngày 21:00 (giờ VN)

### Bước 1 — Dán code
1. Mở Google Sheet **sản phẩm** (file có tab `DonHang`)
2. **Tiện ích mở rộng → Apps Script**
3. Mở file trên GitHub: `public/apps-script-auto-report.gs`
4. **Dán toàn bộ** vào **cuối** project Apps Script (cùng project webhook đơn)
5. Lưu (Ctrl+S)

### Bước 2 — Hẹn giờ
1. Trong Apps Script chọn hàm `setupDailyReportTrigger` → **Run**
2. Cho phép quyền Sheets + Gmail nếu hỏi
3. Hoặc: Triggers → Add trigger → `autoDailyReport` → Day timer → ~21:00 → Timezone **Asia/Ho_Chi_Minh**

### Bước 3 — Thử ngay
- Chạy `runReportNow`
- Kiểm tra tab **BaoCao** + email `trixd2026@gmail.com`

### Tab BaoCao
| Cột | Ý nghĩa |
|------|----------|
| Ngay | yyyy-MM-dd |
| DonHomNay / DTHomNay | Đơn & DT hôm nay |
| DonHomQua / DTHomQua | Hôm qua |
| DonTuan / DTTuan | 7 ngày |
| DonThang / DTThang | 30 ngày |
| PctVsHomQua | % so với hôm qua |

Mỗi ngày 1 dòng (ghi đè nếu chạy lại cùng ngày).

## Ghi chú
- Đọc tab **DonHang** trên cùng spreadsheet gắn Apps Script
- Đổi email: sửa `ALERT_EMAIL` trong script gốc
