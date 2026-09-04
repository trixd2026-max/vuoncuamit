import { createFileRoute, redirect } from "@tanstack/react-router";

/** Trang cấu hình Sheet — hiện redirect về /quan-ly (tab Sheet nằm cuối trang admin). */
export const Route = createFileRoute("/quan-ly-sheet")({
  beforeLoad: () => {
    throw redirect({ to: "/quan-ly", search: { tab: "sheet" } as never });
  },
  component: () => null,
});
