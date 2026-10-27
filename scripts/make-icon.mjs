import { writeFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import electron from 'electron';
import { foxHead, foxCheeks, foxEarLeft, foxEarRight, foxNose } from '../vendor/fenn/src/renderer/src/components/foxGeometry.ts';
const ink='#142b44',paper='#edf3f8';
writeFileSync('resources/bot-icon.svg',`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 80 80">
<rect width="80" height="80" rx="19" fill="${paper}"/>
<g transform="translate(8 6)">
<path d="${foxHead}" fill="${ink}" stroke="${ink}" stroke-width="2.5" stroke-linejoin="round"/>
<path d="${foxEarLeft}" fill="${paper}" opacity=".65"/><path d="${foxEarRight}" fill="${paper}" opacity=".65"/>
<path d="${foxCheeks}" fill="${paper}"/>
<g fill="${ink}"><circle cx="23" cy="37" r="1.9"/><circle cx="41" cy="37" r="1.9"/><path d="${foxNose}"/></g>
</g></svg>\n`);
await promisify(execFile)(electron,['scripts/raster-icon.cjs'],{windowsHide:true,timeout:15000});
console.log('Bot icon generated from the same fennec geometry as its avatars.');
