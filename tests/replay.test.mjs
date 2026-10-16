import test from 'node:test';
import assert from 'node:assert/strict';
import {World, FIXED_DT, CENTERS} from '../public/physics.js';
import {recordReplayImpact, replayFocusAt} from '../public/experience.js';

const stationary=(id,z)=>({id,x:CENTERS[1],z,vx:0,vz:0,rotation:0,spin:0});

test('Real collisions transfer replay focus from the launched disc through a chain',()=>{
  let time=0,timeline;
  const impacts=[];
  const world=new World((strength,kind,impact)=>{if(impact){impacts.push(impact);recordReplayImpact(timeline,impact,time+FIXED_DT);}});
  world.restore([stationary(11,0.35),stationary(22,0)]);
  const launched=world.launch(CENTERS[1],0,56);
  timeline=[{t:0,id:launched.id}];
  for(let i=0;i<2500&&world.moving;i++){world.step();time+=FIXED_DT;}
  assert.deepEqual(impacts[0],{sourceId:launched.id,targetId:11},'The existing disc must be the recipient even when it is first in the physics array');
  assert.deepEqual(timeline.slice(0,3).map(event=>event.id),[launched.id,11,22]);
  assert.ok(timeline[1].t>0&&timeline[2].t>timeline[1].t);
  assert.equal(replayFocusAt(timeline,timeline[1].t-1e-8),launched.id);
  assert.equal(replayFocusAt(timeline,timeline[1].t),11);
  assert.equal(replayFocusAt(timeline,timeline[2].t),22);
});

test('Seeking backwards restores the correct earlier disc without replaying events',()=>{
  const timeline=[{t:0,id:1}];
  recordReplayImpact(timeline,{sourceId:1,targetId:2},0.3);
  recordReplayImpact(timeline,{sourceId:2,targetId:3},0.7);
  for(const [time,id] of [[1,3],[0.5,2],[0,1],[0.7,3],[0.1,1],[0.4,2]])assert.equal(replayFocusAt(timeline,time),id);
});

test('Unrelated impacts do not steal focus and immediate chain reactions are retained',()=>{
  const timeline=[{t:0,id:1}];
  recordReplayImpact(timeline,{sourceId:8,targetId:9},0.1);
  recordReplayImpact(timeline,{sourceId:1,targetId:2},0.3);
  recordReplayImpact(timeline,{sourceId:2,targetId:3},0.3);
  recordReplayImpact(timeline,{sourceId:1,targetId:4},0.5);
  assert.deepEqual(timeline.map(event=>event.id),[1,2,3]);
  assert.equal(replayFocusAt(timeline,0.299),1);
  assert.equal(replayFocusAt(timeline,0.3),3);
});

test('Touching discs without an impact do not change the replay focus',()=>{
  const timeline=[{t:0,id:1}];
  const world=new World((strength,kind,impact)=>{if(impact)recordReplayImpact(timeline,impact,FIXED_DT);});
  world.restore([stationary(1,0.3),stationary(2,0.25)]);world.step();
  assert.deepEqual(timeline,[{t:0,id:1}]);
});
