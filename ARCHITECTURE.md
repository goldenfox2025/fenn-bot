# Implementation ownership

- `src/main/Policy.ts`: approval queue, task grants, expiry and revocation.
- `src/main/Browser.ts`: scoped Playwright pages and guarded browser operations.
- `src/main/NativeComputer.ts`: Electron adapters for Fenn's existing native computer controller.
- `src/main/Core.ts`: Bot persistence, ACP sessions, per-run activity journals and tool composition. `deliverMessage` is the only agent-to-chat gateway; `agentEvent` writes the journal, and `finishJournal` settles terminal tool states.
- `src/main/BotRoutines.ts`: Bot-scoped local scheduling; busy deferral, missed-slot handling and execution outcomes.
- `src/shared/model.ts`: the typed renderer API and serializable state.
- `src/renderer/App.tsx`: state subscription and surface composition.
- `src/renderer/components/Conversation.tsx`: message history and scroll following.
- `src/renderer/components/{MessageInput,ComposerActions,RuntimeSettings}.tsx`: compact input, native action popover and model/backend settings.
- `src/renderer/components/{TaskProgress,OperationRecords,ToolTrace}.tsx`: progress shortcut and detailed persistent operation records; no process content is rendered in chat.
- `src/renderer/components/{BotFace,SearchBots}.tsx`: local neutral avatar and local chat search.
- `src/renderer/components/{ApprovalCard,Inspector}.tsx`: decisions, grants and evidence.
- `src/renderer/components/{Dialog,BotEditor,Settings}.tsx`: modals and configuration.
- `src/renderer/components/{SelectControl,SidebarResize,BotRoutines}.tsx`: shared selector behavior, persistent sidebar sizing and task management.
- `src/renderer/usePanelFocus.ts`: narrow-panel focus containment and restoration.
- `src/renderer/theme.css`: Bot palette; `style.css` owns component layout.

ACP adapters, protocol quirks, MCP transport, native computer policy, memory, schedule rules, scales and basic controls are a checked-in source snapshot under `vendor/fenn`. Its `snapshot.json` records the selected files and hashes; its MIT license is retained. The source and `resources/fenn` assets are owned by this repository at build/runtime. Normal commands never read or synchronize a sibling checkout. Intentional updates use `scripts/sync-fenn.mjs <source directory>`, followed by diff review and tests. `scripts/standalone-check.mjs` validates a clean source export with reused development dependencies.

Keep product differences explicit. A Bot is a persistent assistant; chat shows deliveries while its scoped side panel holds work history, memory, scheduled work and permissions. Code owns project coordination and review. Reuse these lower-level contracts without importing Code's project screens or coordinator into Bot.

Memory storage, tool definitions, privacy/extraction guidance and the management surface are the same selected modules as Code, with the `bots` storage namespace. Stable facts can be written during the ordinary task; explicit remember requests have a local fallback. There is no extra extraction-model request. Users can inspect, edit and delete entries. Unfinished editor drafts stay in process memory when inspecting another tab.

Each task has a run identity. Approval promises, browser continuations and native driver calls retain it. Native methods check an async task context before input. Stop revokes endpoints/grants and detaches the old session immediately, with a bounded wait for cancellation. Late opening/results cannot overwrite a new task.

The shared MCP server binds live tool definitions when HTTP headers arrive, before awaiting the body, and rechecks endpoint revocation before dispatch. Slow old requests cannot borrow a replacement task's identity.
# Messenger identities and rooms

`shared/avatars.ts` owns persisted defaults and validation; `BotAvatar.tsx` is the single renderer for an identity. User choices are stored on the Bot. The main Bot retains its fox, while unassigned Bots receive unused defaults before falling back to name tiles.

`main/GroupChats.ts` owns membership, routing, bounded rounds and public message attribution. A room actor is a separate Bot runtime owned by a group, with its own session, journal, memory and permissions. It is not listed as another direct Bot, and never replays a private DM. `BotCore` supplies the existing execution/Stop/tool lifecycle. Normal groups cannot create unlisted scheduled tasks.

The app retains conversation state while a narrow details page is open. Pane preference, actual room to dock, and explicit user opening are separate states; collapsing space must not overwrite user intent. A content-sized wide pane and a narrow details page use the same inspector body.
