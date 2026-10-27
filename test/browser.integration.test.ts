import { describe, expect, it, vi } from 'vitest';
import { chromium, type BrowserContext } from 'playwright-core';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { BrowserTools } from '../src/main/Browser';
import { Policy } from '../src/main/Policy';

const integration = process.env.FENN_BROWSER_INTEGRATION === '1' ? describe : describe.skip;
integration('owned real CDP browser connections', () => {
  it('preserves existing tabs, chooses a browser, scopes Bot tabs and falls back only in auto mode', async () => {
    const root = mkdtempSync(join(tmpdir(),'fenn-cdp-test-')), contexts: BrowserContext[] = [];
    const server=createServer((_,response)=>{response.setHeader('content-type','text/html');response.end('<title>Fixture page</title><h1>Local browser evidence</h1>');});
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const url=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
    const launch = async (name: string) => {
      const dir=join(root,name), context=await chromium.launchPersistentContext(dir,{channel:'chrome',headless:true,args:['--remote-debugging-port=0']});
      contexts.push(context);
      const endpoint='http://127.0.0.1:'+readFileSync(join(dir,'DevToolsActivePort'),'utf8').split('\n')[0];
      const original=context.pages()[0];await original.goto(url+'/?user-tab='+name);
      return {context,endpoint,original,originalUrl:original.url()};
    };
    const policy=new Policy(()=>{}), config={browserMode:'auto' as const,cdpUrl:'http://127.0.0.1:1',computerEnabled:false,theme:'light' as const};
    const tools=new BrowserTools(root,()=>config,policy,()=>{});
    try {
      const first=await launch('first'), second=await launch('second');
      // Discovery is fixture-scoped; never connect to the user's daily Chrome or upload browser.
      const discover=vi.spyOn(tools,'discover').mockResolvedValue([{id:first.endpoint,label:'First fixture'},{id:second.endpoint,label:'Second fixture'}]);
      const ask=vi.spyOn(policy,'ask').mockImplementation(async request=>({allow:true,scope:'once',...(request.capability==='browser.choose'?{optionId:second.endpoint}:{})}));
      const open=async(id:string,mode:'auto'|'existing'|'isolated')=>{policy.begin(id,id);return tools.tools(id,id).find(tool=>tool.name==='browser_open')!.run({url,mode},{conversationId:id});};
      await open('one','auto');await open('two','existing');
      expect(ask.mock.calls.some(([request])=>request.capability==='browser.choose')).toBe(true);
      expect(tools.info('one')?.mode).toBe('existing');expect(second.context.pages()).toHaveLength(3);expect(first.context.pages()).toHaveLength(1);
      expect(second.original.url()).toBe(second.originalUrl);expect(second.original.isClosed()).toBe(false);
      await tools.stop('one');expect(second.context.pages()).toHaveLength(2);expect(tools.info('two')).not.toBeNull();
      discover.mockResolvedValue([]);
      await expect(open('missing','existing')).rejects.toThrow('没有可连接');
      await open('fallback','auto');expect(tools.info('fallback')?.mode).toBe('isolated');
      await tools.close();expect(second.original.isClosed()).toBe(false);expect(second.original.url()).toBe(second.originalUrl);
    } finally {await tools.close();for(const context of contexts)await context.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
  },60000);
});
