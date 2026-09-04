import { Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { SHOP } from "@/lib/shop";
import { ZaloMark } from "@/components/zalo-icon";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border bg-card">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <p className="font-display text-2xl">{SHOP.name}</p>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Trái cây vườn, giỏ quà, tráp cưới hỏi và hoa viếng tang. Gói tại chỗ,
            giao trong khu vực Tuy Phước Đông.
          </p>
        </div>
        <div>
          <p className="text-xs tracking-wide text-muted-foreground uppercase">Liên hệ</p>
          <a
            href={SHOP.zalo}
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex items-center gap-2 text-sm"
          >
            <ZaloMark className="size-6" />
            Zalo {SHOP.owner} · {SHOP.phoneDisplay}
          </a>
          <a
            href={SHOP.mapsUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 flex items-start gap-2 text-sm"
          >
            <MapPin className="mt-0.5 size-4 shrink-0" />
            {SHOP.address}
          </a>
          <p className="mt-2 text-sm text-muted-foreground">{SHOP.hours}</p>
        </div>
        <div>
          <p className="text-xs tracking-wide text-muted-foreground uppercase">Mục lục</p>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            <li>
              <Link to="/cua-hang">Cửa hàng</Link>
            </li>
            <li>
              <Link to="/gio-trai-cay">Đặt giỏ trái cây</Link>
            </li>
            <li>
              <Link to="/trap-cuoi-hoi">Tráp cưới hỏi</Link>
            </li>
            <li>
              <Link to="/tra-cuu-don">Tra cứu đơn</Link>
            </li>
            <li>
              <a href={SHOP.facebook} target="_blank" rel="noreferrer">
                Facebook
              </a>
            </li>
          </ul>
        </div>
      </div>
      <p className="border-t border-border px-4 py-4 text-center text-xs text-muted-foreground">
        {SHOP.name} · Thôn Phụng Sơn
      </p>
    </footer>
  );
}
