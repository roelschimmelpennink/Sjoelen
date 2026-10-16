import {GameError, createGame, joinGame, actGame, viewGame} from './game.js';

const jsonResponse = (data,status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
const randomHex = bytes => Array.from(crypto.getRandomValues(new Uint8Array(bytes)),b=>b.toString(16).padStart(2,'0')).join('');
async function tokenDigest(value) {
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
}
async function requestBody(request) {
  if(!request.headers.get('Content-Type')?.includes('application/json'))throw new GameError('Verstuur JSON.',415);
  if(Number(request.headers.get('Content-Length')||0)>4096)throw new GameError('Bericht te groot.',413);
  const reader=request.body?.getReader();if(!reader)throw new GameError('Leeg bericht.');
  const chunks=[];let size=0;while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();throw new GameError('Bericht te groot.',413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try {const body=JSON.parse(new TextDecoder().decode(bytes));if(!body||typeof body!=='object'||Array.isArray(body))throw new Error();return body;} catch {throw new GameError('Ongeldig bericht.');}
}
export async function multiplayerApi(request,env) {
  const url=new URL(request.url),now=Date.now();
  try {
    if(!env.DB)throw new GameError('Online spelen is tijdelijk niet beschikbaar.',503);
    const origin=request.headers.get('Origin');
    if(request.method!=='GET'&&origin&&origin!==url.origin)throw new GameError('Verzoek van een andere website geweigerd.',403);
    const match=url.pathname.match(/^\/api\/rooms(?:\/([a-f0-9]{32})(?:\/(join|action|ping))?)?$/);
    if(!match)return jsonResponse({error:'Niet gevonden.'},404);
    const [,id,operation]=match;
    if(request.method==='POST'&&!id) {
      const body=await requestBody(request);
      const ip=request.headers.get('CF-Connecting-IP')||'local';
      const limitKey=await tokenDigest(`${ip}:${Math.floor(now/86400000)}`);
      const limit=await env.DB.prepare('INSERT INTO room_limits (id,count,expires_at) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 WHERE count<30 RETURNING count').bind(limitKey,now+86400000).first();
      if(!limit)throw new GameError('Vandaag zijn genoeg kamers gemaakt. Probeer het morgen opnieuw.',429);
      const roomId=randomHex(16),token=randomHex(32),game=createGame(roomId,body.name,await tokenDigest(token),body.ramp,now);
      await env.DB.prepare('INSERT INTO rooms (id,revision,data,expires_at,seen0) VALUES (?,?,?,?,?)').bind(roomId,game.revision,JSON.stringify(game),now+86400000,now).run();
      await env.DB.prepare('DELETE FROM rooms WHERE id IN (SELECT id FROM rooms WHERE expires_at<? LIMIT 100)').bind(now).run();
      await env.DB.prepare('DELETE FROM room_limits WHERE expires_at<?').bind(now).run();
      return jsonResponse({token,room:viewGame(game,0,[now,0],now)},201);
    }
    if(!id)throw new GameError('Niet gevonden.',404);
    const row=await env.DB.prepare('SELECT * FROM rooms WHERE id=?').bind(id).first();
    if(!row||row.expires_at<now)throw new GameError('Deze kamer is verlopen. Maak een nieuwe kamer.',404);
    const game=JSON.parse(row.data);
    if(request.method==='POST'&&operation==='join') {
      const body=await requestBody(request),token=randomHex(32);joinGame(game,body.name,await tokenDigest(token));
      const result=await env.DB.prepare('UPDATE rooms SET data=?,revision=?,seen1=? WHERE id=? AND revision=?').bind(JSON.stringify(game),game.revision,now,id,row.revision).run();
      if(!result.meta.changes)throw new GameError('Deze kamer heeft al twee spelers.',409);
      return jsonResponse({token,room:viewGame(game,1,[row.seen0,now],now)});
    }
    const bearer=request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if(!bearer)throw new GameError('Open je uitnodiging of maak een kamer.',401);
    const hash=await tokenDigest(bearer),seat=game.players.findIndex(p=>p.tokenHash===hash);
    if(seat<0)throw new GameError('Je hoort niet bij deze kamer.',403);
    if(request.method==='POST'&&operation==='ping') {
      await env.DB.prepare(seat===0?'UPDATE rooms SET seen0=? WHERE id=?':'UPDATE rooms SET seen1=? WHERE id=?').bind(now,id).run();
      return jsonResponse({ok:true});
    }
    if(request.method==='POST'&&operation==='action') {
      const body=await requestBody(request);
      if(actGame(game,seat,body,now)) {
        const result=await env.DB.prepare('UPDATE rooms SET data=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(game),game.revision,id,row.revision).run();
        if(!result.meta.changes)throw new GameError('De kamer is bijgewerkt. Probeer opnieuw.',409);
      }
    } else if(request.method!=='GET'||operation)throw new GameError('Niet gevonden.',404);
    if(request.method==='GET'&&Number(url.searchParams.get('since'))===game.revision)return jsonResponse({unchanged:true,serverNow:now,online:[row.seen0,row.seen1].map(t=>now-t<25000)});
    return jsonResponse({room:viewGame(game,seat,[row.seen0,row.seen1],now)});
  } catch(error) {
    if(!(error instanceof GameError))console.error('Multiplayer API:',error.message);
    return jsonResponse({error:error instanceof GameError?error.message:'De verbinding hapert. Probeer het zo nog eens.'},error.status||500);
  }
}
