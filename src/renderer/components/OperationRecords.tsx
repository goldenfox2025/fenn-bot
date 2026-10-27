import { Brain, MessageSquare, ChevronDown } from "lucide-react";
import type { Bot } from "../../shared/model";
import { ToolTrace } from "./ToolTrace";

export function OperationRecords({ bot }: { bot?: Bot }) {
  const records =
    bot?.messages.filter(
      (message) =>
        message.role === "assistant" &&
        (message.channel === "activity" ||
          message.blocks.some(
            (block) => block.kind === "tool" || block.kind === "thought",
          )),
    ) || [];
  if (!records.length)
    return <p className="muted">工具调用、思考和中途决策会记录在这里。</p>;
  return (
    <div className="operation-records">
      {records.toReversed().map((record, index, all) => {
        const date = new Date(record.at).toLocaleDateString();
        const previousDate = index ? new Date(all[index - 1].at).toLocaleDateString() : '';
        const position = bot?.messages.findIndex((message) => message.id === record.id) ?? 0;
        const incoming = bot?.messages.slice(0, position).findLast((message) => message.role === 'user');
        const request = incoming?.blocks.find((block) => block.kind === 'text');
        return <div key={record.id}>
        {date !== previousDate && <h3 className="operation-day">{date === new Date().toLocaleDateString() ? '今天' : date}</h3>}
        <details className="operation-run" key={record.id} open={index === 0}>
          <summary>
            <MessageSquare size={15} />
            <span className="operation-run-title">{request?.kind === 'text' ? request.text.split('\n')[0] : '任务记录'}</span>
            <time>{new Date(record.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
            <small>
              {record.turnStatus === "running"
                ? "进行中"
                : record.interrupted
                  ? "已停止"
                  : record.turnStatus === "error"
                    ? "未完成"
                    : "已结束"}
            </small>
            <ChevronDown size={13} className="operation-chevron" />
          </summary>
          {request?.kind === 'text' && (request.text.length > 80 || request.text.includes('\n')) && <p className="operation-task" title={request.text}>{request.text}</p>}
          <div className="operation-items">
            {record.blocks.map((block, i) => <div className="operation-item" key={block.kind === 'tool' ? block.id : i}>
              {block.kind === "tool" ? (
                <ToolTrace key={block.id} tools={[block]} />
              ) : record.channel === "activity" || block.kind === "thought" ? (
                <details key={i} className="operation-note">
                  <summary>
                    {block.kind === "thought" ? (
                      <Brain size={14} />
                    ) : (
                      <MessageSquare size={14} />
                    )}
                    <span>
                      {block.kind === "thought" ? "思考" : "过程与决策"}
                    </span>
                  </summary>
                  <pre
                    tabIndex={0}
                    aria-label={
                      block.kind === "thought" ? "思考内容" : "过程与决策内容"
                    }
                  >
                    {block.text}
                  </pre>
                </details>
              ) : null}
            </div>)}
            {!record.blocks.length && <p className="muted">尚无过程记录。</p>}
          </div>
        </details></div>;
      })}
    </div>
  );
}
