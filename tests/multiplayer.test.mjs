import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {migrateLocalDatabase} from '../scripts/local-database.mjs';
import {multiplayerApi} from '../worker/api.js';
import {createGame,joinGame,actGame,viewGame,emptyBoard,boardCounts} from '../worker/game.js';
import {World,FIXED_DT,HALF_WIDTH,RADIUS} from '../public/physics.js';

async function database() {
  const db=new DatabaseSync(':memory:');await migrateLocalDatabase(db);
  return {prepare(sql){return {bind(...args){return {async first(){return db.prepare(sql).get(...args)||null;},async run(){const result=db.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}};}};}};}};
}
const request=(path,body,token,origin)=>new Request('https://sjoelen.test/api/rooms'+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...(origin?{Origin:origin}:{})},...(body?{body:JSON.stringify(body)}:{})});
async function call(env,path,body,token,origin){const response=await multiplayerApi(request(path,body,token,origin),env);return {status:response.status,...await response.json()};}
function duel(){return joinGame(createGame('room','Roel','a',{},1000),'Lisa','b');}
const shot=(game,id='shot-test-0001')=>({type:'shot',actionId:id,revision:game.revision,position:0,angle:0,power:62});

test('A public invitation admits exactly two seats and never reveals player credentials',async()=>{
  const env={DB:await database()},host=await call(env,'',{name:'Roel'});
  assert.equal(host.status,201);assert.match(host.token,/^[a-f0-9]{64}$/);const id=host.room.id;
  assert.equal(host.room.phase,'waiting');assert.equal(JSON.stringify(host.room).includes('tokenHash'),false);
  const guests=await Promise.all(['Lisa','Piet'].map(name=>call(env,'/'+id+'/join',{name})));
  assert.deepEqual(guests.map(x=>x.status).sort(),[200,409]);
  const guest=guests.find(x=>x.status===200);assert.equal(guest.room.you,1);assert.equal(guest.room.players.length,2);
  assert.equal((await call(env,'/'+id)).status,401);
  assert.equal((await call(env,'/'+id,null,'1'.repeat(64))).status,403);
  const resumed=await call(env,'/'+id,null,host.token);assert.equal(resumed.room.you,0);assert.equal(resumed.room.phase,'playing');
  assert.equal((await call(env,'/'+id+'?since='+resumed.room.revision,null,host.token)).unchanged,true);
});
test('Turn authority, stale revisions and duplicate delivery cannot create extra discs',()=>{
  const game=duel(),input=shot(game);
  assert.throws(()=>actGame(game,1,input,1000),/andere speler/);
  assert.equal(actGame(game,0,input,1000),true);assert.equal(game.turn,1);assert.equal(game.players[0].board.reserve,29);assert.equal(game.players[1].board.reserve,30);
  assert.equal(actGame(game,0,input,1001),false);assert.equal(game.players[0].board.reserve,29);
  assert.throws(()=>actGame(game,1,shot(game,'shot-test-0002'),1001),/rollen/);
  assert.throws(()=>actGame(game,1,{...shot(game),revision:1},game.readyAt),/bijgewerkt/);
  assert.throws(()=>actGame(game,1,{...shot(game),power:Infinity},game.readyAt),/kracht/);
  assert.throws(()=>actGame(game,1,{...shot(game),position:1000},game.readyAt),/kracht/);
});
test('Server and viewing client reproduce the same ramp shot from a shared command',()=>{
  const game=duel();game.ramp={enabled:true,x:0,z:.175};const input=shot(game);input.power=100;
  actGame(game,0,input,1000);const simulation=new World();simulation.setRamp(game.ramp,false);simulation.restore(game.lastShot.start);
  simulation.launch(input.position/100*(HALF_WIDTH-RADIUS-.006),input.angle,input.power);
  for(let i=0;i<Math.round(game.lastShot.duration/FIXED_DT);i++)simulation.step();
  for(const puck of simulation.pucks)puck.vx=puck.vz=puck.vy=puck.spin=0;
  assert.deepEqual(simulation.snapshot(),game.players[0].board.pucks);
});
test('A complete match preserves each board, returns missed discs and requires both rematch votes',()=>{
  const game=duel();let commands=0;
  while(game.phase==='playing'&&commands<200){
    const seat=game.turn,board=game.players[seat].board;
    // A full board at the end of round 3 remains a legal server-owned state.
    if(board.reserve===0)actGame(game,seat,{type:'next',actionId:'next-round-'+commands,revision:game.revision},game.readyAt);
    else {
      const simulation=new World();simulation.restore(board.pucks);
      const positions=[-100,-75,-50,-25,0,25,50,75,100];const position=positions.find(x=>simulation.launch(x/100*(HALF_WIDTH-RADIUS-.006),0,80));
      assert.notEqual(position,undefined,'There must be a free launch position in this fixture');
      actGame(game,seat,{...shot(game,'full-game-'+commands),position,power:80},game.readyAt);
    }
    commands++;
  }
  assert.equal(game.phase,'finished');assert.ok(commands<=182);
  for(const player of game.players){assert.equal(player.board.finished,true);assert.equal(player.board.reserve+player.board.pucks.length+player.board.locked.reduce((a,b)=>a+b),30);}
  actGame(game,0,{type:'rematch',actionId:'rematch-player-0',revision:game.revision},game.readyAt);assert.equal(game.phase,'finished');
  actGame(game,1,{type:'rematch',actionId:'rematch-player-1',revision:game.revision},game.readyAt);assert.equal(game.phase,'playing');assert.deepEqual(game.players[0].board,emptyBoard());assert.deepEqual(game.players[1].board,emptyBoard());
});
test('API rejects cross-site writes, oversized payloads and simultaneous out-of-turn actions',async()=>{
  const env={DB:await database()};assert.equal((await call(env,'',{name:'X'},null,'https://evil.test')).status,403);
  assert.equal((await call(env,'',{name:'x'.repeat(5000)})).status,413);
  const host=await call(env,'',{name:'Roel'}),id=host.room.id;
  const guest=await call(env,'/'+id+'/join',{name:'Lisa'}),input=shot(guest.room);
  const results=await Promise.all([call(env,'/'+id+'/action',input,guest.token),call(env,'/'+id+'/action',input,host.token)]);
  assert.equal(results[0].status,403);assert.equal(results[1].status,200);
  const repeat=await call(env,'/'+id+'/action',input,host.token);assert.equal(repeat.status,200);assert.equal(repeat.room.players[0].board.reserve,29);
  const ping=await call(env,'/'+id+'/ping',{},guest.token);assert.equal(ping.ok,true);
});

test('A guest needs a nonblank name before a seat is occupied',async()=>{
  const env={DB:await database()},host=await call(env,'',{name:'Roel'}),id=host.room.id;
  assert.equal((await call(env,'/'+id+'/join',{name:'   '})).status,400);
  const waiting=await call(env,'/'+id,null,host.token);
  assert.equal(waiting.room.phase,'waiting');assert.equal(waiting.room.players.length,1);
  const guest=await call(env,'/'+id+'/join',{name:'  Lisa  '});assert.equal(guest.room.players[1].name,'Lisa');
});

test('Live placement, aim and charging reach the opponent without changing game state',async()=>{
  const env={DB:await database()},host=await call(env,'',{name:'Roel'}),id=host.room.id;
  const guest=await call(env,'/'+id+'/join',{name:'Lisa'}),revision=guest.room.revision;
  const aim={revision,position:47,angle:-12.5,power:73,charging:false};
  assert.equal((await call(env,'/'+id+'/preview',aim,host.token)).ok,true);
  const first=await call(env,'/'+id+'?since='+revision,null,guest.token);
  assert.equal(first.unchanged,true);
  for(const key of ['position','angle','power','charging','revision'])assert.equal(first.preview[key],aim[key]);
  assert.equal(first.preview.seat,0);assert.ok(Number.isFinite(first.preview.updatedAt));
  await call(env,'/'+id+'/preview',{...aim,power:95,charging:true},host.token);
  const charging=await call(env,'/'+id+'?since='+revision,null,guest.token);
  assert.equal(charging.preview.power,95);assert.equal(charging.preview.charging,true);
  await call(env,'/'+id+'/preview',aim,host.token);
  const state=await call(env,'/'+id,null,guest.token);
  assert.equal(state.preview.charging,false);assert.equal(state.room.revision,revision);
  assert.equal(state.room.players[0].board.reserve,30);assert.equal(state.room.players[0].score,0);
});

test('Preview writes require the active seat and current turn, and expire on a real throw',async()=>{
  const env={DB:await database()},host=await call(env,'',{name:'Roel'}),id=host.room.id;
  const guest=await call(env,'/'+id+'/join',{name:'Lisa'}),revision=guest.room.revision;
  const aim={revision,position:40,angle:15,power:50,charging:false};
  assert.equal((await call(env,'/'+id+'/preview',aim)).status,401);
  assert.equal((await call(env,'/'+id+'/preview',aim,guest.token)).status,403);
  assert.equal((await call(env,'/'+id+'/preview',{...aim,revision:revision-1},host.token)).status,409);
  for(const invalid of [{power:101},{position:101},{angle:-31},{power:null},{charging:'yes'}])assert.equal((await call(env,'/'+id+'/preview',{...aim,...invalid},host.token)).status,400);
  await call(env,'/'+id+'/preview',aim,host.token);
  const thrown=await call(env,'/'+id+'/action',{type:'shot',actionId:'preview-to-throw',revision,position:aim.position,angle:aim.angle,power:aim.power},host.token);
  assert.equal(thrown.status,200);assert.equal(thrown.preview,null);assert.equal(thrown.room.turn,1);
  assert.equal((await call(env,'/'+id+'/preview',aim,host.token)).status,403);
  const opponent=await call(env,'/'+id,null,guest.token);assert.equal(opponent.preview,null);
});

test('Local upgrades apply each new migration once and preserve existing rooms',async()=>{
  const db=new DatabaseSync(':memory:');db.exec(await readFile(new URL('../drizzle/0000_multiplayer.sql',import.meta.url),'utf8'));
  db.prepare('INSERT INTO rooms (id,revision,data,expires_at,seen0) VALUES (?,?,?,?,?)').run('retained-room',2,'retained-data',999999,1234);
  await migrateLocalDatabase(db);await migrateLocalDatabase(db);
  assert.equal(db.prepare('SELECT data FROM rooms WHERE id=?').get('retained-room').data,'retained-data');
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name='room_previews'").get());
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM __local_migrations').get().total,2);db.close();
});
