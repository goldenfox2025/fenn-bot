import { LoaderCircle, CircleAlert, Check, Minus } from "lucide-react";

export function ToolStatus({ status }: { status: string }) {
  if (["running", "pending", "in_progress"].includes(status))
    return (
      <LoaderCircle size={14} className="spin" role="img" aria-label="进行中" />
    );
  if (["failed", "error"].includes(status))
    return (
      <CircleAlert
        size={14}
        className="operation-error"
        role="img"
        aria-label="失败"
      />
    );
  if (["done", "completed", "success"].includes(status))
    return <Check size={14} role="img" aria-label="完成" />;
  return (
    <Minus
      size={14}
      role="img"
      aria-label={
        ["cancelled", "canceled"].includes(status)
          ? "已取消"
          : status === "unconfirmed"
            ? "未确认"
            : "已结束"
      }
    />
  );
}
