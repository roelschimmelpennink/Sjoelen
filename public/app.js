import { World, FIXED_DT, HALF_WIDTH, RADIUS, LAUNCH_Z, CENTERS, VALUES, RAMP_MAX_X, normalizeRamp, pocketOf, scoreCounts, clamp } from './physics.js';
import { SjoelScene } from './scene.js';
import { HOLD_THRESHOLD_MS, powerForHold, recordReplayImpact, replayFocusAt } from './experience.js';
import {Multiplayer} from './multiplayer.js';

const $ = id => document.getElementById(id);
const inputs = ['position','angle','power'].map($);
const storage = { get(key) {try{return JSON.parse(localStorage.getItem(key));}catch{return null;}},set(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{}} };
const maxX = HALF_WIDTH - RADIUS - 0.006;
let round = 1, reserve = 30, locked = [0,0,0,0], moving = false, finished = false;
let best = clamp(Number(storage.get('sjoelstudio-best')) || 0, 0, 200);
let lastShot = null, frames = [], shotTime = 0, steps = 0, accumulator = 0;
let replay = null, toastTimer, scene, animation;
let previousScore = 0;
let charge = null, suppressClickUntil = 0, activeShot = null;
let rampPlacement=false;
let online=null,onlineRevision=0,onlineShotId=null,onlineAnimating=false,onlineViewingSeat=0;
let onlineOwnAim=null;
const orbitHint = $('orbit-hint').innerHTML;

class WoodAudio {
  constructor() { this.enabled = storage.get('sjoelstudio-sound') === true; this.context = null; this.lastHit = -10; }
  init() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.context = new AudioContext();
      this.noise = this.context.createBuffer(1, this.context.sampleRate * 0.15, this.context.sampleRate);
      const channel = this.noise.getChannelData(0);
      for(let i=0;i<channel.length;i++)channel[i]=(Math.random()*2-1)*Math.exp(-i/channel.length*9);
    }
    if(this.context.state==='suspended')this.context.resume().catch(()=>{});
  }
  knock(intensity, kind = 'puck') {
    if(!this.enabled||!this.context||replay)return;
    const ctx=this.context,now=ctx.currentTime;
    if(now-this.lastHit<0.028)return;
    this.lastHit=now;
    const gain=ctx.createGain();gain.gain.setValueAtTime(clamp(intensity*0.15,0.008,0.2),now);gain.gain.exponentialRampToValueAtTime(0.001,now+0.095);gain.connect(ctx.destination);
    const oscillator=ctx.createOscillator();oscillator.type='sine';oscillator.frequency.setValueAtTime(kind==='wall'?430:700,now);oscillator.frequency.exponentialRampToValueAtTime(180,now+0.05);oscillator.connect(gain);oscillator.start(now);oscillator.stop(now+0.1);
    const noise=ctx.createBufferSource();noise.buffer=this.noise;const filter=ctx.createBiquadFilter();filter.type='bandpass';filter.frequency.value=kind==='wall'?1200:2200;filter.Q.value=0.8;noise.connect(filter);filter.connect(gain);noise.start(now);noise.stop(now+0.12);
  }
  slide(power) {if(!this.enabled)return;this.init();if(!this.context)return;const ctx=this.context,source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();source.buffer=this.noise;filter.type='lowpass';filter.frequency.value=1800;gain.gain.value=power/100*0.14;source.connect(filter);filter.connect(gain);gain.connect(ctx.destination);source.start();}
}
const audio = new WoodAudio();
const world = new World((intensity,kind,impact)=>{
  if(intensity>0.07)audio.knock(intensity,kind);
  if(moving&&impact)recordReplayImpact(activeShot.focusTimeline,impact,shotTime+FIXED_DT);
});

function announce(text) {$('announcer').textContent=text;}
function toast(text) {clearTimeout(toastTimer);$('shot-toast').textContent=text;$('shot-toast').classList.add('visible');toastTimer=setTimeout(()=>$('shot-toast').classList.remove('visible'),3500);announce(text);}
function currentCounts() {return world.counts().map((v,i)=>v+locked[i]);}
function currentScore() {return scoreCounts(currentCounts());}
function updateRange(input) {input.style.setProperty('--fill',`${(input.value-input.min)/(input.max-input.min)*100}%`);}
function aimValues() {return {position:Number($('position').value),angle:Number($('angle').value),power:Number($('power').value)};}
function setAimInputs(aim) {for(const key of ['position','angle','power'])$(key).value=aim[key];}
function updateAim(broadcast=false) {
  const remote=!moving&&!replay?online?.remoteAim:null;
  if(remote)setAimInputs(remote);
  if(broadcast&&online?.room&&online.room.turn===online.room.you){onlineOwnAim=aimValues();online.publishAim({...onlineOwnAim,charging:!!charge});}
  inputs.forEach(updateRange);
  const x=Number($('position').value)/100*maxX,angle=Number($('angle').value);
  const cm=Math.round(Math.abs(x)*100);
  $('position-value').textContent=cm===0?'Midden':`${cm} cm ${x<0?'links':'rechts'}`;
  $('angle-value').textContent=`${angle>0?'+':''}${angle.toLocaleString('nl-NL')}°`;
  $('power-value').innerHTML=`${$('power').value}<span>%</span>`;
  scene?.setAim(x,angle,Number($('power').value),!moving&&!replay&&!finished&&reserve>0&&(!(online?.room&&online.busy)||!!remote));
}
function updateUI() {
  const onlineLocked=!!online?.room&&online.busy;
  $('score-label').textContent=online?.room?`SCORE VAN ${online.room.players[onlineViewingSeat]?.name||'JOU'}`:'JOUW SCORE';
  $('round').textContent=round;$('remaining').textContent=reserve;$('best').textContent=best;
  const counts=currentCounts(),score=scoreCounts(counts);counts.forEach((v,i)=>$(`count-${i}`).textContent=v);$('score').textContent=score;
  const ready=reserve===0&&!moving&&!finished;
  inputs.forEach(input=>input.disabled=moving||!!replay||!!charge||finished||ready||onlineLocked);
  $('launch').disabled=moving||!!replay||rampPlacement||onlineLocked||!!online?.room&&finished;
  $('launch').classList.toggle('charging',!!charge);
  $('launch').innerHTML=`<span>${charge?'Kracht kiezen…':moving?'De schijven glijden…':finished?'Speel nog eens':ready?'Volgende beurt':'Schuiven maar'}</span><svg><use href="#${moving?'i-orbit':'i-arrow'}"/></svg>`;
  $('keyboard-hint').innerHTML=charge?'Laat los om te schuiven · <kbd>Esc</kbd> annuleert':moving?`Worp met <b>${activeShot.power}%</b> kracht · even uit laten rollen.`:replay?'Je kijkt naar je laatste worp.':finished?'Een nieuw spel, een nieuwe kans.':ready?'De overgebleven schijven gaan weer terug.':'Klik voor ingestelde kracht · houd vast om op te laden<br>Ook met <kbd>spatie</kbd> · <kbd>Esc</kbd> annuleert';
  $('turn-title').textContent=finished?'Mooi gespeeld.':moving?'Daar gaat ’ie.':ready?'Nog een kans.':'Het is jouw beurt.';
  $('turn-description').textContent=finished?`${score} punten. Tijd voor een nieuwe ronde?`:moving?'Laat het hout zijn werk doen.':ready?'Speel de gemiste schijven nog eens.':'Plaats, richt en geef ’m een zetje.';
  $('scene-status').textContent=replay?`${replay.cinematic?'Filmische replay':'Je laatste worp'} · ${lastShot.power}% kracht`:moving?`Schijf onderweg · ${activeShot.power}% kracht`:finished?'Een mooi potje sjoelen':'Jouw sjoelbak';
  $('replay-btn').disabled=!lastShot||moving||!!replay||!!charge;
  scene?.setStock(reserve);scene?.setLocked(locked);if(!replay)scene?.setRamp(world.ramp);updateAim();updateRampUI();
  if(online?.room){
    const room=online.room,player=room.players[onlineViewingSeat];
    if(!moving&&!replay){
      $('turn-title').textContent=!online.connected?'Even opnieuw verbinden…':room.phase==='waiting'?'Wie schuift er aan?':room.phase==='finished'?'Mooi gespeeld.':room.turn===room.you?'Jij bent aan de beurt.':`${room.players[room.turn].name} is aan de beurt.`;
      $('turn-description').textContent=room.phase==='waiting'?'Deel je uitnodiging via de knop boven de bak.':room.phase==='finished'?$('online-status').textContent:room.turn===room.you?'Plaats, richt en geef ’m een zetje.':'Je kijkt live mee. Straks is jouw bak aan de beurt.';
      $('launch').querySelector('span').textContent=online.pending?'Worp versturen…':room.phase==='waiting'?'Wacht op speler 2':room.phase==='finished'?'Wedstrijd afgelopen':onlineLocked?'Even wachten…':ready?'Volgende beurt':'Schuiven maar';
    }
    $('scene-status').textContent=replay?'Filmische replay':moving?`${player?.name} schuift · ${activeShot.power}% kracht`:`De bak van ${player?.name||'jou'}`;
    $('keyboard-hint').innerHTML=moving?'Jullie zien dezelfde worp.':onlineLocked?'Je camera en replay blijven beschikbaar.':'Klik voor ingestelde kracht · houd vast om op te laden<br>Ook met <kbd>spatie</kbd> · <kbd>Esc</kbd> annuleert';
    const remote=!moving&&!replay?online.remoteAim:null;
    if(remote){
      $('launch').querySelector('span').textContent=remote.charging?`${player.name} laadt op · ${remote.power}%`:`${player.name} richt…`;
      $('keyboard-hint').textContent='Je ziet de plaatsing, richting en kracht van je tegenstander live.';
      $('scene-status').textContent=remote.charging?`${player.name} kiest kracht · ${remote.power}%`:`${player.name} plaatst en richt`;
      $('launch').classList.toggle('charging',remote.charging);
      if(remote.charging)$('launch').style.setProperty('--charge-fill',`${remote.power}%`);else $('launch').style.removeProperty('--charge-fill');
    }else if(!charge)$('launch').style.removeProperty('--charge-fill');
  }
}
function setRampPlacement(enabled) {
  rampPlacement=enabled;scene?.setRampPlacement(enabled);
  $('ramp-place').setAttribute('aria-pressed',String(enabled));$('ramp-place').querySelector('span').textContent=enabled?'Klik op de bak…':'Kies plek op de bak';
  $('ramp-placement-hint').textContent=enabled?'Klik op een vrije plek. Esc annuleert het plaatsen.':'Of kies de positie met de schuifjes. Verplaats de schans tussen je worpen.';
  $('launch').disabled=moving||!!replay||enabled||!!online?.room&&online.busy;
}
function updateRampUI() {
  const r=world.ramp,disabled=moving||!!replay||!!charge||finished||!!online?.room;
  $('ramp-enabled').checked=r.enabled;$('ramp-enabled').disabled=disabled;
  $('ramp-status').textContent=r.enabled?'Aan':'Uit';$('ramp-status').classList.toggle('on',r.enabled);
  $('ramp-x').value=Math.round(r.x/RAMP_MAX_X*100);$('ramp-distance').value=Math.round((LAUNCH_Z-r.z)*100);
  const cm=Math.round(Math.abs(r.x)*100);$('ramp-x-value').textContent=cm?`${cm} cm ${r.x<0?'links':'rechts'}`:'Midden';$('ramp-distance-value').textContent=`${Math.round((LAUNCH_Z-r.z)*100)} cm`;
  for(const id of ['ramp-x','ramp-distance']){$(id).disabled=disabled;updateRange($(id));}$('ramp-place').disabled=disabled;
}
function applyRamp(config) {
  if(moving||replay||charge||finished||online?.room)return false;
  if(!world.setRamp(config)){toast('Hier ligt een schijf. Kies een vrije plek voor de schans.');updateRampUI();return false;}
  setRampPlacement(false);updateUI();save();return true;
}
function save() {if(moving||online?.room)return;storage.set('sjoelstudio-game',{version:2,round,reserve,locked,pucks:world.snapshot(),finished,ramp:world.ramp});}
function restore() {
  const saved=storage.get('sjoelstudio-game');
  if(!saved||![1,2].includes(saved.version)||!Number.isInteger(saved.round)||saved.round<1||saved.round>3||!Number.isInteger(saved.reserve)||saved.reserve<0||saved.reserve>30||!Array.isArray(saved.locked)||saved.locked.length!==4||!saved.locked.every(n=>Number.isInteger(n)&&n>=0&&n<=30)||!Array.isArray(saved.pucks)||saved.pucks.length>30)return;
  const ids=new Set();
  for(const p of saved.pucks){if(!p||!['id','x','z','vx','vz','rotation','spin'].every(k=>Number.isFinite(p[k]))||!Number.isInteger(p.id)||ids.has(p.id)||Math.abs(p.x)>(p.out?10:0.26)||p.z<(p.out?-10:BACK_SAFE)||p.z>(p.out?10:1.06)||(p.y!==undefined&&(!Number.isFinite(p.y)||p.y<-.06||p.y>.5)))return;ids.add(p.id);}
  if(saved.reserve+saved.locked.reduce((a,b)=>a+b,0)+saved.pucks.length!==30)return;
  round=saved.round;reserve=saved.reserve;locked=[...saved.locked];finished=!!saved.finished;world.restore(saved.pucks.map(p=>({...p,vx:0,vz:0,vy:0,spin:0,airborne:false,onRamp:false})));world.setRamp(normalizeRamp(saved.ramp),false);$('ramp-panel').open=world.ramp.enabled;previousScore=currentScore();
}
const BACK_SAFE = -1.06;
function launch(powerOverride) {
  if(moving||replay||charge||rampPlacement||document.querySelector('dialog[open]'))return;
  if(online?.room){
    if(online.busy)return;
    if(reserve===0){online.action({type:'next'});return;}
    online.action({type:'shot',position:Number($('position').value),angle:Number($('angle').value),power:clamp(Number.isFinite(powerOverride)?powerOverride:Number($('power').value),5,100)});return;
  }
  if(finished){$('reset-dialog').showModal();return;}
  if(reserve===0){nextRound();return;}
  audio.init();previousScore=currentScore();
  const power=clamp(Number.isFinite(powerOverride)?powerOverride:Number($('power').value),5,100);
  const puck=world.launch(Number($('position').value)/100*maxX,Number($('angle').value),power);
  if(!puck){toast('Hier ligt al een schijf. Kies een andere startpositie.');return;}
  $('power').value=power;activeShot={id:puck.id,power,ramp:{...world.ramp},focusTimeline:[{t:0,id:puck.id}]};
  reserve--;moving=true;shotTime=0;steps=0;frames=[{t:0,pucks:world.snapshot()}];accumulator=0;
  $('shot-toast').classList.remove('visible');audio.slide(power);updateUI();
}
function beginCharge(source, pointerId = null) {
  if(charge||moving||replay||rampPlacement||finished||reserve===0||document.querySelector('dialog[open]')||online?.room&&online.busy)return false;
  charge={source,pointerId,started:performance.now(),preset:Number($('power').value)};
  audio.init();updateUI();updateAim(true);announce('Houd vast om kracht op te bouwen. Laat los om te schuiven. Escape annuleert.');return true;
}
function takeCharge() {
  const current=charge;if(!current)return null;charge=null;
  suppressClickUntil=performance.now()+450;
  if(current.pointerId!==null&&$('launch').hasPointerCapture(current.pointerId))$('launch').releasePointerCapture(current.pointerId);
  $('launch').classList.remove('charging');$('launch').style.removeProperty('--charge-fill');return current;
}
function cancelCharge() {const current=takeCharge();if(!current)return;$('power').value=current.preset;updateUI();updateAim(true);announce('Opladen geannuleerd.');}
function releaseCharge() {
  const current=takeCharge();if(!current)return;
  const power=powerForHold(performance.now()-current.started,current.preset);
  $('power').value=power;updateUI();launch(power);
}
function updateCharge(now) {
  if(!charge)return;
  const elapsed=now-charge.started,power=powerForHold(elapsed,charge.preset);
  if(elapsed>=HOLD_THRESHOLD_MS){if(Number($('power').value)!==power){$('power').value=power;updateAim(true);}$('launch').querySelector('span').textContent=`${power}% kracht · laat los`;$('launch').style.setProperty('--charge-fill',`${power}%`);}
}
function openHelp() {cancelCharge();setRampPlacement(false);if(!$('help-dialog').open&&!$('reset-dialog').open)$('help-dialog').showModal();}
function settle() {
  moving=false;for(const p of world.pucks)p.vx=p.vz=p.vy=p.spin=0;
  frames.push({t:shotTime,pucks:world.snapshot()});lastShot={...activeShot,frames,duration:shotTime};
  if(online?.room){onlineAnimating=false;applyOnlineBoard();toast('Worp klaar. '+$('online-status').textContent);return;}
  const counts=currentCounts(),score=scoreCounts(counts),delta=score-previousScore;
  const totalScored=counts.reduce((a,b)=>a+b,0);
  if(totalScored===30||(reserve===0&&round===3)){finished=true;if(score>best){best=score;storage.set('sjoelstudio-best',best);}toast(`Mooi gespeeld! Je eindscore is ${score} punten.`);}
  else if(delta>0)toast(`${delta===20?'Een compleet setje!':`+${delta} ${delta===1?'punt':'punten'}`} · ${score} punten totaal`);
  else if(delta<0)toast('Een schijf is teruggekaatst uit een vak.');
  else if(reserve===0)toast('Beurt klaar. De gemiste schijven mogen nog een keer.');
  else announce(`Worp klaar. ${score} punten. Nog ${reserve} schijven.`);
  updateUI();save();
}
function nextRound() {
  if(round>=3||moving||replay)return;
  const unscored=world.pucks.filter(p=>pocketOf(p)<0).length;
  locked=currentCounts();world.pucks=[];reserve=unscored;round++;lastShot=null;
  updateUI();save();toast(`Beurt ${round} · ${reserve} ${reserve===1?'schijf':'schijven'} terug op de stapel.`);
}
function resetGame() {
  if(online?.room){$('reset-dialog').close();online.open();return;}
  cancelCharge();setRampPlacement(false);
  closeReplay();world.pucks=[];world.nextId=1;round=1;reserve=30;locked=[0,0,0,0];finished=moving=false;lastShot=null;frames=[];accumulator=0;
  $('position').value=-30;$('angle').value=0;$('power').value=56;
  $('reset-dialog').close();updateUI();save();toast('Een schone bak. Veel plezier!');
}
function startReplay() {
  if(!lastShot||moving||charge||rampPlacement||replay||document.querySelector('dialog[open]'))return;
  replay={time:0,speed:0.5,playing:true,cinematic:!scene.reducedMotion,focusId:lastShot.id,savedView:document.querySelector('.camera.active')?.dataset.view};
  scene.beginReplay();scene.setRamp(lastShot.ramp);scene.setReplayCinematic(replay.cinematic);$('replay-overlay').hidden=false;$('replay-speed').textContent='0,5×';$('replay-seek').value=0;$('replay-shot-power').textContent=`${lastShot.power}% KRACHT`;
  $('replay-play').innerHTML='<svg><use href="#i-pause"/></svg>';$('replay-play').setAttribute('aria-label','Replay pauzeren');updateReplayCameraUI();updateUI();replayFrame(0);toast('Je laatste worp, van dichtbij.');
}
function closeReplay() {if(!replay)return;const savedView=replay.savedView;replay=null;scene.endReplay();$('replay-overlay').hidden=true;$('orbit-hint').innerHTML=orbitHint;document.querySelectorAll('.camera').forEach(button=>button.classList.toggle('active',button.dataset.view===savedView));scene.syncPucks(world.pucks);updateUI();}
function updateReplayCameraUI() {
  $('replay-camera').setAttribute('aria-pressed',String(!!replay?.cinematic));
  $('orbit-hint').innerHTML=replay?.cinematic?`<svg><use href="#i-eye"/></svg> Camera volgt ${replay.focusId===lastShot.id?'je schijf':'de geraakte schijf'} · dynamische zoom`:orbitHint;
  if(replay?.cinematic)document.querySelectorAll('.camera').forEach(button=>button.classList.remove('active'));
}
function setCinematic(enabled) {if(!replay)return;replay.cinematic=enabled;scene.setReplayCinematic(enabled);updateReplayCameraUI();updateUI();}
function replayFrame(dt, snap = false) {
  if(replay.playing)replay.time=Math.min(lastShot.duration,replay.time+dt*replay.speed);
  const fs=lastShot.frames;
  let lo=0,hi=fs.length-1;
  while(lo<hi){const mid=Math.floor((lo+hi+1)/2);if(fs[mid].t<=replay.time)lo=mid;else hi=mid-1;}
  const before=fs[lo],after=fs[Math.min(lo+1,fs.length-1)],weight=after.t>before.t?(replay.time-before.t)/(after.t-before.t):0;
  const afterMap=new Map(after.pucks.map(p=>[p.id,p]));
  const pucks=before.pucks.map(p=>{const b=afterMap.get(p.id)||p;return{...p,x:p.x+(b.x-p.x)*weight,z:p.z+(b.z-p.z)*weight,y:(p.y||0)+((b.y||0)-(p.y||0))*weight,vy:(p.vy||0)+((b.vy||0)-(p.vy||0))*weight,tilt:(p.tilt||0)+((b.tilt||0)-(p.tilt||0))*weight,vx:p.vx+(b.vx-p.vx)*weight,vz:p.vz+(b.vz-p.vz)*weight,rotation:p.rotation+(b.rotation-p.rotation)*weight};});
  const focusId=replayFocusAt(lastShot.focusTimeline,replay.time);
  if(focusId!==replay.focusId){replay.focusId=focusId;updateReplayCameraUI();}
  scene.syncPucks(pucks);const focus=pucks.find(p=>p.id===focusId);if(focus)scene.followReplayPuck(focus,lastShot.duration?replay.time/lastShot.duration:1,snap);
  $('replay-seek').value=lastShot.duration?Math.round(replay.time/lastShot.duration*1000):0;updateRange($('replay-seek'));
  $('replay-time').textContent=`0:${Math.floor(replay.time).toString().padStart(2,'0')}`;
  if(replay.time>=lastShot.duration&&replay.playing){replay.playing=false;updateReplayButton();}
}
function updateReplayButton() {$('replay-play').innerHTML=`<svg><use href="#${replay?.playing?'i-pause':'i-play'}"/></svg>`;$('replay-play').setAttribute('aria-label',replay?.playing?'Replay pauzeren':'Replay afspelen');}
function simulateStep() {world.step();shotTime+=FIXED_DT;steps++;if(steps%4===0)frames.push({t:shotTime,pucks:world.snapshot()});if((!world.moving&&shotTime>0.08)||shotTime>12)settle();}
function loop(now) {
  const dt=Math.min((now-loop.previous)/1000,0.08)||0.016;loop.previous=now;
  updateCharge(now);
  if(moving){accumulator+=dt;while(accumulator>=FIXED_DT&&moving){simulateStep();accumulator-=FIXED_DT;}}
  if(replay)replayFrame(dt);else scene.syncPucks(world.pucks);
  scene.render(dt);animation=requestAnimationFrame(loop);
}
function setView(view) {if(replay?.cinematic)setCinematic(false);scene.setView(view);document.querySelectorAll('.camera').forEach(button=>button.classList.toggle('active',button.dataset.view===view));}
function updateSound() {$('sound-btn').innerHTML=`<svg><use href="#${audio.enabled?'i-sound':'i-mute'}"/></svg>`;$('sound-btn').setAttribute('aria-label',audio.enabled?'Geluid uit':'Geluid aan');$('sound-btn').title=audio.enabled?'Geluid uit':'Geluid aan';$('sound-btn').setAttribute('aria-pressed',String(audio.enabled));}

function applyOnlineBoard() {
  const room=online?.room;if(!room||onlineAnimating)return;
  onlineViewingSeat=room.phase==='playing'?room.turn:room.you;
  const board=room.players[onlineViewingSeat].board;
  round=board.round;reserve=board.reserve;locked=[...board.locked];finished=room.phase==='finished';
  world.restore(board.pucks);world.setRamp(room.ramp,false);previousScore=currentScore();updateUI();
  if(room.turn===room.you&&onlineOwnAim){setAimInputs(onlineOwnAim);updateAim(true);}
}
function receiveOnlineRoom(room) {
  if(!room||!scene)return;
  if(room.revision!==onlineRevision){
    cancelCharge();setRampPlacement(false);
    const initial=onlineRevision===0;onlineRevision=room.revision;
    if(initial){onlineOwnAim=aimValues();save();lastShot=null;moving=false;onlineAnimating=false;accumulator=0;closeReplay();}
    const shot=room.lastShot;
    if(shot&&shot.id!==onlineShotId&&Date.now()+online.clockOffset<room.readyAt){
      closeReplay();onlineShotId=shot.id;onlineViewingSeat=shot.seat;
      const board=room.players[shot.seat].board;
      round=board.round;reserve=board.reserve;locked=[...board.locked];finished=false;
      setAimInputs(shot);
      world.restore(shot.start);world.setRamp(shot.ramp,false);const puck=world.launch(shot.position/100*maxX,shot.angle,shot.power);
      if(puck){activeShot={id:puck.id,power:shot.power,ramp:{...shot.ramp},focusTimeline:[{t:0,id:puck.id}]};moving=onlineAnimating=true;shotTime=0;steps=0;frames=[{t:0,pucks:world.snapshot()}];accumulator=0;audio.slide(shot.power);}
    }else{onlineShotId=shot?.id||null;if(!onlineAnimating)applyOnlineBoard();}
  }
  updateUI();
}
function leaveOnline() {
  cancelCharge();closeReplay();moving=onlineAnimating=false;onlineRevision=0;onlineShotId=null;lastShot=null;accumulator=0;
  onlineOwnAim=null;world.pucks=[];world.nextId=1;round=1;reserve=30;locked=[0,0,0,0];finished=false;restore();updateUI();toast('Je eigen spel staat weer klaar.');
}

try {
  scene=new SjoelScene($('scene'),x=>{if(moving||charge||replay||finished||reserve===0||online?.room&&online.busy)return;$('position').value=Math.round(x/maxX*100);updateAim(true);},()=>{if(replay?.cinematic)setCinematic(false);document.querySelectorAll('.camera').forEach(button=>button.classList.remove('active'));},(x,z)=>{if(applyRamp({enabled:true,x,z}))toast('De schans staat klaar. Geef je schijf voldoende kracht.');});
  $('loading').remove();$('position').value=-30;restore();updateUI();updateSound();
  online=new Multiplayer({beforeOpen(){cancelCharge();setRampPlacement(false);},getRamp:()=>world.ramp,onRoom:receiveOnlineRoom,onLeave:leaveOnline,toast});
  setInterval(()=>{if(online?.room&&!moving&&!replay&&!charge){updateUI();if(online.room.turn===online.room.you)updateAim(true);}},300);
  loop.previous=performance.now();animation=requestAnimationFrame(loop);
  inputs.forEach(input=>input.addEventListener('input',()=>updateAim(true)));
  $('launch').addEventListener('pointerdown',e=>{if(e.button!==0)return;if(beginCharge('pointer',e.pointerId)){$('launch').setPointerCapture(e.pointerId);}});
  $('launch').addEventListener('pointerup',e=>{if(charge?.source==='pointer'&&charge.pointerId===e.pointerId)releaseCharge();});
  $('launch').addEventListener('pointercancel',cancelCharge);
  $('launch').addEventListener('lostpointercapture',()=>{if(charge?.source==='pointer')cancelCharge();});
  $('launch').addEventListener('contextmenu',e=>e.preventDefault());
  $('launch').addEventListener('click',()=>{if(performance.now()<suppressClickUntil)return;launch();});
  document.querySelectorAll('.camera').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view)));
  $('orbit-reset').addEventListener('click',()=>setView('perspective'));
  $('new-game').addEventListener('click',()=>{cancelCharge();setRampPlacement(false);if(online?.room)online.open();else $('reset-dialog').showModal();});$('confirm-reset').addEventListener('click',resetGame);
  $('ramp-enabled').addEventListener('change',()=>applyRamp({...world.ramp,enabled:$('ramp-enabled').checked}));
  $('ramp-x').addEventListener('input',()=>applyRamp({...world.ramp,x:Number($('ramp-x').value)/100*RAMP_MAX_X}));
  $('ramp-distance').addEventListener('input',()=>applyRamp({...world.ramp,z:LAUNCH_Z-Number($('ramp-distance').value)/100}));
  $('ramp-place').addEventListener('click',()=>{cancelCharge();setRampPlacement(!rampPlacement);});
  for(const id of ['help-top','help-bottom','help-icon'])$(id).addEventListener('click',openHelp);
  document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>$(button.dataset.close).close()));
  document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}}));
  $('sound-btn').addEventListener('click',()=>{audio.enabled=!audio.enabled;if(audio.enabled){audio.init();audio.knock(0.5);}storage.set('sjoelstudio-sound',audio.enabled);updateSound();});
  $('fullscreen-btn').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('board-panel').requestFullscreen();}catch{toast('Volledig scherm is hier niet beschikbaar.');}});
  document.addEventListener('fullscreenchange',()=>{$('fullscreen-btn').setAttribute('aria-label',document.fullscreenElement?'Volledig scherm sluiten':'Volledig scherm');scene.resize();});
  $('replay-btn').addEventListener('click',startReplay);$('replay-close').addEventListener('click',closeReplay);$('replay-camera').addEventListener('click',()=>setCinematic(!replay.cinematic));
  $('replay-play').addEventListener('click',()=>{if(!replay)return;if(replay.time>=lastShot.duration)replay.time=0;replay.playing=!replay.playing;updateReplayButton();});
  $('replay-speed').addEventListener('click',()=>{if(!replay)return;replay.speed=replay.speed===0.5?1:replay.speed===1?0.25:0.5;$('replay-speed').textContent=`${replay.speed.toLocaleString('nl-NL')}×`;});
  $('replay-seek').addEventListener('input',()=>{if(!replay)return;replay.time=Number($('replay-seek').value)/1000*lastShot.duration;replayFrame(0,true);});
  document.addEventListener('keydown',e=>{
    if(e.ctrlKey||e.metaKey||e.altKey)return;
    const active=document.activeElement,isText=/TEXTAREA|SELECT/.test(active?.tagName)||(active?.tagName==='INPUT'&&active.type!=='range')||active?.isContentEditable;
    if(!isText&&(e.key==='F1'||e.key==='?'||e.key.toLowerCase()==='h')){e.preventDefault();if(!e.repeat)openHelp();return;}
    if(document.querySelector('dialog[open]')||isText)return;
    if(e.key==='Escape'&&rampPlacement){e.preventDefault();setRampPlacement(false);return;}
    if(e.key==='Escape'&&charge){e.preventDefault();cancelCharge();return;}
    if(e.key==='Escape'&&replay){closeReplay();return;}
    if(e.code==='Space'){if(active?.tagName==='BUTTON'&&active.id!=='launch')return;e.preventDefault();if(e.repeat)return;if(replay){$('replay-play').click();return;}if(finished||reserve===0)launch();else beginCharge('keyboard');return;}
    if(charge||active?.tagName==='INPUT')return;
    if(['1','2','3'].includes(e.key)){setView(['perspective','player','top'][Number(e.key)-1]);return;}
    if(e.key.toLowerCase()==='r'){startReplay();return;}
    if(moving||replay||finished||reserve===0||online?.room&&online.busy)return;
    const map={ArrowLeft:['position',-3],ArrowRight:['position',3],a:['angle',-0.5],d:['angle',0.5],ArrowUp:['power',2],ArrowDown:['power',-2]};
    const entry=map[e.key];if(entry){e.preventDefault();const input=$(entry[0]);input.value=clamp(Number(input.value)+entry[1],Number(input.min),Number(input.max));updateAim(true);}
  });
  document.addEventListener('keyup',e=>{if(e.code==='Space'&&charge?.source==='keyboard'){e.preventDefault();releaseCharge();}});
  window.addEventListener('blur',cancelCharge);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelCharge();setRampPlacement(false);}if(document.hidden&&moving){let limit=0;while(moving&&limit++<3000)simulateStep();}if(document.hidden&&replay){replay.playing=false;updateReplayButton();}loop.previous=performance.now();});
} catch(error) {
  console.error('Sjoelstudio kon niet starten:',error);
  $('loading')?.remove();
  const message=document.createElement('div');message.className='error-message';message.innerHTML='<strong>De bak kan nog niet open.</strong><span>Voor deze 3D-game is WebGL nodig. Open de game in een recente browser met hardwareversnelling en probeer het opnieuw.</span>';$('scene').append(message);$('launch').disabled=true;
}
