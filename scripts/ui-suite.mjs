// One entry point for the complete hidden UI/real-browser acceptance suite.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

async function run(file, args=[], env={}) {
  const child=spawn(process.execPath,[file,...args],{windowsHide:true,env:{...process.env,...env},stdio:['ignore','pipe','pipe']});
  let output='';
  child.stdout.on('data',chunk=>{output+=chunk;process.stdout.write(chunk);});
  child.stderr.pipe(process.stderr);
  await new Promise((done,reject)=>{child.once('error',reject);child.once('close',code=>code===0?done():reject(Error(`${file} failed (${code})`)));});
  return output;
}
const output=await run('scripts/ui.mjs');
const profile=output.match(/BOT_UI_PROFILE\s+([^\r\n]+)/)?.[1].trim();
if(!profile)throw Error('Main UI suite did not return its isolated profile.');
await run('scripts/ui-identities.mjs');
await run('scripts/ui-lifecycle.mjs');
await run('scripts/ui-details.mjs',[profile]);
await run('scripts/ui-layout.mjs',[profile]);
await run(resolve('node_modules/vitest/vitest.mjs'),['run','test/browser.integration.test.ts','--reporter=dot'],{FENN_BROWSER_INTEGRATION:'1'});
console.log('All Bot UI, lifecycle, group and browser-mode acceptance checks passed.');
