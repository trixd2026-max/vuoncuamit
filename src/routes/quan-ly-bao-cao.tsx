import { createFileRoute, redirect } from "@tanstack/react-router";

/** Trang báo cáo — redirect về /quan-ly tab báo cáo. */
export const Route = createFileRoute("/quan-ly-bao-cao")({
  beforeLoad: () => {
    throw redirect({ to: "/quan-ly", search: { tab: "baocao" } as never });
  },
  component: () => null,
});
