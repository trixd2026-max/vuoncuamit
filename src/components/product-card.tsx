import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import type { Product } from "@/lib/catalog";
import { categoryLabel, salePrice } from "@/lib/catalog";
import { isAvailable, maxOrderQty, stockLabel } from "@/lib/inventory";
import { useCart } from "@/lib/cart";
import { formatVnd } from "@/lib/format";
import { ProductImage } from "./product-image";

export function ProductCard({ product }: { product: Product }) {
  const add = useCart((s) => s.add);
  const price = salePrice(product);
  const available = isAvailable(product);
  const label = stockLabel(product);

  return (
    <article className="group flex flex-col">
      <Link
        to="/san-pham/$id"
        params={{ id: product.id }}
        className="relative block overflow-hidden rounded-xl bg-muted"
      >
        <div className="aspect-portrait overflow-hidden">
          <ProductImage
            src={product.image}
            alt={product.name}
            className={`transition-transform duration-500 ease-out group-hover:scale-[1.03] ${!available ? "opacity-60 grayscale" : ""}`}
          />
        </div>
        {!available ? (
          <span className="absolute top-3 left-3 rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
            Hết hàng
          </span>
        ) : label && label.startsWith("Sắp hết") ? (
          <span className="absolute top-3 left-3 rounded-full bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
            {label}
          </span>
        ) : product.featured ? (
          <span className="absolute top-3 left-3 rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground">
            Đang bán chạy
          </span>
        ) : null}
      </Link>
      <div className="flex flex-1 flex-col gap-1 pt-3">
        <p className="text-xs tracking-wide text-muted-foreground uppercase">
          {categoryLabel(product.category)}
        </p>
        <Link
          to="/san-pham/$id"
          params={{ id: product.id }}
          className="font-display text-lg leading-snug text-foreground"
        >
          {product.name}
        </Link>
        {label && available ? (
          <p className={`text-xs ${label.startsWith("Sắp hết") ? "font-medium text-amber-700" : "text-muted-foreground"}`}>
            {label}
          </p>
        ) : !available ? (
          <p className="text-xs font-medium text-red-600">Hết hàng — gọi đặt trước</p>
        ) : null}
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <p className="text-sm tabular-nums">
            {formatVnd(price)}
            <span className="text-muted-foreground">/{product.unit}</span>
          </p>
          <button
            type="button"
            disabled={!available}
            aria-label={`Thêm ${product.name}`}
            className="grid size-11 place-items-center rounded-full bg-primary text-primary-foreground transition-transform duration-150 enabled:active:scale-[0.96] disabled:opacity-40"
            onClick={() => {
              add(product, 1);
              toast.success(`Đã thêm ${product.name}`);
            }}
          >
            <Plus className="size-4" />
          </button>
        </div>
      </div>
    </article>
  );
}
