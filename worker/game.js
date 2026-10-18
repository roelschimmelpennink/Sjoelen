import {World, FIXED_DT, HALF_WIDTH, RADIUS, normalizeRamp, pocketOf, scoreCounts} from '../public/physics.js';

export class GameError extends Error {
  constructor(message, status=400) {super(message);this.status=status;}
}
const requireGame = (ok,message,status=400) => {if(!ok)throw new GameError(message,status);};
export function playerName(value) {
  requireGame(typeof value==='string','Vul je naam in.');
  const name=value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,24);
  requireGame(name.length>0,'Vul je naam in.');return name;
}
export function emptyBoard() {return {round:1,reserve:30,locked:[0,0,0,0],pucks:[],finished:false};}
export function boardCounts(board) {
  const counts=[...board.locked];for(const puck of board.pucks){const i=pocketOf(puck);if(i>=0)counts[i]++;}return counts;
}
export function createGame(id,name,tokenHash,ramp,now) {
  return {id,revision:1,phase:'waiting',players:[{name:playerName(name),tokenHash,board:emptyBoard(),lastAction:null}],turn:0,ramp:normalizeRamp(ramp),lastShot:null,readyAt:now,createdAt:now,rematch:[]};
}
export function joinGame(game,name,tokenHash) {
  requireGame(game.phase==='waiting'&&game.players.length===1,'Deze kamer heeft al twee spelers.',409);
  game.players.push({name:playerName(name),tokenHash,board:emptyBoard(),lastAction:null});game.phase='playing';game.revision++;return game;
}
export function validateAimPreview(game,seat,body,now) {
  requireGame(game.phase==='playing'&&game.turn===seat,'De andere speler is aan de beurt.',403);
  requireGame(body.revision===game.revision,'Deze instellingen horen bij een vorige beurt.',409);
  requireGame(now>=game.readyAt&&game.players[seat].board.reserve>0&&!game.players[seat].board.finished,'Je kunt nu geen worp voorbereiden.',409);
  const {position,angle,power,charging}=body;
  requireGame([position,angle,power].every(Number.isFinite)&&Math.abs(position)<=100&&Math.abs(angle)<=30&&power>=5&&power<=100&&typeof charging==='boolean','Ongeldige instellingen.');
  return {position,angle,power,charging};
}
export function actGame(game,seat,body,now) {
  requireGame(typeof body.actionId==='string'&&/^[\w-]{8,80}$/.test(body.actionId),'Ongeldige actie.');
  if(game.players[seat].lastAction===body.actionId)return false;
  requireGame(body.revision===game.revision,'De kamer is bijgewerkt. Probeer opnieuw.',409);
  if(body.type==='rematch') {
    requireGame(game.phase==='finished','Speel deze wedstrijd eerst uit.',409);
    requireGame(now>=game.readyAt,'De laatste schijven rollen nog uit.',409);
    if(!game.rematch.includes(seat))game.rematch.push(seat);
    if(game.rematch.length===2){for(const p of game.players)p.board=emptyBoard();game.phase='playing';game.turn=1-game.turn;game.lastShot=null;game.rematch=[];game.readyAt=now;}
  } else {
    requireGame(game.phase==='playing','Wacht tot beide spelers in de kamer zijn.',409);
    requireGame(game.turn===seat,'De andere speler is aan de beurt.',403);
    requireGame(now>=game.readyAt,'De schijven rollen nog uit.',409);
    const board=game.players[seat].board;
    if(body.type==='next') {
      requireGame(board.reserve===0&&!board.finished&&board.round<3,'Je kunt nu geen volgende beurt starten.',409);
      const counts=boardCounts(board),unscored=board.pucks.filter(p=>pocketOf(p)<0).length;
      board.locked=counts;board.pucks=[];board.reserve=unscored;board.round++;
    } else {
      requireGame(body.type==='shot','Onbekende actie.');
      requireGame(board.reserve>0&&!board.finished,'Geen schijven meer over.',409);
      const {position,angle,power}=body;
      requireGame([position,angle,power].every(Number.isFinite)&&Math.abs(position)<=100&&Math.abs(angle)<=30&&power>=5&&power<=100,'Ongeldige richting of kracht.');
      const simulation=new World();simulation.restore(board.pucks);simulation.setRamp(game.ramp,false);
      const start=simulation.snapshot();const puck=simulation.launch(position/100*(HALF_WIDTH-RADIUS-.006),angle,power);
      requireGame(puck,'Hier ligt al een schijf. Kies een andere startpositie.',409);
      let steps=0;do {simulation.step();steps++;} while((simulation.moving||steps<20)&&steps<2880);
      for(const p of simulation.pucks)p.vx=p.vz=p.vy=p.spin=0;
      board.pucks=simulation.snapshot();board.reserve--;
      const total=boardCounts(board).reduce((a,b)=>a+b,0);
      board.finished=total===30||(board.reserve===0&&board.round===3);
      game.lastShot={id:body.actionId,seat,puckId:puck.id,start,position,angle,power,ramp:{...game.ramp},duration:steps*FIXED_DT,at:now};
      game.readyAt=now+Math.ceil(game.lastShot.duration*1000)+350;
      const other=1-seat;game.turn=game.players[other].board.finished?seat:other;
      if(game.players.every(p=>p.board.finished))game.phase='finished';
    }
  }
  game.players[seat].lastAction=body.actionId;game.revision++;return true;
}
export function viewGame(game,seat,seen,now) {
  return {...game,you:seat,players:game.players.map((p,i)=>({name:p.name,board:p.board,score:scoreCounts(boardCounts(p.board)),online:now-seen[i]<25000})),serverNow:now};
}
