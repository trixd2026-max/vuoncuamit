import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { SHOP } from "@/lib/shop";
import { ZaloMark } from "@/components/zalo-icon";
import { qrImageUrl } from "@/lib/zalo";
import { MapPin, Navigation } from "lucide-react";

export const Route = createFileRoute("/lien-he")({ component: ContactPage });

/** Embed Google Maps (search query) — không cần API key */
const MAPS_EMBED =
  "https://www.google.com/maps?q=" +
  encodeURIComponent("Vườn Của Mít Thôn Phụng Sơn xã Tuy Phước Đông tỉnh Gia Lai") +
  "&output=embed";

function ContactPage() {
  const zaloQr = qrImageUrl(SHOP.zalo, 180);
  const phoneQr = qrImageUrl(`tel:${SHOP.phone}`, 180);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-xs tracking-wide text-muted-foreground uppercase">Liên hệ</p>
      <h1 className="font-display mt-1 text-4xl">{SHOP.name}</h1>
      <p className="mt-2 text-muted-foreground">{SHOP.tagline}</p>

      <div className="mt-8 space-y-4 rounded-2xl border border-border bg-card p-5 text-sm leading-relaxed">
        <p>
          <strong className="text-foreground">Chủ vườn:</strong> {SHOP.owner}
        </p>
        <p>
          <strong className="text-foreground">Điện thoại:</strong>{" "}
          <a className="text-primary underline-offset-2 hover:underline" href={`tel:${SHOP.phone}`}>
            {SHOP.phoneDisplay}
          </a>
          {SHOP.phone2 ? (
            <>
              {" · "}
              <a
                className="text-primary underline-offset-2 hover:underline"
                href={`tel:${SHOP.phone2}`}
              >
                {SHOP.phone2Display}
              </a>
            </>
          ) : null}
        </p>
        <p className="flex items-start gap-2">
          <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>
            <strong className="text-foreground">Địa chỉ:</strong> {SHOP.address}
          </span>
        </p>
        <p>
          <strong className="text-foreground">Giờ mở cửa:</strong> {SHOP.hours}
        </p>
      </div>

      {/* Bản đồ Google Maps nhúng */}
      <section className="mt-8 overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="font-display text-lg">Bản đồ đến vườn</h2>
          <Button asChild size="sm" className="gap-1.5">
            <a href={SHOP.mapsUrl} target="_blank" rel="noreferrer">
              <Navigation className="size-3.5" />
              Chỉ đường
            </a>
          </Button>
        </div>
        <div className="relative aspect-[16/10] w-full bg-muted">
          <iframe
            title="Bản đồ Vườn Của Mít"
            src={MAPS_EMBED}
            className="absolute inset-0 h-full w-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </div>
        <p className="px-4 py-2 text-xs text-muted-foreground">
          Bấm <strong>Chỉ đường</strong> để mở Google Maps / Apple Maps và dẫn đường tới shop.
        </p>
      </section>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-5 text-center">
          <img
            src={zaloQr}
            alt="QR Zalo Vườn Của Mít"
            width={180}
            height={180}
            className="rounded-lg bg-white p-2"
          />
          <p className="mt-3 text-sm font-medium">Quét Zalo chị Hằng</p>
          <p className="mt-1 text-xs text-muted-foreground">Mở Zalo → quét mã → nhắn đặt hàng</p>
        </div>
        <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-5 text-center">
          <img
            src={phoneQr}
            alt={`QR gọi ${SHOP.phoneDisplay}`}
            width={180}
            height={180}
            className="rounded-lg bg-white p-2"
          />
          <p className="mt-3 text-sm font-medium">Quét để gọi {SHOP.phoneDisplay}</p>
          <p className="mt-1 text-xs text-muted-foreground">Điện thoại hỗ trợ quét QR gọi nhanh</p>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild size="lg">
          <a href={SHOP.zalo} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2">
            <ZaloMark className="size-4" />
            Nhắn Zalo
          </a>
        </Button>
        <Button asChild size="lg" variant="outline">
          <a href={`tel:${SHOP.phone}`}>Gọi điện</a>
        </Button>
        <Button asChild size="lg" variant="secondary">
          <a href={SHOP.facebook} target="_blank" rel="noreferrer">
            Xem Facebook
          </a>
        </Button>
        <Button asChild size="lg" variant="secondary" className="gap-1.5">
          <a href={SHOP.mapsUrl} target="_blank" rel="noreferrer">
            <Navigation className="size-4" />
            Chỉ đường
          </a>
        </Button>
      </div>
    </main>
  );
}
