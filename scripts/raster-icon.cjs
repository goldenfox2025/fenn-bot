const {app,BrowserWindow}=require('electron');
const {readFileSync,writeFileSync,mkdtempSync}=require('node:fs');
const {resolve,join}=require('node:path');
app.setPath('userData',mkdtempSync(join(require('node:os').tmpdir(),'fenn-icon-')));
app.whenReady().then(async()=>{
  const window=new BrowserWindow({width:256,height:256,show:false,webPreferences:{sandbox:true}});
  await window.loadURL('data:text/html,<html></html>');
  const src='data:image/svg+xml;base64,'+readFileSync('resources/bot-icon.svg').toString('base64');
  const png=await window.webContents.executeJavaScript(`(async()=>{const image=new Image();image.src=${JSON.stringify(src)};await image.decode();const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;canvas.getContext('2d').drawImage(image,0,0);return canvas.toDataURL('image/png').split(',')[1]})()`);
  writeFileSync(resolve('resources/bot-icon.png'),Buffer.from(png,'base64'));app.quit();
}).catch(error=>{console.error(error);app.exit(1)});
