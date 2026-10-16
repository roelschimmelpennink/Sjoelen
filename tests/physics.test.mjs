import test from 'node:test';
import assert from 'node:assert/strict';
import {World, CENTERS, GATE, HALF_WIDTH, RADIUS, FIXED_DT, VALUES, scoreCounts, pocketOf} from '../dist/physics.js';

function settle(world) {let steps=0;while(world.moving&&steps++<3000)world.step(FIXED_DT);assert.ok(steps<3000,'The world must settle within 12.5 seconds');}
const energy = w => w.pucks.reduce((sum,p)=>sum+p.vx*p.vx+p.vz*p.vz,0);

test('All four clear portals admit a carefully aimed disc',()=>{
  CENTERS.forEach((x,i)=>{const w=new World();w.launch(x,0,56);settle(w);assert.equal(pocketOf(w.pucks[0]),i);assert.equal(scoreCounts(w.counts()),VALUES[i]);});
});
test('A complete set doubles the sum of its four gates',()=>{
  assert.equal(scoreCounts([1,1,1,1]),20);assert.equal(scoreCounts([2,2,2,2]),40);assert.equal(scoreCounts([2,1,3,1]),30);assert.equal(scoreCounts([0,0,7,0]),28);assert.equal(scoreCounts([7,7,9,7]),148);
});
test('Only discs completely behind the gate count',()=>{
  assert.equal(pocketOf({x:CENTERS[0],z:GATE-RADIUS}),-1);
  assert.equal(pocketOf({x:CENTERS[0],z:GATE-RADIUS-0.012}),0);
});
test('Maximum power cannot tunnel through a closed gate post',()=>{
  const w=new World();w.launch(0,0,100);let minZ=1;while(w.moving){w.step();minZ=Math.min(minZ,w.pucks[0].z);}assert.ok(minZ>GATE+RADIUS-0.002);assert.deepEqual(w.counts(),[0,0,0,0]);
});
test('An equal mass collision transfers motion without creating energy',()=>{
  const w=new World();w.pucks=[{id:1,x:0,z:0,vx:1,vz:0,rotation:0,spin:0},{id:2,x:RADIUS*2-0.001,z:0,vx:0,vz:0,rotation:0,spin:0}];const initial=energy(w);w.collidePucks(...w.pucks);assert.ok(w.pucks[1].vx>0.8);assert.ok(energy(w)<initial);assert.ok(Math.abs(w.pucks[0].vx+w.pucks[1].vx-1)<1e-10);
});
test('Exactly overlapping discs separate without invalid coordinates',()=>{
  const w=new World();w.pucks=[{id:1,x:0,z:0,vx:0,vz:0,rotation:0,spin:0},{id:2,x:0,z:0,vx:0,vz:0,rotation:0,spin:0}];w.step();assert.ok(w.pucks.every(p=>Number.isFinite(p.x)&&Math.abs(p.x)<0.03));assert.ok(Math.abs(w.pucks[1].x-w.pucks[0].x)>=2*RADIUS);
});
test('Snapshots are independent and replaying simulation is deterministic',()=>{
  const first=new World();first.launch(-0.12,12,89);for(let i=0;i<40;i++)first.step();const snapshot=first.snapshot();const other=new World();other.restore(snapshot);settle(first);settle(other);assert.deepEqual(first.pucks,other.pucks);assert.notDeepEqual(snapshot,first.pucks);
});
test('A launch cannot overlap a disc at the starting position',()=>{
  const w=new World();assert.ok(w.launch(0,0,5));assert.equal(w.launch(0,0,5),null);assert.equal(w.pucks.length,1);
});
test('A crowded board stays finite, bounded and dissipates energy',()=>{
  const w=new World();let seed=12345;const rng=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
  for(let shot=0;shot<30;shot++){
    w.launch((rng()*2-1)*0.161,(rng()*2-1)*30,5+rng()*95);let previous=energy(w),i=0;
    while(w.moving&&i++<3000){w.step();const next=energy(w);assert.ok(next<previous+0.00001,'Collisions must not add translational energy');previous=next;for(const p of w.pucks){assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.z));assert.ok(Math.abs(p.x)<HALF_WIDTH-RADIUS+0.002);assert.ok(p.z>-1&&p.z<1.01);}}
    assert.ok(i<3000);
  }
});
