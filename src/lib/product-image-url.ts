/**
 * Chuẩn hóa cột `hinh` trên Google Sheet → đường dẫn ảnh local.
 *
 * Chỉ dùng file trong `public/products/`:
 * - `/products/HV09.jpg`
 * - `products/HV09.jpg`
 * - `HV09.jpg`
 *
 * Không dùng Google Drive / link ngoài.
 */

const FALLBACK = "/products/hero.jpg";

/**
 * Chuẩn hóa giá trị cột `hinh` thành `/products/...` dùng trong <img src>.
 */
export function normalizeProductImageUrl(raw: string | undefined | null): string {
  const s = (raw ?? "").trim();
  if (!s) return FALLBACK;

  // Đã đúng dạng /products/...
  if (s.startsWith("/products/")) return s;

  // products/xxx.jpg → /products/xxx.jpg
  if (s.startsWith("products/")) return `/${s}`;

  // Chỉ tên file: HV09.jpg / GC04.JPG
  if (!s.includes("://") && !s.startsWith("/") && /\.(jpe?g|png|webp|gif|avif)$/i.test(s)) {
    return `/products/${s}`;
  }

  // /HV09.jpg (thiếu products) → /products/HV09.jpg
  if (s.startsWith("/") && !s.startsWith("/products/") && /\.(jpe?g|png|webp|gif|avif)$/i.test(s)) {
    const name = s.replace(/^\//, "");
    return `/products/${name}`;
  }

  // Link Drive / http cũ trên Sheet → không dùng, về fallback
  // (tránh ảnh gãy; user sửa cột hinh = /products/MA.jpg + upload file)
  if (/^https?:\/\//i.test(s) || s.includes("drive.google") || s.includes("docs.google")) {
    return FALLBACK;
  }

  return FALLBACK;
}

export function isRemoteImageUrl(src: string): boolean {
  return /^https?:\/\//i.test(src);
}
