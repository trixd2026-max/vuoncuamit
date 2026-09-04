import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/product-card";
import { ProductImage } from "@/components/product-image";
import { QtyControl } from "@/components/qty-control";
import { useCatalog, findProduct } from "@/lib/catalog-store";
import { categoryLabel, salePrice } from "@/lib/catalog";
import { isAvailable, maxOrderQty, stockLabel } from "@/lib/inventory";
import { useCart } from "@/lib/cart";
import { formatVnd } from "@/lib/format";
import { SHOP } from "@/lib/shop";
import { copyAndOpenZalo } from "@/lib/zalo";

export const Route = createFileRoute("/san-pham/$id")({
  component: ProductPage,
});

function ProductPage() {
  const { id } = Route.useParams();
  const products = useCatalog((s) => s.products);
  const loading = useCatalog((s) => s.loading);
  const loaded = useCatalog((s) => s.loaded);
  const load = useCatalog((s) => s.load);
  const product = findProduct(products, id);
  const add = useCart((s) => s.add);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    void load();
  }, [load]);

  if (!loaded && loading) {
    return (
      <main className="mx-auto max-w-xl px-4 py-20 text-center text-muted-foreground">
        Đang tải sản phẩm…
      </main>
    );
  }

  if (!product) {
    return (
      <main className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="font-display text-3xl">Không tìm thấy món này</h1>
        <Button asChild className="mt-6">
          <Link to="/cua-hang">Về cửa hàng</Link>
        </Button>
      </main>
    );
  }

  const price = salePrice(product);
  const available = isAvailable(product);
  const maxQty = maxOrderQty(product);
  const label = stockLabel(product);
  const related = products
    .filter((p) => p.category === product.category && p.id !== product.id && isAvailable(p))
    .slice(0, 4);
  const askText = `Chị ơi, em hỏi ${product.name} (${formatVnd(price)}/${product.unit}) còn hàng không ạ?`;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <p className="text-xs text-muted-foreground">
        <Link to="/cua-hang">Cửa hàng</Link>
        <span className="px-2">/</span>
        {categoryLabel(product.category)}
      </p>
      <div className="mt-6 grid gap-10 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl bg-muted">
          <div className="aspect-portrait">
            <ProductImage src={product.image} alt={product.name} />
          </div>
        </div>
        <div>
          <p className="text-xs tracking-wide text-muted-foreground uppercase">
            {categoryLabel(product.category)}
          </p>
          <h1 className="font-display mt-2 text-4xl">{product.name}</h1>
          <p className="mt-4 text-2xl tabular-nums">
            {formatVnd(price)}
            <span className="text-base text-muted-foreground">/{product.unit}</span>
          </p>
          {label ? (
            <p className={`mt-2 text-sm ${available ? "text-muted-foreground" : "text-destructive"}`}>
              {label}
            </p>
          ) : null}
          <p className="mt-4 max-w-prose text-muted-foreground">{product.description}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <QtyControl
              value={Math.min(qty, maxQty)}
              onChange={(v) => setQty(Math.min(Math.max(1, v), maxQty))}
            />
            <Button
              size="lg"
              disabled={!available}
              onClick={() => {
                const q = Math.min(qty, maxQty);
                add(product, q);
                toast.success(`Đã thêm ${product.name}`);
              }}
            >
              Thêm vào giỏ
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() => {
                void copyAndOpenZalo(askText).then((copied) => {
                  if (copied) toast.message("Đã copy câu hỏi — dán vào Zalo");
                });
              }}
            >
              Nhắn Zalo hỏi hàng
            </Button>
            <Button asChild variant="ghost">
              <a href={`tel:${SHOP.phone}`}>Gọi {SHOP.phoneDisplay}</a>
            </Button>
          </div>
          {!available ? (
            <p className="mt-4 text-sm text-destructive">Tạm hết — gọi để đặt trước.</p>
          ) : null}
        </div>
      </div>
      {related.length > 0 ? (
        <section className="mt-16">
          <h2 className="font-display text-2xl">Cùng nhóm</h2>
          <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
