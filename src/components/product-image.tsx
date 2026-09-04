import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { normalizeProductImageUrl, isRemoteImageUrl } from "@/lib/product-image-url";

const FALLBACK = "/products/hero.jpg";

export function ProductImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const resolved = normalizeProductImageUrl(src);
  const [current, setCurrent] = useState(resolved);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setCurrent(normalizeProductImageUrl(src));
    setFailed(false);
  }, [src]);

  return (
    <img
      src={failed ? FALLBACK : current}
      alt={alt}
      className={cn("h-full w-full object-cover", className)}
      loading="lazy"
      decoding="async"
      // Drive / một số CDN cần no-referrer để hiện ảnh
      referrerPolicy={isRemoteImageUrl(current) ? "no-referrer" : undefined}
      onError={() => {
        if (!failed && current !== FALLBACK) {
          setFailed(true);
          setCurrent(FALLBACK);
        }
      }}
    />
  );
}
