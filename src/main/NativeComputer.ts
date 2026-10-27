import { desktopCapturer, screen, systemPreferences } from "electron";
import {
  ComputerControl,
  type AccessRequest,
} from "@fenn-main/computer/ComputerControl";
import { inputDriver } from "@fenn-main/computer/drivers";
import type { Config } from "../shared/model";

/** Electron supplies displays; Fenn's existing controller enforces per-app tiers and hit/focus checks. */
export function nativeComputer(
  resources: string,
  config: () => Config,
  ask: (
    id: string,
    request: AccessRequest,
  ) => Promise<Record<string, "none" | "view" | "click" | "full"> | null>,
  active: (id: string, on: boolean) => void,
  assertTask: () => void,
) {
  const driver = inputDriver(
    process.platform,
    {
      toDevice: (x, y) => {
        const p =
          process.platform === "win32"
            ? screen.dipToScreenPoint({ x, y })
            : { x, y };
        return [p.x, p.y];
      },
      fromDevice: (x, y) => {
        const p =
          process.platform === "win32"
            ? screen.screenToDipPoint({ x, y })
            : { x, y };
        return [p.x, p.y];
      },
    },
    resources,
    () =>
      process.platform === "darwin" &&
      !systemPreferences.isTrustedAccessibilityClient(false)
        ? "请先在系统设置中允许 Fenn Bot 的辅助功能权限。"
        : undefined,
  );
  // Async tool continuations keep their original task context; a newly started task
  // cannot reactivate an old controller action after Stop.
  const input = new Proxy(driver, {
    get(target, key) {
      const value = Reflect.get(target, key);
      return typeof value === "function"
        ? (...args: unknown[]) => {
            assertTask();
            return value.apply(target, args);
          }
        : value;
    },
  });
  const control = new ComputerControl({
    input,
    enabled: () => config().computerEnabled,
    askAccess: ask,
    isOwnApp: (app) => app.pid === process.pid || /fenn.?bot/i.test(app.id),
    onActive: (id, on) => {
      if (on) assertTask();
      active(id, on);
    },
    screen: {
      displays: () =>
        screen.getAllDisplays().map((d) => ({
          id: String(d.id),
          name: d.label || String(d.id),
          bounds: d.bounds,
          primary: d.id === screen.getPrimaryDisplay().id,
        })),
      capture: async (id, maxWidth, maxHeight, region) => {
        assertTask();
        const displays = screen.getAllDisplays(),
          display =
            displays.find((d) => String(d.id) === id) ||
            screen.getPrimaryDisplay();
        const sources = await desktopCapturer.getSources({
          types: ["screen"],
          thumbnailSize: region
            ? {
                width: Math.round(display.size.width * display.scaleFactor),
                height: Math.round(display.size.height * display.scaleFactor),
              }
            : { width: maxWidth, height: maxHeight },
        });
        assertTask();
        const source = sources.find((s) => s.display_id === String(display.id));
        if (!source || source.thumbnail.isEmpty())
          throw Error("无法截屏，请检查系统的录屏权限。");
        let image = source.thumbnail;
        if (region) {
          const k = image.getSize().width / display.size.width;
          image = image.crop({
            x: Math.round(region.x * k),
            y: Math.round(region.y * k),
            width: Math.max(1, Math.round(region.width * k)),
            height: Math.max(1, Math.round(region.height * k)),
          });
        }
        const size = image.getSize(),
          scale = Math.min(1, maxWidth / size.width, maxHeight / size.height);
        if (scale < 1)
          image = image.resize({
            width: Math.round(size.width * scale),
            height: Math.round(size.height * scale),
          });
        return { data: image.toPNG().toString("base64"), ...image.getSize() };
      },
    },
  });
  return { control, dispose: () => driver.dispose?.() };
}
