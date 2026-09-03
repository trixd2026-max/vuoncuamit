# Vườn Của Mít

Website bán trái cây vườn, giỏ quà, tráp cưới hỏi và hoa viếng tang của **Chị Hằng** — Xóm 1B, Thôn Phụng Sơn, xã Tuy Phước Đông, tỉnh Gia Lai.

**Live:** [https://vuoncuamit.vercel.app](https://vuoncuamit.vercel.app)

## Tính năng chính

- **Cửa hàng** — danh mục sản phẩm (trái cây theo mùa, giỏ quà, tráp cưới, hoa viếng)
- **Đặt giỏ trái cây** — chọn mức giá theo dịp (kính cúng, biếu tặng, sinh nhật, …)
- **Tráp cưới hỏi** — set 5 / 7 / 9 tráp
- **Giỏ hàng + thanh toán** — form đặt hàng, chọn ngày/giờ giao hoặc tự đến lấy
- **Tra cứu đơn** — khách nhập SĐT để xem trạng thái đơn
- **Quản lý đơn hàng (`/quan-ly`)** — trang admin bảo vệ bằng PIN:
  - Đồng bộ sản phẩm & tồn kho từ Google Sheet
  - Xem / lọc đơn gần đây (ngày, trạng thái, SĐT)
  - Cập nhật trạng thái đơn & ghi chú nội bộ
  - In phiếu giao
  - Cấu hình webhook Apps Script, tải CSV mẫu
- Liên hệ nhanh Zalo / Facebook Messenger / gọi điện

## Công nghệ

| Thành phần | Công nghệ |
|---|---|
| Frontend | React 19, TanStack Router / Start, Tailwind CSS 4 |
| UI | Radix UI, Lucide icons, Sonner toast |
| State | Zustand (giỏ hàng), TanStack Query |
| Dữ liệu sản phẩm | Google Sheet (CSV export) + fallback local |
| Đơn hàng | Google Sheet qua Apps Script webhook |
| Auth admin | PIN client-side (sessionStorage, 12h) |
| Deploy | Vercel |

## Cấu trúc thư mục quan trọng

```
src/
  routes/           # Các trang (file-based routing)
    index.tsx       # Trang chủ
    cua-hang.tsx
    gio-trai-cay.tsx
    trap-cuoi-hoi.tsx
    gio-hang.tsx / thanh-toan.tsx / dat-xong.tsx
    tra-cuu-don.tsx
    quan-ly.tsx     # Admin — bắt buộc nhập PIN
  components/
    layout/         # Header, footer, mobile tabbar, shell
  lib/
    shop.ts         # Thông tin shop, mức giá, slot giao hàng
    catalog.ts      # Sản phẩm local + parse CSV
    sheet.ts        # Fetch catalog & order helpers
    admin-gate.ts   # PIN / session admin
    orders.ts       # Kiểu đơn, trạng thái, format
    cart.ts         # Giỏ hàng (Zustand + localStorage)
public/
  apps-script.gs    # Mã Apps Script mẫu để copy vào Google
  products/         # Ảnh sản phẩm
```

## Chạy local

```bash
npm install
npm run dev          # http://0.0.0.0:8080
```

Các lệnh khác:

```bash
npm run build        # Build production + migrate DB (nếu có)
npm run typecheck
npm run lint
```

## Trang Quản lý (`/quan-ly`)

- **PIN mặc định:** `662166` (6 số cuối SĐT shop). Nên đổi ngay sau lần đầu vào.
- Session lưu trong `sessionStorage`, hết hạn sau 12 giờ.
- Link **Quản lý đơn hàng** nằm trong footer (Mục lục), giữa “Tra cứu đơn” và “Facebook”.
- Trang **luôn** hiện form nhập PIN nếu chưa mở khóa — không bypass được qua URL.

### Kết nối Google Sheet

1. Tạo Sheet với 2 tab: sản phẩm (mặc định `SanPham`) và đơn hàng (mặc định `DonHang`).
2. Chia sẻ “Bất kỳ ai có liên kết” (viewer).
3. Vào `/quan-ly` → nhập Sheet ID / CSV URL / tên tab / gid → **Lưu và đồng bộ**.
4. Deploy Apps Script (copy từ trang quản lý hoặc `public/apps-script.gs`) để nhận đơn và trừ tồn kho.

## Biến môi trường / cấu hình

Cấu hình Sheet & webhook được lưu trên trình duyệt (localStorage) qua trang `/quan-ly`. Không cần file `.env` cho vận hành cơ bản.

## Liên hệ shop

- Zalo / Điện thoại: **0345 662 166** (Chị Hằng)
- Điện thoại 2: 0942 223 984
- Facebook: [profile](https://www.facebook.com/profile.php?id=61579721713679)
- Địa chỉ: Xóm 1B, Thôn Phụng Sơn, xã Tuy Phước Đông, tỉnh Gia Lai
- Giờ mở cửa: 7:00 – 20:00 hàng ngày

## Ghi chú phát triển

- Ảnh sản phẩm ưu tiên đặt trong `public/products/`.
- Khi sửa footer / header, kiểm tra cả desktop và mobile tabbar.
- Admin gate là client-side — đủ cho shop nhỏ; nếu cần bảo mật cao hơn có thể nâng cấp sang Better Auth (đã có sẵn trong monorepo scaffold).
