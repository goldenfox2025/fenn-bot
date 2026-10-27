import { useLayoutEffect, useRef, useState } from "react";
import type { Bot } from '../../shared/model';
import { BotAvatar } from './BotAvatar';

export function MessageInput({
  value,
  name,
  onChange,
  onSend,
  members,
}: {
  value: string;
  name: string;
  onChange: (value: string) => void;
  onSend: () => void;
  members?: Bot[];
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [index, setIndex] = useState(0), [dismissed, setDismissed] = useState(false);
  const mention = value.match(/(?:^|\s)@([^@\n]*)$/u);
  const matches = !dismissed && mention ? (members || []).filter(bot => bot.name.toLocaleLowerCase().startsWith(mention[1].toLocaleLowerCase())) : [];
  const choose = (bot: Bot) => { onChange(value.slice(0, value.lastIndexOf('@')) + '@' + (/\s/u.test(bot.name) ? '"' + bot.name + '"' : bot.name) + ' '); setDismissed(true); ref.current?.focus(); };
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [value]);
  return (
    <>{!!matches.length && <div className="mention-options" role="listbox" aria-label="提及群成员">{matches.map((bot, i) => <button type="button" role="option" aria-selected={i === index} key={bot.id} onMouseDown={event => event.preventDefault()} onClick={() => choose(bot)}><BotAvatar bot={bot} size={26} /><span>{bot.name}</span></button>)}</div>}<textarea
      ref={ref}
      aria-label="发消息"
      placeholder={`给 ${name} 发消息…`}
      rows={1}
      value={value}
      onChange={(event) => { setDismissed(false); setIndex(0); onChange(event.target.value); }}
      onKeyDown={(event) => {
        if (matches.length && !event.nativeEvent.isComposing) {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setIndex((index + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length); return; }
          if (event.key === 'Escape') { event.preventDefault(); setDismissed(true); return; }
          if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); choose(matches[index] || matches[0]); return; }
        }
        if (
          event.key === "Enter" &&
          !event.shiftKey &&
          !event.nativeEvent.isComposing
        ) {
          event.preventDefault();
          onSend();
        }
      }}
    /></>
  );
}
