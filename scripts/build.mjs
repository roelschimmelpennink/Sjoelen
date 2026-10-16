import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import path from 'node:path';

// The Worker serves embedded asset bytes; no separate asset binding is needed.
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.ttf':'font/ttf','.txt':'text/plain; charset=utf-8'};
const assets={};
async function collect(dir,prefix='') {
  for(const entry of await readdir(dir,{withFileTypes:true})) {
    const name=prefix+'/'+entry.name,file=path.join(dir,entry.name);
    if(entry.isDirectory())await collect(file,name);
    else assets[name]=[types[path.extname(entry.name)]||'application/octet-stream',(await readFile(file)).toString('base64')];
  }
}
await collect('public');
const modules=['public/physics.js','worker/game.js','worker/api.js'];
const source=(await Promise.all(modules.map(file=>readFile(file,'utf8')))).map(s=>s.replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'')).join('\n');
const worker=source+'\nconst STATIC_ASSETS='+JSON.stringify(assets)+`;\nexport default {async fetch(request,env){const url=new URL(request.url);if(url.pathname.startsWith('/api/'))return multiplayerApi(request,env);if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});const asset=STATIC_ASSETS[url.pathname==='/'?'/index.html':url.pathname];if(!asset)return new Response('Niet gevonden',{status:404});const bytes=Uint8Array.from(atob(asset[1]),c=>c.charCodeAt(0));return new Response(request.method==='HEAD'?null:bytes,{headers:{'Content-Type':asset[0],'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});}};\n`;
await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await writeFile('dist/server/index.js',worker);await writeFile('dist/.openai/hosting.json',await readFile('.openai/hosting.json'));
console.log(`Built Worker with ${Object.keys(assets).length} assets (${Math.round(Buffer.byteLength(worker)/1024)} KB).`);
