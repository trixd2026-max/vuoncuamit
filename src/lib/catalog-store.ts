import { create } from "zustand";
import { LOCAL_PRODUCTS, type Product } from "./catalog";
import { fetchCatalog } from "./sheet";
import { useSheetConfig } from "./sheet-config";

/** Sau bao lâu thì load() sẽ đọc lại Sheet (ms) */
const STALE_MS = 2 * 60 * 1000;

type CatalogState = {
  products: Product[];
  source: "local" | "sheet";
  warning?: string;
  loading: boolean;
  loaded: boolean;
  /** Timestamp lần load thành công gần nhất */
  loadedAt: number;
  load: () => Promise<void>;
  /** Ép đọc lại Sheet (bỏ qua cờ loaded) */
  reload: () => Promise<void>;
};

export const useCatalog = create<CatalogState>((set, get) => ({
  products: LOCAL_PRODUCTS,
  source: "local",
  loading: false,
  loaded: false,
  loadedAt: 0,
  load: async () => {
    const { loaded, loading, loadedAt } = get();
    if (loading) return;
    // Đã load và còn "tươi" → bỏ qua
    if (loaded && Date.now() - loadedAt < STALE_MS) return;
    await get().reload();
  },
  reload: async () => {
    const cfg = useSheetConfig.getState();
    const hasSheet = Boolean(cfg.sheetId.trim() || cfg.csvUrl.trim());
    if (!hasSheet) {
      set({
        products: LOCAL_PRODUCTS,
        source: "local",
        loaded: true,
        loadedAt: Date.now(),
        warning: undefined,
        loading: false,
      });
      return;
    }
    if (get().loading) return;
    set({ loading: true });
    try {
      const result = await fetchCatalog({
        data: {
          sheetId: cfg.sheetId.trim() || undefined,
          // Chỉ truyền csvUrl nếu là link export/csv thật, không phải /edit
          csvUrl: (() => {
            const u = cfg.csvUrl.trim();
            if (!u) return undefined;
            if (u.includes("/edit")) return undefined;
            return u;
          })(),
          gid: cfg.gid.trim() || undefined,
          sheetName: cfg.sheetName.trim() || undefined,
        },
      });
      set({
        products: result.products,
        source: result.source,
        warning: result.warning,
        loading: false,
        loaded: true,
        loadedAt: Date.now(),
      });
    } catch {
      set({
        products: LOCAL_PRODUCTS,
        source: "local",
        warning: "Không đồng bộ được Sheet, đang dùng bảng mẫu.",
        loading: false,
        loaded: true,
        loadedAt: Date.now(),
      });
    }
  },
}));

/** Gọi 1 lần ở client: khi user quay lại tab → reload catalog nếu đã cũ */
export function bindCatalogVisibilityReload() {
  if (typeof document === "undefined") return;
  const onVis = () => {
    if (document.visibilityState !== "visible") return;
    const { loadedAt, loading, reload } = useCatalog.getState();
    if (loading) return;
    if (Date.now() - loadedAt >= STALE_MS) void reload();
  };
  document.addEventListener("visibilitychange", onVis);
  return () => document.removeEventListener("visibilitychange", onVis);
}

export function findProduct(products: Product[], id: string) {
  const q = id.trim().toLowerCase();
  return products.find((p) => p.id.toLowerCase() === q);
}
