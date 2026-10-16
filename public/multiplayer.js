import {scoreCounts,pocketOf} from './physics.js';
const byId=id=>document.getElementById(id);
const safeSession={get(key){try{return JSON.parse(sessionStorage.getItem(key));}catch{return null;}},set(key,value){try{sessionStorage.setItem(key,JSON.stringify(value));}catch{}}};
export class Multiplayer {
  constructor(callbacks) {
    this.callbacks=callbacks;this.room=null;this.token=null;this.pending=false;this.connected=false;this.timer=null;this.generation=0;this.clockOffset=0;this.lastPing=0;
    this.dialog=byId('online-dialog');this.invitedId=new URLSearchParams(location.hash.slice(1)).get('kamer');
    if(!/^[a-f0-9]{32}$/.test(this.invitedId||''))this.invitedId=null;
    byId('online-open').addEventListener('click',()=>this.open());
    byId('online-form').addEventListener('submit',e=>{e.preventDefault();this.enter();});
    byId('online-leave').addEventListener('click',()=>{this.dialog.close();this.leave();});
    byId('online-copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(this.inviteUrl);byId('online-copy').textContent='Link gekopieerd';}catch{byId('online-link').select();byId('online-error').textContent='Kopieer de geselecteerde link en stuur hem door.';}});
    byId('online-rematch').addEventListener('click',()=>this.action({type:'rematch'}));
    byId('online-new-room').addEventListener('click',()=>{this.invitedId=null;history.replaceState(null,'',location.pathname+location.search);this.open();});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&this.room)this.pollSoon();});
    if(this.invitedId){const saved=safeSession.get('sjoelstudio-room-'+this.invitedId);if(saved?.token)this.resume(saved.token);else this.open();}
  }
  get busy(){return this.pending||!this.connected||!this.room||this.room.phase!=='playing'||this.room.turn!==this.room.you||Date.now()+this.clockOffset<this.room.readyAt;}
  get inviteUrl(){const url=new URL(location.href);url.search='';url.hash='kamer='+this.room.id;return url.href;}
  open() {
    this.callbacks.beforeOpen();byId('online-error').textContent='';
    byId('online-name').value=safeSession.get('sjoelstudio-name')||'';
    this.render();if(!this.dialog.open&&!document.querySelector('dialog[open]'))this.dialog.showModal();
  }
  render() {
    const room=this.room;byId('online-setup').hidden=!!room;byId('online-lobby').hidden=!room;
    byId('online-form-title').textContent=room?'Jullie online kamer.':this.invitedId?'Je bent uitgenodigd.':'Samen aan de bak.';
    byId('online-new-room').hidden=!!room||!this.invitedId;
    byId('online-ramp-note').textContent=this.invitedId?'De schansinstelling van de gastheer geldt voor jullie allebei.':'De schans die nu op je bak staat, geldt voor allebei. Kies hem voor je de kamer maakt.';
    byId('online-submit').textContent=this.invitedId?'Doe mee':'Maak een kamer';byId('online-submit').disabled=this.pending;
    byId('online-banner').hidden=!room;byId('online-leave').hidden=!room;
    byId('online-open').textContent=room?'Jouw online kamer':'Online met z’n tweeën';
    if(!room)return;
    byId('online-link').value=this.inviteUrl;
    const message=`Kom je een potje sjoelen? Speel met mij mee in Sjoelstudio: ${this.inviteUrl}`;
    byId('online-whatsapp').href='https://wa.me/?text='+encodeURIComponent(message);
    byId('online-email').href='mailto:?subject='+encodeURIComponent('Een potje sjoelen?')+'&body='+encodeURIComponent(message);
    byId('online-lobby-status').textContent=room.phase==='waiting'?'De bak staat klaar. Nodig je tegenstander uit.':room.phase==='finished'?'De wedstrijd is afgelopen. Zin in revanche?':'Jullie kamer is klaar. Veel plezier!';
    byId('online-connection').textContent=this.connected?'Verbonden':'Verbinding herstellen…';byId('online-connection').classList.toggle('disconnected',!this.connected);
    const rolling=room.lastShot&&Date.now()+this.clockOffset<room.readyAt;
    for(let i=0;i<2;i++){
      const player=room.players[i];byId('online-player-'+i).textContent=player?player.name+(i===room.you?' (jij)':''):'Wacht op speler 2';
      let score=player?.score;
      if(rolling&&room.lastShot.seat===i){const counts=[...player.board.locked];for(const puck of room.lastShot.start){const pocket=pocketOf(puck);if(pocket>=0)counts[pocket]++;}score=scoreCounts(counts);}
      byId('online-score-'+i).textContent=player?score:'—';
      byId('online-presence-'+i).textContent=player?(player.online?'Online':'Even weg · plek bewaard'):'Uitnodiging verstuurd?';
      byId('online-card-'+i).classList.toggle('active',rolling?room.lastShot.seat===i:room.phase==='playing'&&room.turn===i);
    }
    let status='Deel je uitnodigingslink om te beginnen.';
    if(room.phase==='playing')status=room.turn===room.you?'Jij bent aan de beurt.':`${room.players[room.turn].name} is aan de beurt. Kijk live mee.`;
    if(room.phase==='finished'){
      const [a,b]=room.players;status=a.score===b.score?'Gelijkspel! Mooi gespeeld.':`${a.score>b.score?a.name:b.name} wint! ${a.score} – ${b.score} punten.`;
    }
    if(rolling)status=`${room.players[room.lastShot.seat].name} schuift. Kijk live mee.`;
    byId('online-status').textContent=status;
    byId('online-rematch').hidden=room.phase!=='finished';byId('online-rematch').disabled=this.pending||!!rolling||room.rematch.includes(room.you);
    byId('online-rematch').textContent=room.rematch.includes(room.you)?'Wacht op revanche van de ander…':'Nog een potje?';
  }
  async request(path,body,token=this.token) {
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
    try {
      const response=await fetch('/api/rooms'+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:controller.signal,cache:'no-store'});
      const data=await response.json();if(!response.ok){const error=new Error(data.error||'De kamer is niet bereikbaar.');error.status=response.status;throw error;}return data;
    } finally {clearTimeout(timeout);}
  }
  receive(data) {
    this.connected=true;
    if(data.room){this.room=data.room;this.clockOffset=data.room.serverNow-Date.now();this.invitedId=this.room.id;}
    else if(data.unchanged){this.clockOffset=data.serverNow-Date.now();this.room.players.forEach((p,i)=>p.online=data.online[i]);}
    this.render();this.callbacks.onRoom(this.room);
  }
  async enter() {
    if(this.pending)return;const name=byId('online-name').value.trim();if(!name){byId('online-name').reportValidity();return;}
    this.pending=true;this.render();byId('online-error').textContent='';
    try {
      const data=await this.request(this.invitedId?'/'+this.invitedId+'/join':'',{name,ramp:this.callbacks.getRamp()},null);
      this.token=data.token;safeSession.set('sjoelstudio-room-'+data.room.id,{token:this.token});safeSession.set('sjoelstudio-name',name);
      history.replaceState(null,'','#kamer='+data.room.id);this.receive(data);this.pollSoon();
    } catch(error){byId('online-error').textContent=error.message;}
    finally {this.pending=false;this.render();this.callbacks.onRoom(this.room);}
  }
  async resume(token) {
    const generation=this.generation;
    this.token=token;try{const data=await this.request('/'+this.invitedId);if(generation!==this.generation)return;this.receive(data);this.pollSoon();}catch(error){if(generation!==this.generation)return;this.open();byId('online-error').textContent=error.status?error.message:'Verbinding herstellen… Je spelersplek is bewaard.';if(!error.status)this.timer=setTimeout(()=>this.resume(token),2500);}
  }
  async action(payload) {
    if(!this.room||this.pending)return;
    const generation=this.generation,id=this.room.id;this.pending=true;this.callbacks.onRoom(this.room);this.render();
    const body={...payload,revision:this.room.revision,actionId:crypto.randomUUID()};
    try {
      let data;try{data=await this.request('/'+id+'/action',body);}catch(error){if(error.status)throw error;data=await this.request('/'+id+'/action',body);}
      if(generation===this.generation)this.receive(data);
    } catch(error){if(generation===this.generation){this.callbacks.toast(error.message);this.pollSoon();}}
    finally {if(generation===this.generation){this.pending=false;this.render();this.callbacks.onRoom(this.room);}}
  }
  pollSoon() {clearTimeout(this.timer);this.timer=setTimeout(()=>this.poll(),0);}
  async poll() {
    if(!this.room)return;const generation=this.generation,id=this.room.id;
    try {
      if(Date.now()-this.lastPing>8000){await this.request('/'+id+'/ping',{});this.lastPing=Date.now();}
      const data=await this.request('/'+id+'?since='+this.room.revision);
      if(generation!==this.generation)return;this.receive(data);
    } catch(error) {
      if(generation!==this.generation)return;this.connected=false;this.render();this.callbacks.onRoom(this.room);
      if([401,403,404].includes(error.status)){this.callbacks.toast(error.message);return;}
    }
    if(generation===this.generation)this.timer=setTimeout(()=>this.poll(),document.hidden?2500:650);
  }
  leave() {
    this.generation++;clearTimeout(this.timer);this.room=null;this.token=null;this.invitedId=null;this.pending=false;this.connected=false;
    history.replaceState(null,'',location.pathname+location.search);this.render();this.callbacks.onLeave();
  }
}
