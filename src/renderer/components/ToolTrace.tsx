import { ChevronDown } from "lucide-react";
import type { Block } from "../../shared/model";
import { ToolStatus } from "./ToolStatus";

type Tool = Extract<Block, { kind: "tool" }>;
const labels: Record<string, string> = {
  browser_open: "打开网页",
  browser_snapshot: "查看网页",
  browser_click: "点击网页",
  browser_fill: "填写字段",
  browser_key: "网页按键",
  browser_scroll: "滚动网页",
  computer_request_access: "申请应用权限",
  computer_screenshot: "查看屏幕",
  computer_left_click: "点击应用",
  computer_type: "输入文字",
  send_user_message: "向你发送消息",
  memory_list: "查看记忆",
  memory_read: "读取记忆",
  memory_write: "更新记忆",
  memory_delete: "删除记忆",
  schedule_list: "查看定期任务",
  schedule_create: "设置定期任务",
  schedule_delete: "删除定期任务",
};
export function toolTitle(raw: string) {
  const name = raw.replace(/\s*\(fenn MCP Server\)\s*$/i, "").split(/[/:]/).at(-1)?.replace(/^mcp__fenn__/, "") || raw;
  return labels[name] || raw;
}
export function ToolTrace({ tools }: { tools: Tool[] }) {
  const status = tools.some((t) =>
    ["running", "pending", "in_progress"].includes(t.status),
  )
    ? "running"
    : tools.some((t) => ["error", "failed"].includes(t.status))
      ? "failed"
      : "completed";
  if (tools.length === 1) return <ToolRow tool={tools[0]} />;
  return (
    <details className="tool-trace tool-group">
      <summary>
        <ToolStatus status={status} />
        <span>{tools.length} 次工具操作</span>
        <ChevronDown size={13} />
      </summary>
      <div className="tool-group-content">
        {tools.map((tool) => (
          <ToolRow key={tool.id} tool={tool} />
        ))}
      </div>
    </details>
  );
}
function ToolRow({ tool }: { tool: Tool }) {
  return (
    <details className="tool-trace">
      <summary>
        <ToolStatus status={tool.status} />
        <span>{toolTitle(tool.title)}</span>
        <ChevronDown size={13} />
      </summary>
      {tool.detail && (
        <pre tabIndex={0} aria-label="工具详情">
          {tool.detail}
        </pre>
      )}
    </details>
  );
}
