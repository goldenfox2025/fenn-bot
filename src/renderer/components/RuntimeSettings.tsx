import type { Bot, Snapshot } from "../../shared/model";
import { api } from "../api";
import { SelectControl } from "./SelectControl";

export function RuntimeSettings({
  bot,
  state,
  onError,
  onDone,
}: {
  bot: Bot;
  state: Snapshot;
  onError: (text: string) => void;
  onDone: () => void;
}) {
  const busy = ["running", "waiting", "stopping"].includes(bot.status),
    act = (work: Promise<unknown>) =>
      void work.catch((error) => onError(String(error.message || error)));
  return (
    <div className="runtime-fields">
      <label className="field">
        Agent 后端
        <SelectControl
          autoFocus
          label="Agent 后端"
          value={bot.backendId}
          disabled={busy}
          onChange={(backendId) =>
            act(api().updateBot(bot.id, { backendId }))
          }
          options={state.backends.map((backend) => ({ value: backend.id, label: backend.name + (backend.installed === false ? " · 未安装" : "") }))}
        />
      </label>
      {bot.catalog?.models?.length ? (
        <label className="field">
          模型
          <SelectControl
            label="模型"
            value={bot.modelId || bot.catalog.currentModelId}
            disabled={busy}
            onChange={(modelId) =>
              act(api().updateBot(bot.id, { modelId }))
            }
            options={bot.catalog.models.map((model) => ({ value: model.id, label: model.name }))}
          />
        </label>
      ) : (
        <p className="muted">
          {bot.status === "connecting"
            ? "正在从后端读取模型…"
            : bot.error || "此后端尚未提供模型列表。"}
        </p>
      )}
      {bot.catalog?.options
        ?.filter((option) => option.category === "thought_level")
        .map((option) => (
          <label className="field" key={option.id}>
            {option.name}
            <SelectControl
              label={option.name}
              value={bot.optionValues?.[option.id] || option.current}
              disabled={busy}
              onChange={(value) =>
                act(
                  api().updateBot(bot.id, {
                    optionValues: { [option.id]: value },
                  }),
                )
              }
              options={option.choices
                .filter(
                  (choice) =>
                    !(bot.backendId === "qoder" && choice.value === "none"),
                )
                .map((choice) => ({ value: choice.value, label: choice.name }))}
            />
          </label>
        ))}
      {busy && <p className="muted">停止当前任务后可以切换。</p>}
      <div className="dialog-actions">
        <span className="spacer" />
        <button className="btn primary" onClick={onDone}>
          完成
        </button>
      </div>
    </div>
  );
}
