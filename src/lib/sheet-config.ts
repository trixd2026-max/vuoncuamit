import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SheetConfig = {
  sheetId: string;
  csvUrl: string;
  gid: string;
  sheetName: string;
  webhookUrl: string;
  /** Tab đơn hàng trên Sheet (thường cùng file sản phẩm) */
  ordersSheetName: string;
  /**
   * Sheet ID riêng chỉ khi đơn nằm file khác.
   * Để trống = dùng sheetId (sản phẩm) — đúng với thực tế hiện tại.
   */
  ordersSheetId: string;
  /** Sheet ID ghi snapshot báo cáo (có thể khác file sản phẩm) */
  reportSheetId: string;
  reportWebhookUrl: string;
};

/** Sheet sản phẩm + tab DonHang (đơn thật đang ghi vào đây) */
const PRODUCT_SHEET_ID = "1PIwNQOmYupdqww3_Y5i1a4sPYpmHs2LNZlWIUlPsb5U";
/** Sheet báo cáo riêng — chỉ dùng để GHI tổng hợp, không đọc đơn từ đây */
const REPORT_SHEET_ID = "16nGPqH-8BesOPKqvyrZLsl07QZX_Ugpa0bIuKWyJcdU";
const REPORT_WEBHOOK =
  "https://script.google.com/macros/s/AKfycbxumqdKdq1meRnUgzSrrW9Q2cyTQisJJn77AbDtpL18_eXuN3tWINvSZg6kprLqLZQ/exec";

const empty: SheetConfig = {
  sheetId: PRODUCT_SHEET_ID,
  csvUrl: "",
  gid: "1069887904",
  sheetName: "san-pham-vuon-cua-mit",
  webhookUrl: REPORT_WEBHOOK,
  ordersSheetName: "DonHang",
  ordersSheetId: "", // trống → đọc đơn từ sheetId (sản phẩm)
  reportSheetId: REPORT_SHEET_ID,
  reportWebhookUrl: REPORT_WEBHOOK,
};

type State = SheetConfig & {
  setConfig: (patch: Partial<SheetConfig>) => void;
  connected: () => boolean;
  /** Sheet ID dùng để đọc đơn */
  ordersId: () => string;
};

export const useSheetConfig = create<State>()(
  persist(
    (set, get) => ({
      ...empty,
      setConfig: (patch) => set(patch),
      connected: () => Boolean(get().sheetId.trim() || get().csvUrl.trim()),
      ordersId: () => {
        const o = get().ordersSheetId.trim();
        if (o) return o;
        return get().sheetId.trim();
      },
    }),
    { name: "vcm-sheet" },
  ),
);

export { PRODUCT_SHEET_ID, REPORT_SHEET_ID, REPORT_WEBHOOK };
