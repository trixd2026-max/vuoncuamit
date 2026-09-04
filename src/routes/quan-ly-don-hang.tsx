import { createFileRoute, redirect } from "@tanstack/react-router";

/** Trang quản lý đơn — redirect về /quan-ly tab đơn. */
export const Route = createFileRoute("/quan-ly-don-hang")({
  beforeLoad: () => {
    throw redirect({ to: "/quan-ly", search: { tab: "don" } as never });
  },
  component: () => null,
});
