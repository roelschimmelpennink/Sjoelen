// Metres, seconds and kilograms. A fixed 240 Hz step prevents tunnelling at the gates.
export const RADIUS = 0.0258;
export const HALF_WIDTH = 0.195;
export const FRONT = 0.985;
export const BACK = -0.985;
export const GATE = -0.665;
export const GATE_DEPTH = 0.018;
export const OPENING = 0.064;
export const LAUNCH_Z = 0.795;
export const VALUES = [2, 3, 4, 1];
export const CENTERS = [-0.14625, -0.04875, 0.04875, 0.14625];
export const FIXED_DT = 1 / 240;
export const FRICTION = 0.67;
export const GRAVITY = 9.81;
export const THICKNESS = 0.014;
export const RAMP_WIDTH = 0.14;
export const RAMP_LENGTH = 0.18;
export const RAMP_HEIGHT = 0.05;
export const RAMP_MAX_X = HALF_WIDTH - RAMP_WIDTH / 2 - 0.006;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export function normalizeRamp(config = {}) {
  return {enabled:config.enabled===true,x:clamp(Number.isFinite(config.x)?config.x:-0.049,-RAMP_MAX_X,RAMP_MAX_X),z:clamp(Number.isFinite(config.z)?config.z:0.175,-0.43,0.4)};
}
export const speedForPower = power => 0.45 + clamp(power, 5, 100) * 0.022;
export function scoreCounts(counts) {
  const sets = Math.min(...counts);
  return sets * 20 + counts.reduce((sum, count, i) => sum + (count - sets) * VALUES[i], 0);
}
export function pocketOf(puck) {
  if(puck.out||puck.airborne)return -1;
  if (puck.z + RADIUS > GATE - GATE_DEPTH / 2 || puck.z - RADIUS < BACK - 0.001) return -1;
  return CENTERS.findIndex(center => Math.abs(puck.x - center) < 0.04875 - RADIUS + 0.001);
}
export function createWalls() {
  const walls = [
    { x0: -0.218, x1: -HALF_WIDTH, z0: -1.01, z1: 1.02, y0:-0.04, y1:0.052 },
    { x0: HALF_WIDTH, x1: 0.218, z0: -1.01, z1: 1.02, y0:-0.04, y1:0.052 },
    { x0: -0.218, x1: 0.218, z0: -1.01, z1: BACK, y0:-0.04, y1:0.048 },
    { x0: -0.218, x1: 0.218, z0: FRONT, z1: 1.02, y0:-0.04, y1:0.025 },
    { x0: -0.207, x1: 0.207, z0:GATE-GATE_DEPTH/2,z1:GATE+GATE_DEPTH/2,y0:0.032,y1:0.069 },
    { x0:-0.207,x1:0.207,z0:0.5895,z1:0.6165,y0:0.0455,y1:0.0615 }
  ];
  let edge = -HALF_WIDTH;
  for (const center of CENTERS) {
    walls.push({ x0: edge, x1: center - OPENING / 2, z0: GATE - GATE_DEPTH / 2, z1: GATE + GATE_DEPTH / 2, y0:0,y1:0.069 });
    edge = center + OPENING / 2;
  }
  walls.push({ x0: edge, x1: HALF_WIDTH, z0: GATE - GATE_DEPTH / 2, z1: GATE + GATE_DEPTH / 2, y0:0,y1:0.069 });
  for (const x of [-0.0975, 0, 0.0975]) walls.push({ x0: x - 0.003, x1: x + 0.003, z0: BACK, z1: GATE - GATE_DEPTH / 2, y0:0,y1:0.042 });
  return walls;
}
export class World {
  constructor(onCollision = () => {}) { this.pucks = []; this.walls = createWalls(); this.onCollision = onCollision; this.nextId = 1; this.ramp=normalizeRamp(); }
  setRamp(config, checkPucks = true) {
    const ramp=normalizeRamp(config);
    if(checkPucks&&ramp.enabled&&this.pucks.some(p=>!p.out&&Math.abs(p.x-ramp.x)<RAMP_WIDTH/2+RADIUS&&Math.abs(p.z-ramp.z)<RAMP_LENGTH/2+RADIUS))return false;
    this.ramp=ramp;return true;
  }
  rampHeight(x,z) {
    if(!this.ramp.enabled||Math.abs(x-this.ramp.x)>RAMP_WIDTH/2||Math.abs(z-this.ramp.z)>RAMP_LENGTH/2+1e-8)return null;
    return clamp((this.ramp.z+RAMP_LENGTH/2-z)/RAMP_LENGTH,0,1)*RAMP_HEIGHT;
  }
  overlapsWall(p,wall) {return Math.hypot(p.x-clamp(p.x,wall.x0,wall.x1),p.z-clamp(p.z,wall.z0,wall.z1))<RADIUS;}
  surfaceAt(p) {
    const inside=Math.abs(p.x)<=HALF_WIDTH&&p.z>=BACK&&p.z<=FRONT;
    let surface={height:inside?0:-0.049,type:inside?'floor':'ground'};
    const height=this.rampHeight(p.x,p.z);
    if(height!==null&&height<=(p.y||0)+0.001)surface={height,type:'ramp'};
    for(const wall of this.walls)if(wall.y1<=p.y+0.001&&wall.y1>surface.height&&this.overlapsWall(p,wall))surface={height:wall.y1,type:'wall'};
    for(const other of this.pucks)if(other!==p&&!other.airborne&&(other.y||0)+THICKNESS<=p.y+0.001&&(other.y||0)+THICKNESS>surface.height&&Math.hypot(other.x-p.x,other.z-p.z)<RADIUS*1.9)surface={height:(other.y||0)+THICKNESS,type:'puck'};
    return surface;
  }
  launch(x, angle, power) {
    const p = { id: this.nextId++, x: clamp(x, -HALF_WIDTH + RADIUS + 0.003, HALF_WIDTH - RADIUS - 0.003), z: LAUNCH_Z, vx: 0, vz: 0, rotation: 0, spin: 0, y:0,vy:0,tilt:0,airborne:false,onRamp:false,out:false };
    if (this.pucks.some(other => Math.hypot(other.x - p.x, other.z - p.z) < 2 * RADIUS + 0.001)) return null;
    const a = angle * Math.PI / 180, speed = speedForPower(power);
    p.vx = Math.sin(a) * speed; p.vz = -Math.cos(a) * speed;
    this.pucks.push(p);
    return p;
  }
  step(dt = FIXED_DT) {
    for (const p of this.pucks) {
      p.y??=0;p.vy??=0;p.tilt??=0;p.airborne??=false;p.onRamp??=false;p.out??=false;
      p.prevY=p.y;const oldZ=p.z,oldX=p.x;
      const surface=this.surfaceAt(p),supported=Math.abs(p.y-surface.height)<0.001&&Math.abs(p.vy)<0.03&&!p.airborne;
      if((supported&&surface.type==='ramp')||p.onRamp){
        const slope=RAMP_HEIGHT/RAMP_LENGTH,denom=1+slope*slope;
        p.vz+=GRAVITY*slope/denom*dt;
        const speed=Math.hypot(p.vx,p.vz*Math.sqrt(denom));
        if(speed){const factor=Math.max(0,1-FRICTION/Math.sqrt(denom)*dt/speed);p.vx*=factor;p.vz*=factor;}
        p.vy=-slope*p.vz;p.x+=p.vx*dt;p.z+=p.vz*dt;
        const nextHeight=this.rampHeight(p.x,p.z);
        if(nextHeight!==null){p.y=nextHeight;p.onRamp=true;p.airborne=false;p.tilt=Math.atan(slope);}
        else{
          p.y+=p.vy*dt;p.onRamp=false;p.airborne=true;
          // Integrate only the portion of this step after leaving the ramp lip.
          const lip=this.ramp.z-RAMP_LENGTH/2;
          if(p.vz<0&&oldZ>=lip&&p.z<lip){const flightDt=(lip-p.z)/-p.vz;p.y=RAMP_HEIGHT+p.vy*flightDt-GRAVITY*flightDt*flightDt/2;p.vy-=GRAVITY*flightDt;}
        }
      }else{
        if(supported){const speed=Math.hypot(p.vx,p.vz);if(speed){const factor=Math.max(0,speed-FRICTION*dt)/speed;p.vx*=factor;p.vz*=factor;}p.vy=0;p.tilt*=Math.max(0,1-25*dt);}
        else{p.airborne=true;p.y+=p.vy*dt-GRAVITY*dt*dt/2;p.vy-=GRAVITY*dt;}
        p.x+=p.vx*dt;p.z+=p.vz*dt;
      }
      this.resolveRamp(p,oldX,oldZ);
      this.resolveFloor(p);
      p.spin *= Math.max(0, 1 - 2.5 * dt);
      p.rotation += p.spin * dt;
    }
    // Two solver passes keep compact groups stable without adding energy.
    for (let pass = 0; pass < 2; pass++) {
      for (const p of this.pucks) for (const wall of this.walls) this.collideWall(p, wall);
      for (let i = 0; i < this.pucks.length; i++) for (let j = i + 1; j < this.pucks.length; j++) this.collidePucks(this.pucks[i], this.pucks[j]);
    }
    for (const p of this.pucks) {
      const surface=this.surfaceAt(p);
      if(!p.onRamp&&p.y<=surface.height+0.00001&&p.vy<=0){p.y=surface.height;p.vy=0;p.airborne=false;}
      if(Math.hypot(p.vx,p.vz)<0.008&&!p.airborne&&!p.onRamp)p.vx=p.vz=0;
      if(Math.abs(p.spin)<0.015)p.spin=0;
    }
  }
  land(p,height,type='floor') {
    const impact=Math.max(0,-p.vy);p.y=height;p.onRamp=false;
    if(impact>0.35){p.vy=impact*0.16;p.airborne=true;p.vx*=0.97;p.vz*=0.97;}else{p.vy=0;p.airborne=false;}
    if(impact>0.1)this.onCollision(impact,'landing');
    if(type==='ground')p.out=true;
  }
  resolveFloor(p) {
    const inside=Math.abs(p.x)<=HALF_WIDTH&&p.z>=BACK&&p.z<=FRONT;
    const floor=inside?0:-0.049;
    if(p.y<floor||(!p.onRamp&&p.y<=floor&&p.vy<0))this.land(p,floor,inside?'floor':'ground');
  }
  resolveRamp(p,oldX,oldZ) {
    if(!this.ramp.enabled){p.onRamp=false;return;}
    const r=this.ramp,front=r.z+RAMP_LENGTH/2,back=r.z-RAMP_LENGTH/2;
    const sideHeight=clamp((front-p.z)/RAMP_LENGTH,0,1)*RAMP_HEIGHT;
    if(!p.onRamp){
      for(const x of [r.x-RAMP_WIDTH/2,r.x+RAMP_WIDTH/2])this.collideWall(p,{x0:x-0.0005,x1:x+0.0005,z0:back,z1:front,y0:0,y1:sideHeight});
      this.collideWall(p,{x0:r.x-RAMP_WIDTH/2,x1:r.x+RAMP_WIDTH/2,z0:back-0.0005,z1:back+0.0005,y0:0,y1:RAMP_HEIGHT});
    }
    const height=this.rampHeight(p.x,p.z);
    if(height===null){p.onRamp=false;return;}
    const previous=this.rampHeight(oldX,oldZ);
    if(!p.onRamp&&p.y<=height+0.0005&&(p.prevY>=(previous??0)-0.002||oldZ>=front)){
      const slope=RAMP_HEIGHT/RAMP_LENGTH,normalLength=Math.sqrt(1+slope*slope),normalSpeed=(p.vy+slope*p.vz)/normalLength;
      p.y=height;
      if(normalSpeed<0){const bounce=p.airborne&&normalSpeed<-0.4?0.16:0;p.vy-=(1+bounce)*normalSpeed/normalLength;p.vz-=(1+bounce)*normalSpeed*slope/normalLength;if(bounce){p.airborne=true;return;}}
      p.onRamp=true;p.airborne=false;p.vy=-slope*p.vz;p.tilt=Math.atan(slope);
    }
  }
  collideWall(p, wall) {
    const bottom=p.y||0,top=bottom+THICKNESS;
    if(bottom>=wall.y1-1e-7||top<=wall.y0+1e-7)return;
    if(this.overlapsWall(p,wall)){
      if((p.prevY??bottom)>=wall.y1-1e-7&&p.vy<0){this.land(p,wall.y1,'wall');return;}
      if((p.prevY??bottom)+THICKNESS<=wall.y0&&p.vy>0){p.y=wall.y0-THICKNESS;p.vy=-p.vy*0.2;p.airborne=true;return;}
    }
    const cx = clamp(p.x, wall.x0, wall.x1), cz = clamp(p.z, wall.z0, wall.z1);
    let dx = p.x - cx, dz = p.z - cz, distance = Math.hypot(dx, dz);
    if (distance >= RADIUS) return;
    if (distance < 1e-8) {
      const sides = [[p.x - wall.x0, -1, 0], [wall.x1 - p.x, 1, 0], [p.z - wall.z0, 0, -1], [wall.z1 - p.z, 0, 1]].sort((a,b) => a[0] - b[0]);
      dx = sides[0][1]; dz = sides[0][2]; distance = -sides[0][0];
    } else { dx /= distance; dz /= distance; }
    p.x += dx * (RADIUS - distance + 1e-7); p.z += dz * (RADIUS - distance + 1e-7);
    const normal = p.vx * dx + p.vz * dz;
    if (normal >= 0) return;
    const restitution = 0.53;
    p.vx -= (1 + restitution) * normal * dx; p.vz -= (1 + restitution) * normal * dz;
    const tangent = -p.vx * dz + p.vz * dx;
    p.vx += tangent * dz * 0.055; p.vz -= tangent * dx * 0.055;
    p.spin += tangent / RADIUS * 0.09;
    if (-normal > 0.07) this.onCollision(-normal, 'wall');
  }
  collidePucks(a, b) {
    let dx = b.x - a.x, dz = b.z - a.z, distance = Math.hypot(dx, dz);
    if (distance >= RADIUS * 2) return;
    const ay=a.y||0,by=b.y||0;
    const falling=ay>=by?a:b,lower=falling===a?b:a,landingHeight=(lower.y||0)+THICKNESS;
    const relativeVertical=(falling.vy||0)-(lower.vy||0);
    if(relativeVertical<0&&(falling.prevY??falling.y)>=(lower.prevY??lower.y??0)+THICKNESS-1e-7&&falling.y<=landingHeight){
      const impact=-relativeVertical;
      if(lower.airborne){const impulse=impact*1.2/2;falling.vy+=impulse;lower.vy-=impulse;falling.y=landingHeight+1e-7;falling.airborne=true;falling.onRamp=false;}
      else this.land(falling,landingHeight,'puck');
      const dx=(falling.vx-lower.vx)*0.08,dz=(falling.vz-lower.vz)*0.08;falling.vx-=dx;falling.vz-=dz;lower.vx+=dx;lower.vz+=dz;
      if(impact>0.02)this.onCollision(impact,'puck',{sourceId:falling.id,targetId:lower.id});return;
    }
    if(Math.abs(ay-by)>=THICKNESS-1e-6)return;
    const nx = distance < 1e-9 ? 1 : dx / distance, nz = distance < 1e-9 ? 0 : dz / distance;
    const correction = (RADIUS * 2 - distance + 1e-7) / 2;
    a.x -= nx * correction; a.z -= nz * correction; b.x += nx * correction; b.z += nz * correction;
    const aNormal = a.vx * nx + a.vz * nz, bNormal = b.vx * nx + b.vz * nz;
    const relative = bNormal - aNormal;
    if (relative >= 0) return;
    const source = Math.max(0,aNormal) >= Math.max(0,-bNormal) ? a : b;
    const target = source === a ? b : a;
    const impulse = -(1 + 0.74) * relative / 2;
    a.vx -= impulse * nx; a.vz -= impulse * nz; b.vx += impulse * nx; b.vz += impulse * nz;
    const slip = (b.vx - a.vx) * -nz + (b.vz - a.vz) * nx;
    const tangential = slip * 0.025;
    a.vx -= tangential * nz; a.vz += tangential * nx; b.vx += tangential * nz; b.vz -= tangential * nx;
    a.spin += tangential / RADIUS; b.spin += tangential / RADIUS;
    if (-relative > 0.02) this.onCollision(-relative, 'puck', {sourceId:source.id,targetId:target.id});
  }
  get moving() { return this.pucks.some(p => p.airborne||p.onRamp||Math.abs(p.vy||0)>0.001||Math.hypot(p.vx, p.vz) > 0.001); }
  snapshot() { return this.pucks.map(p => ({ ...p })); }
  restore(snapshot) { this.pucks = snapshot.map(p => ({ ...p })); this.nextId = Math.max(0, ...this.pucks.map(p => p.id)) + 1; }
  counts() { const counts = [0,0,0,0]; for (const p of this.pucks) { const lane = pocketOf(p); if (lane >= 0) counts[lane]++; } return counts; }
}
