import { useState } from "react";
import { Search } from "lucide-react";
import type { Bot } from "../../shared/model";
import { BotAvatar } from "./BotAvatar";

export function SearchBots({
  bots,
  onPick,
}: {
  bots: Bot[];
  onPick: (id: string) => void;
}) {
  const [query, setQuery] = useState(""),
    needle = query.trim().toLowerCase();
  const matches = bots.flatMap((bot) => {
    const snippet = bot.messages
      .filter((message) => message.channel !== "activity")
      .flatMap((message) =>
        message.blocks.flatMap((block) =>
          block.kind === "text" && block.text.toLowerCase().includes(needle)
            ? [block.text]
            : [],
        ),
      )
      .at(-1);
    return !needle || bot.name.toLowerCase().includes(needle) || snippet
      ? [{ bot, snippet }]
      : [];
  });
  return (
    <>
      <label className="search-field">
        <Search size={17} />
        <input
          data-autofocus
          aria-label="搜索 Bot 或消息"
          placeholder="搜索 Bot 或消息"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="search-results">
        {matches.length ? (
          matches.map(({ bot, snippet }) => (
            <button key={bot.id} onClick={() => onPick(bot.id)}>
              <BotAvatar bot={bot} size={30} />
              <span>
                <strong>{bot.name}</strong>
                {needle && snippet && <small>{snippet}</small>}
              </span>
            </button>
          ))
        ) : (
          <p className="muted">没有找到相关对话。</p>
        )}
      </div>
    </>
  );
}
