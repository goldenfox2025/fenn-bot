import { useState } from "react";
import { Plug, Plus, Sun, Moon } from "lucide-react";
import { SegmentedControl } from "@fenn-ui/components/SegmentedControl";
import type { Config, Snapshot } from "../../shared/model";
import { api } from "../api";
import { BackendLogo } from '@fenn-ui/components/BackendLogo';

export function Settings({
  state,
  onError,
}: {
  state: Snapshot;
  onError: (text: string) => void;
}) {
  const [tab, setTab] = useState<"connections" | "permissions" | "appearance">(
      "connections",
    ),
    [name, setName] = useState(""),
    [command, setCommand] = useState(""),
    [args, setArgs] = useState("[]"),
    [adding, setAdding] = useState(false);
  const configure = (patch: Partial<Config>) =>
    void api()
      .configure(patch)
      .catch((e) => onError(String(e.message || e)));
  return (
    <>
      <SegmentedControl
        label="设置分类"
        value={tab}
        onChange={setTab}
        options={[
          { value: "connections", label: "连接" },
          { value: "permissions", label: "操作权限" },
          { value: "appearance", label: "外观" },
        ]}
      />
      {tab === "connections" ? (
        <div className="settings-section">
          <p className="muted">
            使用本机已安装的 ACP 程序和它自己的登录。连接时不发送消息。
          </p>
          <ul className="connection-list">
            {state.backends.map((b) => (
              <li key={b.id}>
                <BackendLogo id={b.id} size={22} />
                <div>
                  <strong>{b.name}</strong>
                  <small>
                    {b.installed === false
                      ? "未检测到程序"
                      : "已检测到程序，建立会话后读取模型"}
                  </small>
                </div>
              </li>
            ))}
          </ul>
          {adding ? (
            <form
              className="connection-form"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await api().addBackend(name, command, JSON.parse(args));
                  setAdding(false);
                  setName("");
                  setCommand("");
                  setArgs("[]");
                } catch (e) {
                  onError(String((e as Error).message));
                }
              }}
            >
              <label className="field">
                名称
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </label>
              <label className="field">
                程序路径
                <input
                  className="input"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="ACP 可执行程序的实际路径"
                  required
                />
              </label>
              <label className="field">
                参数（JSON 数组）
                <input
                  className="input"
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                  placeholder={'["--acp"]'}
                />
              </label>
              <p className="muted">
                这会运行你指定的本机程序。该程序自身的权限与登录由它管理。
              </p>
              <div className="dialog-actions">
                <button
                  className="btn"
                  type="button"
                  onClick={() => setAdding(false)}
                >
                  取消
                </button>
                <button className="btn primary" type="submit">
                  添加连接
                </button>
              </div>
            </form>
          ) : (
            <button className="btn" onClick={() => setAdding(true)}>
              <Plus size={14} />
              添加 ACP 后端
            </button>
          )}
        </div>
      ) : tab === "permissions" ? (
        <div className="settings-section">
          <h3>浏览器</h3>
          <SegmentedControl
            label="浏览器方式"
            value={state.config.browserMode}
            onChange={(browserMode) => configure({ browserMode })}
            options={[
                { value: "auto", label: "自动选择" },
                { value: "isolated", label: "独立无头" },
              { value: "existing", label: "连接现有浏览器" },
            ]}
          />
          <p className="muted">
              优先使用可连接的浏览器；多个浏览器会询问你选择哪一个。后台操作不切换你的当前页面，画面可在「电脑」中查看。
          </p>
            {state.config.browserMode !== "isolated" && (
            <label className="field">
              本机 Playwright / CDP 地址
              <input
                className="input"
                defaultValue={state.config.cdpUrl}
                onBlur={(e) => configure({ cdpUrl: e.target.value })}
              />
            </label>
          )}
          <div className="permission-setting">
            <div>
              <h3>电脑应用</h3>
              <p className="muted">
                开启后仍需按应用确认查看、点击或输入权限。系统的录屏、辅助功能权限依然有效。
              </p>
            </div>
            <input
              type="checkbox"
              role="switch"
              aria-label="允许请求电脑应用权限"
              checked={state.config.computerEnabled}
              onChange={(e) => configure({ computerEnabled: e.target.checked })}
            />
          </div>
          <p className="muted">
            停止任务会立即撤销工具授权。原生应用操作时，屏幕顶部提供停止按钮，Ctrl
            Shift Esc 也可停止。
          </p>
          <p className="permission-boundary">
            此处管理 Fenn Bot 提供的工具和 ACP
            授权请求，不会隔离后端程序对操作系统的访问。
          </p>
        </div>
      ) : (
        <div className="settings-section">
          <h3>界面主题</h3>
          <SegmentedControl
            label="主题"
            value={state.config.theme}
            onChange={(theme) => configure({ theme })}
            options={[
              {
                value: "light",
                label: (
                  <>
                    <Sun size={14} />
                    浅色
                  </>
                ),
              },
              {
                value: "dark",
                label: (
                  <>
                    <Moon size={14} />
                    深色
                  </>
                ),
              },
            ]}
          />
        </div>
      )}
    </>
  );
}
