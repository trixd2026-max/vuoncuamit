import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SheetConfig = {
  sheetId: string;
  csvUrl: string;
  gid: string;
  sheetName: string;
  webhookUrl: string;
  /** Tab đơn hàng — có thể cùng hoặc khác Sheet sản phẩm */
  ordersSheetName: string;
  /** Sheet ID riêng cho đơn/báo cáo (nếu khác sheet sản phẩm) */
  ordersSheetId: string;
};

const empty: SheetConfig = {
  // Sheet sản phẩm mặc định
  sheetId: "1PIwNQOmYupdqww3_Y5i1a4sPYpmHs2LNZlWIUlPsb5U",
  csvUrl: "",
  gid: "1069887904",
  sheetName: "san-pham-vuon-cua-mit",
  webhookUrl:
    "https://script.google.com/macros/s/AKfycbxumqdKdq1meRnUgzSrrW9Q2cyTQisJJn77AbDtpL18_eXuN3tWINvSZg6kprLqLZQ/exec",
  ordersSheetName: "DonHang",
  // Sheet đơn / báo cáo riêng
  ordersSheetId: "16nGPqH-8BesOPKqvyrZLsl07QZX_Ugpa0bIuKWyJcdU",
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
      ordersId: () => get().ordersSheetId.trim() || get().sheetId.trim(),
    }),
    { name: "vcm-sheet" },
  ),
);
