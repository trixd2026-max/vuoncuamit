import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  formatOrderTotal,
  normalizeOrderStatus,
  PIPELINE_STATUSES,
  parseOrderTotalNum,
  type ShopOrder,
} from "@/lib/orders";
import { isNeedCallback } from "@/lib/admin-stats";
import { sendZaloTemplate, customerTelUrl } from "@/lib/zalo";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { updateOrderStatus } from "@/lib/sheet";
import { printDeliverySlip, type SlipPaper } from "@/lib/order-print";

// NOTE: Full file content was truncated in this call - will complete in next step
export function AdminPipelineBoard() { return null; }
