// Clean-source build: dependencies may be reused, application source may not.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
mkdirSync(resolve('.local'), { recursive: true });
const run = promisify(execFile), root = mkdtempSync(resolve('.local/standalone-'));
const manifest = JSON.parse(readFileSync('vendor/fenn/snapshot.json','utf8'));
for (const [name, expected] of Object.entries(manifest.files)) {
  const actual = createHash('sha256').update(readFileSync(join('vendor/fenn',name),'utf8').replace(/\r\n/g,'\n')).digest('hex');
  if (actual !== expected) throw Error(`Source snapshot changed: ${name}. Review changes and refresh its manifest.`);
}
for (const file of ['src', 'vendor', 'resources', 'package.json', 'package-lock.json', 'tsconfig.json', 'electron.vite.config.ts']) cpSync(resolve(file),join(root,file),{recursive:true});
symlinkSync(realpathSync('node_modules'),join(root,'node_modules'),process.platform==='win32'?'junction':'dir');
for (const [script,args] of [['typescript/bin/tsc',['--noEmit']],['electron-vite/bin/electron-vite.js',['build']]]) {
  try { await run(process.execPath,[join(root,'node_modules',script),...args],{cwd:root,windowsHide:true,timeout:60000,maxBuffer:2*1024*1024}); }
  catch(error) { console.error(error.stdout || '',error.stderr || ''); throw error; }
}
console.log(`PASS clean-source typecheck/build with ${Object.keys(manifest.files).length} local platform modules; no sibling source checkout.`);
