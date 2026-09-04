import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/quan-ly")({ component: AdminPage });

function AdminPage() {
  return (
    <main className="mx-auto max-w-sm px-4 py-16 text-center">
      <h1 className="font-display text-2xl">Quản lý đang cập nhật</h1>
      <p className="mt-2 text-sm text-muted-foreground">Vui lòng tải lại sau vài phút.</p>
      <Button className="mt-6" asChild><Link to="/">Về trang chủ</Link></Button>
    </main>
  );
}
