/**
 * Chuẩn hóa URL ảnh sản phẩm từ cột `hinh` trên Google Sheet.
 *
 * Hỗ trợ:
 * - Đường dẫn local: /products/xxx.jpg (file trong public/)
 * - URL https trực tiếp (CDN, ImgBB, Cloudinary, …)
 * - Link Google Drive chia sẻ → chuyển thành URL xem trực tiếp
 * - Chỉ dán FILE_ID của Drive (chuỗi ~25–44 ký tự)
 * - Tên file trần: HV09.jpg → /products/HV09.jpg
 */

const FALLBACK = "/products/hero.jpg";

/** ID file Drive: chữ/số/_/- dài khoảng 25–44 */
const DRIVE_ID_RE = /^[a-zA-Z0-9_-]{25,44}$/;

function extractDriveId(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  // https://drive.google.com/file/d/FILE_ID/...
  let m = s.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];

  // https://drive.google.com/open?id=FILE_ID
  // https://drive.google.com/uc?id=FILE_ID&export=...
  m = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];

  // https://drive.google.com/uc?export=view&id=FILE_ID
  m = s.match(/drive\.google\.com\/uc\?[^#]*id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];

  // Chỉ dán ID
  if (DRIVE_ID_RE.test(s)) return s;

  return null;
}

/** URL xem ảnh trực tiếp từ Drive (cần chia sẻ “Bất kỳ ai có liên kết”) */
function driveViewUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=view&id=${fileId}`;
}

/**
 * Chuẩn hóa giá trị cột `hinh` thành URL dùng được trong <img src>.
 */
export function normalizeProductImageUrl(raw: string | undefined | null): string {
  const s = (raw ?? "").trim();
  if (!s) return FALLBACK;

  // Local path trong public/
  if (s.startsWith("/products/")) return s;
  if (s.startsWith("products/")) return `/${s}`;

  // Protocol-relative
  if (s.startsWith("//")) return `https:${s}`;

  const lower = s.toLowerCase();

  // Google Drive
  if (
    lower.includes("drive.google.com") ||
    lower.includes("docs.google.com") ||
    DRIVE_ID_RE.test(s)
  ) {
    const id = extractDriveId(s);
    if (id) return driveViewUrl(id);
  }

  // URL http/https đầy đủ (ImgBB, Cloudinary, Firebase, CDN…)
  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    return s;
  }

  // Tên file không có / → coi như trong /products/
  if (!s.includes("://") && /\.(jpe?g|png|webp|gif|avif)$/i.test(s)) {
    const name = s.replace(/^\/+/, "");
    return name.startsWith("products/") ? `/${name}` : `/products/${name}`;
  }

  // /HV09.jpg (thiếu products)
  if (s.startsWith("/") && /\.(jpe?g|png|webp|gif|avif)$/i.test(s)) {
    return `/products/${s.replace(/^\//, "")}`;
  }

  return FALLBACK;
}

export function isRemoteImageUrl(src: string): boolean {
  return /^https?:\/\//i.test(src);
}
