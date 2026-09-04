import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { normalizeProductImageUrl } from "@/lib/product-image-url";

const FALLBACK = "/products/hero.jpg";

/** Khi file chưa kịp deploy lên Vercel, lấy từ GitHub qua jsDelivr */
const GH_CDN =
  "https://cdn.jsdelivr.net/gh/trixd2026-max/vuoncuamit@main/public";

function cdnFallback(localSrc: string): string | null {
  // /products/HV09.jpg → CDN
  if (localSrc.startsWith("/products/")) {
    return `${GH_CDN}${localSrc}`;
  }
  return null;
}

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
  const [stage, setStage] = useState<"primary" | "cdn" | "fallback">("primary");

  useEffect(() => {
    setCurrent(normalizeProductImageUrl(src));
    setStage("primary");
  }, [src]);

  return (
    <img
      src={current}
      alt={alt}
      className={cn("h-full w-full object-cover", className)}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        if (stage === "primary") {
          const cdn = cdnFallback(resolved);
          if (cdn) {
            setStage("cdn");
            setCurrent(cdn);
            return;
          }
        }
        if (stage !== "fallback" && current !== FALLBACK) {
          setStage("fallback");
          setCurrent(FALLBACK);
        }
      }}
    />
  );
}
