import test from 'node:test';
import assert from 'node:assert/strict';
import {World,FIXED_DT,GRAVITY,RAMP_HEIGHT,RAMP_LENGTH,RAMP_MAX_X,THICKNESS,pocketOf,normalizeRamp} from '../public/physics.js';
import {cinematicPose} from '../public/experience.js';

const puck=(id,x,z,extra={})=>({id,x,z,vx:0,vz:0,rotation:0,spin:0,y:0,vy:0,tilt:0,airborne:false,onRamp:false,out:false,...extra});
function jump(power){
  const world=new World();world.setRamp({enabled:true,x:-0.049,z:0.175});world.launch(-0.049,0,power);
  let maximum=0,firstFlight=null,landing=null,steps=0;
  while(world.moving&&steps++<3600){world.step();const p=world.pucks[0];maximum=Math.max(maximum,p.y);if(!firstFlight&&p.airborne&&p.z<world.ramp.z-RAMP_LENGTH/2)firstFlight={...p};if(firstFlight&&!landing&&p.y===0)landing={...p};}
  assert.ok(steps<3600,'A ramp throw must settle');return {world,maximum,firstFlight,landing};
}
test('A fast disc leaves the ramp and follows Newtonian projectile motion',()=>{
  const world=new World();world.setRamp({enabled:true,x:0,z:0.175});world.launch(0,0,100);
  while(!world.pucks[0].airborne)world.step();
  const start={...world.pucks[0]};assert.ok(start.vy>0&&start.y>=RAMP_HEIGHT);
  for(let i=1;i<=20;i++){world.step();const t=i*FIXED_DT,p=world.pucks[0];assert.ok(p.airborne);assert.ok(Math.abs(p.y-(start.y+start.vy*t-GRAVITY*t*t/2))<1e-10);assert.ok(Math.abs(p.vy-(start.vy-GRAVITY*t))<1e-10);assert.ok(Math.abs(p.z-(start.z+start.vz*t))<1e-10);}
});
test('More launch power produces a higher and farther jump',()=>{
  const medium=jump(56),strong=jump(100);
  assert.ok(strong.maximum>medium.maximum+0.01);assert.ok(medium.landing&&strong.landing);
  assert.ok(strong.firstFlight.z-strong.landing.z>medium.firstFlight.z-medium.landing.z+0.1);
});
test('A gentle throw cannot climb the ramp and slides back down',()=>{
  const result=jump(20);assert.ok(result.maximum<RAMP_HEIGHT/2);assert.equal(result.firstFlight,null);assert.equal(result.world.pucks[0].y,0);assert.ok(result.world.pucks[0].z>0.175+RAMP_LENGTH/2);
});
test('An airborne disc passes over a lower disc without a false collision',()=>{
  const impacts=[],world=new World((speed,kind,impact)=>{if(impact)impacts.push(impact);});world.restore([puck(1,0,0),puck(2,0,0,{y:0.06,vy:0,vx:1,airborne:true})]);world.step();assert.equal(world.pucks[0].vx,0);assert.equal(world.pucks[1].vx,1);assert.equal(impacts.length,0);
});
test('Landing on a disc produces a real contact and transfers movement',()=>{
  const impacts=[],world=new World((speed,kind,impact)=>{if(impact)impacts.push(impact);});world.restore([puck(1,0,0),puck(2,0,0,{y:THICKNESS+0.001,vy:-0.5,vx:1,airborne:true})]);world.step();assert.ok(world.pucks[0].vx>0);assert.ok(world.pucks[1].y>=THICKNESS);assert.deepEqual(impacts[0],{sourceId:2,targetId:1});
});
test('Two airborne discs exchange vertical momentum without a static support',()=>{
  const world=new World();world.restore([puck(1,0,0,{y:0.05,vy:-0.1,airborne:true}),puck(2,0,0,{y:0.05+THICKNESS+0.001,vy:-0.7,airborne:true})]);
  const before=world.pucks.reduce((sum,p)=>sum+p.vy,0)-2*GRAVITY*FIXED_DT;world.step();
  assert.ok(Math.abs(world.pucks.reduce((sum,p)=>sum+p.vy,0)-before)<1e-10);assert.ok(world.pucks.every(p=>p.airborne));
});
test('Discs can clear a low side wall and are returned next turn if they land outside',()=>{
  const world=new World();world.restore([puck(1,0.18,0,{y:0.1,vy:0.2,vx:1,airborne:true})]);let steps=0;while(world.moving&&steps++<3000)world.step();assert.ok(steps<3000);assert.ok(world.pucks[0].out);assert.equal(world.pucks[0].y,-0.049);assert.equal(pocketOf(world.pucks[0]),-1);
});
test('A ramp cannot be placed through a resting disc and its position is bounded',()=>{
  const world=new World();world.restore([puck(1,0,0)]);assert.equal(world.setRamp({enabled:true,x:0,z:0}),false);assert.equal(world.ramp.enabled,false);assert.equal(world.setRamp({enabled:true,x:0,z:0.3}),true);const ramp=normalizeRamp({enabled:true,x:10,z:-10});assert.equal(ramp.x,RAMP_MAX_X);assert.equal(ramp.z,-0.43);
});
test('Replay snapshots retain vertical motion and the cinematic camera follows the height',()=>{
  const world=new World();world.setRamp({enabled:true,x:0,z:0.175});world.launch(0,0,100);while(!world.pucks[0].airborne)world.step();
  const copy=new World();copy.setRamp(world.ramp);copy.restore(world.snapshot());for(let i=0;i<35;i++){world.step();copy.step();}assert.deepEqual(world.pucks,copy.pucks);
  const p=puck(1,0,0,{y:0.08,vz:-1});assert.ok(Math.abs(cinematicPose(p,0.5).target.y-0.092)<1e-12);
});
test('A full board with a ramp stays finite and every throw settles',()=>{
  for(const ramp of [{x:0,z:0.175},{x:-0.1,z:-0.4},{x:0.1,z:0.4}]){
    const world=new World();world.setRamp({enabled:true,...ramp});let seed=42;const rng=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
    for(let shot=0;shot<30;shot++){
      world.launch((rng()*2-1)*0.161,(rng()*2-1)*30,25+rng()*75);let steps=0;
      while(world.moving&&steps++<3600){world.step();for(const p of world.pucks){assert.ok([p.x,p.y,p.z,p.vy].every(Number.isFinite));assert.ok(p.y>=-0.049-1e-6&&p.y<0.5);}}
      assert.ok(steps<3600,`Ramp throw ${shot} must settle`);
    }
  }
});
