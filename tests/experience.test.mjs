import test from 'node:test';
import assert from 'node:assert/strict';
import {powerForHold, cinematicPose} from '../public/experience.js';
import {World, CENTERS, speedForPower} from '../public/physics.js';

test('A quick click respects the chosen slider power',()=>{
  for(const preset of [5,25,56,85,100])assert.equal(powerForHold(100,preset),preset);
});
test('Holding charges monotonically and caps at full power',()=>{
  let previous=0;
  for(let duration=180;duration<5000;duration+=20){const power=powerForHold(duration,56);assert.ok(power>=previous&&power>=5&&power<=100);previous=power;}
  assert.equal(powerForHold(5000,56),100);
});
test('A longer hold gives a materially faster throw and longer travel',()=>{
  const short=powerForHold(550,56),long=powerForHold(1250,56);
  assert.ok(speedForPower(long)>speedForPower(short)*1.5);
  const a=new World(),b=new World();a.launch(CENTERS[0],0,short);b.launch(CENTERS[0],0,long);
  let minimumA=1,minimumB=1;
  for(let i=0;i<1500;i++){a.step();b.step();minimumA=Math.min(minimumA,a.pucks[0].z);minimumB=Math.min(minimumB,b.pucks[0].z);}
  assert.ok(minimumA-minimumB>0.8,'The charged disc should travel at least 80 cm farther');
});
test('The film camera pushes closer and follows the launched disc',()=>{
  const puck={x:-0.05,z:0.5,vx:0,vz:-1};
  const intro=cinematicPose(puck,0),close=cinematicPose(puck,0.5);
  const distance=pose=>Math.hypot(pose.position.x-pose.target.x,pose.position.y-pose.target.y,pose.position.z-pose.target.z);
  assert.ok(distance(close)<distance(intro)*0.6);
  const advanced=cinematicPose({...puck,z:-0.4},0.5);
  assert.ok(Math.abs((advanced.target.z-close.target.z)+0.9)<1e-9);
  assert.ok(close.fov<intro.fov);
});
test('Camera framing stays finite and above the rails through bounces on mobile',()=>{
  for(const progress of [0,0.2,0.5,0.9,1])for(const z of [-0.95,0,0.9])for(const speed of [-2.6,0,2.6]){
    const pose=cinematicPose({x:0.16,z,vx:0.5,vz:speed},progress,0.75);
    assert.ok(Object.values(pose.position).every(Number.isFinite));assert.ok(pose.position.y>0.3);assert.ok(Math.hypot(pose.target.x-0.16,pose.target.z-z)<0.046);
  }
});
