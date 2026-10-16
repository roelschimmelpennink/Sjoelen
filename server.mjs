import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {multiplayerApi} from './worker/api.js';
await mkdir('.local',{recursive:true});
const sqlite=new DatabaseSync('.local/rooms.sqlite');
if(!sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='rooms'").get())sqlite.exec(await readFile('drizzle/0000_multiplayer.sql','utf8'));
const DB={prepare(sql){return {bind(...args){return {async first(){return sqlite.prepare(sql).get(...args)||null;},async run(){const result=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}};}};}};}};
const root = path.resolve('public');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.ttf': 'font/ttf' };
const server = http.createServer(async (req, res) => {
  try {
    const url=new URL(req.url,`http://${req.headers.host}`);
    if(url.pathname.startsWith('/api/')) {
      const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>4096){res.writeHead(413).end();return;}chunks.push(chunk);}
      const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
      const response=await multiplayerApi(request,{DB});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    const pathname = decodeURIComponent(url.pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(content);
  } catch { res.writeHead(404).end('Niet gevonden'); }
});
server.listen(Number(process.env.PORT)||4173, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${server.address().port}`));
