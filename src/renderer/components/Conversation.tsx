import { memo, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, Copy } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BotFace } from "./BotFace";
import { BotAvatar } from './BotAvatar';
import type { Bot } from "../../shared/model";
import { api } from "../api";
import { TaskProgress } from './TaskProgress';
import { ConversationNodes } from '@fenn-ui/components/ConversationNodes';
import { remarkCjkEmphasis } from '@fenn-shared/remarkCjkEmphasis';
import { isAtBottom } from '@fenn-shared/scrollPosition';
import { conversationIndexEntries } from '@fenn-shared/conversationIndex';
import { GroupAvatar } from './GroupAvatar';

const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="reply-prose">
      <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkCjkEmphasis]}
        components={{
          a: (props) => (
            <a
              href={props.href}
              onClick={(e) => {
                e.preventDefault();
                if (props.href)
                  void api()
                    .openLink(props.href)
                    .catch(() => {});
              }}
            >
              {props.children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});

export function Conversation({ bot, blocked, onInspect, members, progressBot = bot }: { bot: Bot; blocked: boolean; onInspect: () => void; members?: Bot[]; progressBot?: Bot }) {
  const messages = bot.messages.filter(
    (message) =>
      message.channel !== "activity" &&
      message.blocks.some((block) => block.kind === "text"),
  );
  const scroll = useRef<HTMLDivElement>(null),
    follow = useRef(true),
    [away, setAway] = useState(false);
  const lastIntent = useRef(-Infinity), direction = useRef(0), touchY = useRef<number | undefined>(undefined);
  const readingIntent = (delta: number) => {
    if (!Number.isFinite(delta)) return;
    lastIntent.current = performance.now();
    direction.current = Math.sign(delta);
    if (delta <= 0) follow.current = false;
    else if (scroll.current && isAtBottom(scroll.current)) follow.current = true;
    if (scroll.current) setAway(!isAtBottom(scroll.current));
  };
  const [actions, setActions] = useState<string | null>(null);
  const latestUser = bot.messages.findLast(
    (message) => message.role === "user",
  )?.id;
  useLayoutEffect(() => {
    follow.current = true;
    setAway(false);
    setActions(null);
  }, [bot.id, latestUser]);
  useLayoutEffect(() => {
    const el = scroll.current;
    if (!el) return;
    // Only deliberate reading/navigation pauses following. Reflow and delayed
    // native scroll events must not be mistaken for user intent.
    if (follow.current) el.scrollTop = el.scrollHeight;
    setAway(!isAtBottom(el));
  }, [bot.messages, bot.status]);
  useLayoutEffect(() => {
    const el = scroll.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (follow.current) {
        el.scrollTop = el.scrollHeight;
        setAway(false);
      } else setAway(!isAtBottom(el));
    });
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [bot.id, !!bot.messages.length]);
  return (
    <div className="history-wrap">
      <div
        className="conversation-history"
        ref={scroll}
        tabIndex={0}
        aria-label="对话滚动区域"
        onWheel={(event) => {
          readingIntent(event.deltaY);
        }}
        onTouchStart={event => { touchY.current = event.touches[0]?.clientY; }}
        onTouchMove={event => {
          const next = event.touches[0]?.clientY;
          if (next !== undefined && touchY.current !== undefined) readingIntent(touchY.current - next);
          touchY.current = next;
        }}
        onKeyDown={(event) => {
          if (["Home", "PageUp", "ArrowUp"].includes(event.key)) {
            readingIntent(-1);
          }
          else if (["End", "PageDown", "ArrowDown"].includes(event.key)) readingIntent(1);
        }}
        onPointerDown={() => {
          readingIntent(-1);
        }}
        onFocusCapture={() => {
          readingIntent(-1);
        }}
        onScroll={(event) => {
          const el = event.currentTarget,
            atBottom = isAtBottom(el);
          if (atBottom) {
            // Reflow or a closing panel can clamp the scroll position. Only
            // deliberate downward navigation may resume following new output.
            if (direction.current > 0 && performance.now() - lastIntent.current < 500) follow.current = true;
            setAway(false);
          } else if (!follow.current) setAway(true);
        }}
      >
        {!messages.length && !['running','waiting','stopping'].includes(progressBot.status) ? (
          <div className="empty-conversation">
            {members ? <GroupAvatar members={members} size={72}/> : <BotAvatar bot={bot} size={72} />}
            <p>给我发条消息，开始吧。</p>
          </div>
        ) : (
          <div className="message-column" role="log" aria-label="对话记录">
            {messages.map((message) => (
              <article
                key={message.id}
                  data-mid={message.id}
                className={"message " + message.role}
                data-actions-active={actions === message.id || undefined}
                onPointerEnter={() => setActions(message.role === "assistant" ? message.id : null)}
                onPointerLeave={(event) => {
                  if (!event.currentTarget.contains(document.activeElement))
                    setActions((current) => current === message.id ? null : current);
                }}
                onFocusCapture={() => setActions(message.role === "assistant" ? message.id : null)}
                onBlurCapture={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget))
                    setActions((current) => current === message.id ? null : current);
                }}
                aria-label={message.role === "user" ? "你" : message.senderName || bot.name}
              >
                {!!members && message.role === 'assistant' && <div className="message-sender"><BotAvatar bot={members.find(member => member.id === message.senderBotId) || { id: message.senderBotId || '', name: message.senderName || '', avatar: message.senderAvatar, color: message.senderColor }} size={22} /><span>{message.senderName}</span></div>}
                {message.blocks.map(
                  (block, index) =>
                    block.kind === "text" &&
                    (message.role === "user" ? (
                      <p key={index}>{block.text}</p>
                    ) : (
                      <Markdown text={block.text} key={index} />
                    )),
                )}
                {message.role === "assistant" && (
                  <button
                    className="icon-btn copy-message"
                    type="button"
                    aria-label="复制回复"
                    onClick={() =>
                      void navigator.clipboard.writeText(
                        message.blocks
                          .flatMap((block) =>
                            block.kind === "text" ? [block.text] : [],
                          )
                          .join("\n"),
                      )
                    }
                  >
                    <Copy size={13} />
                  </button>
                )}
              </article>
            ))}
            <TaskProgress bot={progressBot} blocked={blocked} onInspect={onInspect} />
          </div>
        )}
      </div>
      <ConversationNodes key={bot.id} scope={`bot:${bot.id}`} scroller={scroll} onNavigate={() => readingIntent(-1)} entries={conversationIndexEntries(messages.map(message => ({id:message.id,role:message.role,text:message.blocks.flatMap(block => block.kind === 'text' ? [block.text] : []).join('\n')})))} />
      {away && messages.length > 0 && (
        <button
          className="jump-bottom"
          aria-label="回到最新"
          title="回到最新"
          onClick={() => {
            follow.current = true;
            setAway(false);
            scroll.current?.scrollTo({ top: scroll.current.scrollHeight });
          }}
        >
          <ArrowDown size={16} />
        </button>
      )}
    </div>
  );
}
