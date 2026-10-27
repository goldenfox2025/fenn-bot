// Explicit maintenance operation only. Normal build/test never reads another checkout.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, cpSync } from 'node:fs';
import { resolve, dirname, relative, join } from 'node:path';
import { createHash } from 'node:crypto';
const source = process.argv[2] && resolve(process.argv[2]);
if (!source || !existsSync(join(source, 'src/main/backends/BackendManager.ts'))) throw Error('Usage: node scripts/sync-fenn.mjs <Fenn Code source directory>');
const dest = resolve('vendor/fenn'), seen = new Set();
const roots = [
  'src/main/backends/BackendManager.ts', 'src/main/backends/registry.ts',
  'src/main/computer/ComputerControl.ts', 'src/main/computer/drivers.ts', 'src/main/tools/ToolServer.ts',
  'src/main/memory/MemoryStore.ts', 'src/main/memory/memoryTools.ts', 'src/main/memory/memoryRules.ts',
  'src/main/memory/MemoryDrafts.ts',
  'src/main/browser/BrowserTools.ts',
  'src/renderer/src/components/BrowserView.tsx', 'src/renderer/src/styles/27-browser.css',
  'src/renderer/src/components/usePanePresence.ts',
  'src/renderer/src/components/WindowButtons.tsx',
  'src/renderer/src/components/ConversationNodes.tsx', 'src/renderer/src/styles/28-conversation-nodes.css', 'src/shared/remarkCjkEmphasis.ts',
  'src/shared/scrollPosition.ts',
  'src/main/core/schedule.ts', 'src/main/core/scheduleInput.ts',
  'src/renderer/src/components/FoxAvatar.tsx', 'src/renderer/src/components/MemoryManager.tsx',
  'src/renderer/src/components/SegmentedControl.tsx', 'src/renderer/src/tokens.css',
  'src/renderer/src/components/BackendLogo.tsx', 'src/renderer/src/assets/providers/LICENSE.md',
  'src/renderer/src/styles/02-controls.css', 'src/renderer/src/styles/24-fox-avatar.css', 'src/renderer/src/styles/25-memory.css'
];
for (const dir of ['plugins', 'testing']) for (const name of readdirSync(join(source, 'src/main/backends', dir))) if (/\.tsx?$/.test(name)) roots.push(`src/main/backends/${dir}/${name}`);
function copy(name) {
  const file = resolve(source, name), key = relative(source, file).replaceAll('\\', '/');
  if (!key.startsWith('src/') || key.includes('../')) throw Error(`Source escapes allowed directory: ${name}`);
  if (seen.has(key)) return;
  seen.add(key);
  const content = readFileSync(file, 'utf8'), target = join(dest, key);
  mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, content);
  const imports = [...content.matchAll(key.endsWith('.css') ? /@import\s+["']([^"']+)["']/g : /\b(?:from|import)\s*(?:\(\s*)?["']([^"']+)["']/g)].map(m => m[1]);
  for (const spec of imports) {
    if (!spec.startsWith('.') && !spec.startsWith('@shared/')) continue;
    const base = spec.startsWith('@shared/') ? join(source, 'src/shared', spec.slice(8)) : resolve(dirname(file), spec);
    const found = [base, base+'.ts', base+'.tsx', join(base, 'index.ts'), join(base, 'index.tsx')].find(path => existsSync(path) && /\.(ts|tsx|css|svg)$/.test(path));
    if (!found) throw Error(`Unresolved local import ${spec} in ${key}`);
    copy(relative(source, found));
  }
}
roots.forEach(copy);
cpSync(join(source, 'LICENSE'), join(dest, 'LICENSE'));
mkdirSync('resources/fenn', { recursive: true });
for (const name of ['mcp-bridge.mjs', 'win-input.ps1', 'icon.png', 'icon.ico', 'mock-agent.mjs']) cpSync(join(source, 'resources', name), join('resources/fenn', name));
const files = Object.fromEntries([...seen].sort().map(name => [name, createHash('sha256').update(readFileSync(join(dest,name),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
writeFileSync(join(dest, 'snapshot.json'), JSON.stringify({ origin:'https://github.com/goldenfox2025/fenn-code', hashFormat:'sha256-lf', note:'Explicit local source snapshot; includes local modifications. No runtime or build dependency on Fenn Code.', files }, null, 2)+'\n');
console.log(`Copied ${seen.size} source modules and local runtime resources.`);
