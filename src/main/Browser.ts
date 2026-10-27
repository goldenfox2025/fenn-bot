import { BrowserTools as SharedBrowserTools } from '@fenn-main/browser/BrowserTools';
import type { Config, Preview } from '../shared/model';
import type { Policy } from './Policy';
export { webUrl, localCdp, sensitiveField } from '@fenn-main/browser/BrowserTools';

/** Product adapter only; browser execution is a checked-in snapshot shared with Code. */
export class BrowserTools extends SharedBrowserTools {
  constructor(data: string, config: () => Config, policy: Policy, preview: (frame: Preview) => void) {
    super(data, config, {
      active: (id, runId) => policy.active(id, runId),
      assert: (id, runId) => policy.assert(id, runId),
      require: ({ ownerId, ...request }, runId) => policy.require({ ...request, botId: ownerId }, runId),
      choose: async (id, runId, choices) => {
        const decision = await policy.ask({ botId: id, capability: 'browser.choose', title: '选择要使用的浏览器', target: '本机浏览器', detail: '只创建新的后台标签页，你正在使用的页面保持原位。', taskScope: false, choices: choices.map(choice => ({ ...choice, kind: 'allow_once' })) }, runId);
        policy.assert(id, runId);
        return decision.allow ? decision.optionId : undefined;
      },
    }, ({ ownerId, ...frame }) => preview({ ...frame, botId: ownerId }));
  }
}
