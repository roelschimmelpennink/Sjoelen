import * as THREE from './vendor/three.module.js';
import { RADIUS, HALF_WIDTH, FRONT, BACK, GATE, OPENING, CENTERS, LAUNCH_Z, RAMP_WIDTH, RAMP_LENGTH, RAMP_HEIGHT, normalizeRamp, clamp } from './physics.js';
import { cinematicPose } from './experience.js';

function random(seed) { return () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; }; }
function woodTexture(base, seed, disc = false) {
  const canvas = document.createElement('canvas');
  canvas.width = disc ? 512 : 1024; canvas.height = disc ? 512 : 2048;
  const context = canvas.getContext('2d'), image = context.createImageData(canvas.width, canvas.height), rng = random(seed);
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const u = x / canvas.width, v = y / canvas.height;
    const bend = Math.sin(v * 8 + seed) * 0.013 + Math.sin(v * 23 + seed) * 0.003;
    let grain;
    if (disc) {
      const r = Math.hypot((u - 0.41) * 1.06, (v - 0.56) * 0.91);
      grain = Math.sin(r * 260 + Math.sin(u * 22) * 0.8) * 3.8 + Math.sin(r * 64) * 2.2 + (rng() - 0.5) * 7;
    } else {
      const knot = Math.exp(-((u - 0.7) ** 2 * 120 + (v - 0.38) ** 2 * 24));
      const f = u + bend + knot * 0.035;
      grain = Math.sin(f * 180 + Math.sin(f * 39) * 3) * 5 + Math.sin(f * 460) * 2.5 + Math.sin(f * 36 + v * 1.5) * 8 + (rng() - 0.5) * 6;
      grain -= Math.pow(Math.max(0, Math.sin(f * 810 + v * 3)), 14) * 11;
      grain += Math.sin(v * 5) * 1.5;
    }
    const i = (y * canvas.width + x) * 4;
    image.data[i] = clamp(base[0] + grain, 0, 255); image.data[i + 1] = clamp(base[1] + grain * 0.87, 0, 255); image.data[i + 2] = clamp(base[2] + grain * 0.65, 0, 255); image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  if (!disc) {
    // Fine longitudinal pores and several quiet mineral streaks, baked into the material.
    context.globalAlpha = 0.1;
    for (let i = 0; i < 150; i++) { const x = rng() * canvas.width; context.strokeStyle = i % 3 ? '#74552d' : '#fff2ce'; context.lineWidth = 0.5 + rng(); context.beginPath(); context.moveTo(x, 0); for (let y = 0; y <= canvas.height; y += 20) context.lineTo(x + Math.sin(y / 330 + i) * 3, y); context.stroke(); }
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
  return texture;
}

function roundedGeometry(width, height, depth, radius = 0.002) {
  radius = Math.min(radius, width / 3, depth / 3);
  const x = -width / 2, y = -depth / 2, r = radius;
  const shape = new THREE.Shape();
  shape.moveTo(x + r, y); shape.lineTo(x + width - r, y); shape.quadraticCurveTo(x + width, y, x + width, y + r);
  shape.lineTo(x + width, y + depth - r); shape.quadraticCurveTo(x + width, y + depth, x + width - r, y + depth);
  shape.lineTo(x + r, y + depth); shape.quadraticCurveTo(x, y + depth, x, y + depth - r);
  shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: Math.min(0.001, height / 4), bevelThickness: Math.min(0.001, height / 4), curveSegments: 5 });
  geometry.rotateX(-Math.PI / 2); geometry.translate(0, -height / 2, 0);
  const pos = geometry.attributes.position, normal = geometry.attributes.normal, uv = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(normal.getY(i)) > 0.7) uv.setXY(i, pos.getX(i) / width + 0.5, pos.getZ(i) / depth + 0.5);
    else if (Math.abs(normal.getX(i)) > 0.7) uv.setXY(i, pos.getY(i) / height + 0.5, pos.getZ(i) / depth + 0.5);
    else uv.setXY(i, pos.getY(i) / height + 0.5, pos.getX(i) / width + 0.5);
  }
  return geometry;
}

export class SjoelScene {
  constructor(container, onPlace, onOrbit, onRampPlace) {
    this.container = container; this.onPlace = onPlace; this.onOrbit = onOrbit;this.onRampPlace=onRampPlace;this.rampPlacement=false;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#eeede5');
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.01, 30);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 0.96;
    container.appendChild(this.renderer.domElement);
    this.materials = this.makeMaterials(); this.puckMeshes = new Map(); this.stock = new THREE.Group(); this.locked = new THREE.Group();
    this.scene.add(this.stock, this.locked);
    this.target = new THREE.Vector3(0, 0, 0.09);
    this.cameraLook = this.target.clone(); this.cameraTransition = null; this.replayCamera = null;
    this.orbit = { theta: 0.57, phi: 0.79, distance: 3.18 }; this.goal = { ...this.orbit };
    this.makeLighting(); this.makeBoard(); this.makeRamp(); this.makeAim(); this.makeControls();
    this.preview = this.makePuck(); this.preview.position.set(-0.04875, 0.001, LAUNCH_Z); this.scene.add(this.preview);
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(container); this.resize();
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  makeMaterials() {
    const maple = woodTexture([199, 153, 91], 47), walnut = woodTexture([101, 63, 32], 8), beech = woodTexture([199, 151, 89], 22, true);
    return {
      floor: new THREE.MeshPhysicalMaterial({ map: maple, bumpMap: maple, bumpScale: 0.00008, roughness: 0.36, clearcoat: 0.35, clearcoatRoughness: 0.34, metalness: 0 }),
      rail: new THREE.MeshPhysicalMaterial({ map: walnut, roughness: 0.36, clearcoat: 0.36, clearcoatRoughness: 0.3 }),
      honey: new THREE.MeshPhysicalMaterial({ map: maple, color: '#b69b72', roughness: 0.36, clearcoat: 0.3 }),
      puck: new THREE.MeshPhysicalMaterial({ map: beech, roughness: 0.4, clearcoat: 0.22, clearcoatRoughness: 0.35 }),
      brass: new THREE.MeshStandardMaterial({ color: '#9a8150', roughness: 0.36, metalness: 0.72 }),
      inlay: new THREE.MeshStandardMaterial({ color: '#d1b074', roughness: 0.43 }),
      ring: new THREE.MeshStandardMaterial({ color: '#b88d53', roughness: 0.65 })
    };
  }
  makeLighting() {
    this.scene.add(new THREE.HemisphereLight(0xfff7e5, 0xb8bca6, 1.5));
    this.scene.environmentIntensity = 0.65;
    const light = new THREE.DirectionalLight('#fff0d1', 2.5); light.position.set(-1.6, 3, 1.2); light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048); Object.assign(light.shadow.camera, { left: -1.8, right: 1.8, top: 1.8, bottom: -1.8, near: 0.1, far: 8 }); light.shadow.bias = -0.00025; light.shadow.normalBias = 0.001; light.shadow.radius = 5; this.scene.add(light);
    const fill = new THREE.DirectionalLight('#fffefa', 0.9); fill.position.set(1, 1.6, -1.3); this.scene.add(fill);
    const envCanvas = document.createElement('canvas'); envCanvas.width = 1024; envCanvas.height = 512;
    const ctx = envCanvas.getContext('2d'), gradient = ctx.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, '#e9e6d9'); gradient.addColorStop(0.5, '#c9c2ad'); gradient.addColorStop(1, '#807864'); ctx.fillStyle = gradient; ctx.fillRect(0,0,1024,512);
    ctx.fillStyle = '#fffdf4'; ctx.fillRect(130, 65, 130, 210); ctx.fillStyle = '#f4edda'; ctx.fillRect(640, 90, 200, 110);
    const environment = new THREE.CanvasTexture(envCanvas); environment.mapping = THREE.EquirectangularReflectionMapping; environment.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(this.renderer); this.scene.environment = pmrem.fromEquirectangular(environment).texture; environment.dispose(); pmrem.dispose();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#eeede5', roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.049; ground.receiveShadow = true; this.scene.add(ground);
    // Soft contact shadow gives the board weight, even under diffuse studio light.
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const context = c.getContext('2d'), g = context.createRadialGradient(64, 64, 10, 64, 64, 64); g.addColorStop(0, '#28291c50'); g.addColorStop(0.6, '#28291c20'); g.addColorStop(1, '#28291c00'); context.fillStyle = g; context.fillRect(0,0,128,128);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 2.6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; shadow.position.set(0.025, -0.047, 0.018); this.scene.add(shadow);
  }
  box(w, h, d, x, y, z, material = this.materials.rail, radius = 0.002) {
    const mesh = new THREE.Mesh(roundedGeometry(w,h,d,radius), material); mesh.position.set(x,y,z); mesh.castShadow = mesh.receiveShadow = true; this.scene.add(mesh); return mesh;
  }
  makeBoard() {
    this.box(0.435, 0.024, 2.055, 0, -0.014, 0, this.materials.rail, 0.006);
    this.box(0.392, 0.008, 2.0, 0, -0.0035, 0, this.materials.floor, 0.002);
    for (const x of [-0.206, 0.206]) {
      this.box(0.022, 0.062, 2.025, x, 0.02, 0, this.materials.rail, 0.004);
      this.box(0.0024, 0.001, 1.99, x - Math.sign(x) * 0.002, 0.052, 0, this.materials.inlay, 0.0004);
      for (const z of [-0.96, 0.96, 0.61]) this.makeScrew(x, 0.053, z);
    }
    this.box(0.414, 0.058, 0.024, 0, 0.018, -0.998, this.materials.rail);
    this.box(0.433, 0.038, 0.026, 0, 0.005, 1.001, this.materials.rail, 0.004);
    this.box(0.417, 0.015, 0.027, 0, 0.053, 0.603, this.materials.honey, 0.003);
    for (const x of [-0.0975, 0, 0.0975]) this.box(0.006, 0.046, 0.322, x, 0.018, -0.829, this.materials.honey, 0.001);
    const shape = new THREE.Shape(); shape.moveTo(-0.207, 0);
    for (const center of CENTERS) {
      const left = center - OPENING / 2, right = center + OPENING / 2;
      shape.lineTo(left, 0); shape.lineTo(left, 0.024); shape.quadraticCurveTo(left, 0.032, left + 0.008, 0.032);
      shape.lineTo(right - 0.008, 0.032); shape.quadraticCurveTo(right, 0.032, right, 0.024); shape.lineTo(right, 0);
    }
    shape.lineTo(0.207, 0); shape.lineTo(0.207, 0.069); shape.lineTo(-0.207, 0.069); shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.018, bevelEnabled: true, bevelSize: 0.0006, bevelThickness: 0.0006, bevelSegments: 2, curveSegments: 8 });
    const uv = geometry.attributes.uv; for (let i=0;i<uv.count;i++) uv.setXY(i, uv.getX(i) * 4 + 0.5, uv.getY(i) * 4);
    const gate = new THREE.Mesh(geometry, this.materials.rail); gate.position.set(0,0,GATE-0.009); gate.castShadow = gate.receiveShadow = true; this.scene.add(gate);
    [2,3,4,1].forEach((number, i) => {
      const label = this.textLabel(String(number), '#ebd1a0', 0.036, 0.025); label.position.set(CENTERS[i], 0.051, GATE + 0.0105); this.scene.add(label);
      const topLabel = this.textLabel(String(number), '#ead0a0', 0.035, 0.016); topLabel.rotation.x = -Math.PI / 2; topLabel.position.set(CENTERS[i], 0.070, GATE); this.scene.add(topLabel);
    });
    const brand = this.textLabel('S J O E L S T U D I O', '#c4a777', 0.145, 0.012, 24); brand.position.set(0, 0.005, 1.016); this.scene.add(brand);
    for (const x of [-0.155,0.155]) for (const z of [-0.82,0.82]) this.box(0.05,0.02,0.07,x,-0.039,z,new THREE.MeshStandardMaterial({color:'#403d2a',roughness:0.95}),0.009);
  }
  makeScrew(x, y, z) {
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0028, 0.001, 12), this.materials.brass); screw.position.set(x,y,z); this.scene.add(screw);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.0037,0.0002,0.00045), new THREE.MeshStandardMaterial({color:'#594c31',roughness:0.6})); slot.position.set(x,y+0.0006,z); slot.rotation.y = z; this.scene.add(slot);
  }
  makeRamp() {
    const shape=new THREE.Shape();shape.moveTo(-RAMP_LENGTH/2,0);shape.lineTo(RAMP_LENGTH/2,0);shape.lineTo(RAMP_LENGTH/2,RAMP_HEIGHT);shape.closePath();
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:RAMP_WIDTH,bevelEnabled:true,bevelSize:0.0007,bevelThickness:0.0007,bevelSegments:2,steps:1});
    geometry.rotateY(Math.PI/2);geometry.translate(-RAMP_WIDTH/2,0,0);
    const position=geometry.attributes.position,normal=geometry.attributes.normal,uv=geometry.attributes.uv;
    for(let i=0;i<position.count;i++){
      if(Math.abs(normal.getX(i))>0.7)uv.setXY(i,position.getY(i)/RAMP_HEIGHT,position.getZ(i)/RAMP_LENGTH+0.5);
      else uv.setXY(i,position.getX(i)/RAMP_WIDTH+0.5,position.getZ(i)/RAMP_LENGTH+0.5);
    }
    this.rampGroup=new THREE.Group();const wedge=new THREE.Mesh(geometry,this.materials.honey);wedge.castShadow=wedge.receiveShadow=true;this.rampGroup.add(wedge);
    const arrowShape=new THREE.Shape();arrowShape.moveTo(0,0.026);arrowShape.lineTo(-0.014,0.004);arrowShape.lineTo(-0.005,0.004);arrowShape.lineTo(-0.005,-0.025);arrowShape.lineTo(0.005,-0.025);arrowShape.lineTo(0.005,0.004);arrowShape.lineTo(0.014,0.004);arrowShape.closePath();
    const arrow=new THREE.Mesh(new THREE.ShapeGeometry(arrowShape),new THREE.MeshStandardMaterial({color:'#526646',roughness:0.8,side:THREE.DoubleSide}));arrow.rotation.x=-Math.PI/2+Math.atan(RAMP_HEIGHT/RAMP_LENGTH);arrow.position.y=RAMP_HEIGHT/2+0.0015;this.rampGroup.add(arrow);
    this.rampGhost=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:'#708c53',wireframe:true,transparent:true,opacity:0.7,depthTest:false,depthWrite:false}));this.rampGhost.renderOrder=30;
    this.scene.add(this.rampGroup,this.rampGhost);this.rampGhost.visible=false;this.setRamp(normalizeRamp());
  }
  setRamp(config) {
    this.rampConfig=normalizeRamp(config);this.rampGroup.visible=this.rampConfig.enabled;
    this.rampGroup.position.set(this.rampConfig.x,0.001,this.rampConfig.z);
    if(!this.rampPlacement)this.rampGhost.position.copy(this.rampGroup.position);
  }
  setRampPlacement(enabled) {this.rampPlacement=enabled;this.rampGhost.visible=enabled;this.rampGhost.position.set(this.rampConfig.x,0.003,this.rampConfig.z);this.renderer.domElement.style.cursor=enabled?'crosshair':'';}
  textLabel(text, color, w, h, fontSize = 100) {
    const canvas = document.createElement('canvas'); canvas.width = fontSize===100?256:512; canvas.height = 256;
    const c = canvas.getContext('2d'); c.fillStyle = color; c.font = `500 ${fontSize===100?210:fontSize}px Georgia`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text,canvas.width/2,137);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.PlaneGeometry(w,h), new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}));
  }
  makePuck() {
    if (!this.puckGeometry) {
      const points = [[0,0],[0.0215,0],[0.0245,0.001],[RADIUS,0.0035],[RADIUS,0.01],[0.0247,0.0129],[0.0225,0.0136],[0.0205,0.0125],[0,0.0118]].map(([x,y])=>new THREE.Vector2(x,y));
      this.puckGeometry = new THREE.LatheGeometry(points, 40);
      const positions = this.puckGeometry.attributes.position, uv = this.puckGeometry.attributes.uv;
      for (let i = 0; i < positions.count; i++) uv.setXY(i, positions.getX(i) / (2 * RADIUS) + 0.5, positions.getZ(i) / (2 * RADIUS) + 0.5);
      this.puckRingGeometry = new THREE.TorusGeometry(0.0224, 0.00022, 6, 48);
    }
    const group = new THREE.Group(), body = new THREE.Mesh(this.puckGeometry, this.materials.puck); body.castShadow = body.receiveShadow = true; group.add(body);
    const ring = new THREE.Mesh(this.puckRingGeometry, this.materials.ring); ring.rotation.x = Math.PI / 2; ring.position.y = 0.0136; group.add(ring);
    return group;
  }
  makeAim() {
    this.aim = new THREE.Group(); this.scene.add(this.aim);
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.032,0.0332,64),new THREE.MeshBasicMaterial({color:'#6e8955',transparent:true,opacity:0.7,side:THREE.DoubleSide,depthWrite:false})); halo.rotation.x=-Math.PI/2; halo.position.y=0.003; this.aim.add(halo); this.halo=halo;
    this.line = new THREE.Line(new THREE.BufferGeometry(),new THREE.LineDashedMaterial({color:'#6a8752',dashSize:0.024,gapSize:0.018,transparent:true,opacity:0.65,depthWrite:false})); this.aim.add(this.line);
    const arrowShape = new THREE.Shape(); arrowShape.moveTo(0,-0.018); arrowShape.lineTo(-0.008,0.003); arrowShape.lineTo(0,0); arrowShape.lineTo(0.008,0.003); arrowShape.closePath();
    this.arrow = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape),new THREE.MeshBasicMaterial({color:'#637d4d',transparent:true,opacity:0.8,side:THREE.DoubleSide})); this.arrow.rotation.x=-Math.PI/2; this.aim.add(this.arrow);
    // A ribbon on the aiming vector shows the selected power in the player's view.
    this.powerMeter = new THREE.Group(); this.aim.add(this.powerMeter);
    const meterLayer = (color, order) => {
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({color,transparent:true,opacity:0.97,side:THREE.DoubleSide,depthWrite:false,depthTest:false,toneMapped:false}));
      mesh.renderOrder=order;this.powerMeter.add(mesh);return mesh;
    };
    this.powerMeterBorder=meterLayer('#677e50',20);
    this.powerMeterTrack=meterLayer('#f5f3de',21);
    this.powerMeterFill=meterLayer('#92ac58',22);
    this.meterLowColor=new THREE.Color('#79a63f');this.meterHighColor=new THREE.Color('#c49b31');
  }
  setAim(x, angle, power = 56, visible = true) {
    this.aim.visible = this.preview.visible = visible;
    if (!visible) return;
    const ratio=clamp(power/100,0,1);
    this.powerMeterFill.material.color.copy(this.meterLowColor).lerp(this.meterHighColor,ratio);
    if(this.aimPath&&this.aimX===x&&this.aimAngle===angle){this.updateMeterRibbon(this.powerMeterFill,this.aimPath,0.24+0.26*ratio,0.022,0.0042);return;}
    this.aimX=x;this.aimAngle=angle;
    const a = angle * Math.PI / 180, dx = Math.sin(a), dz = -Math.cos(a);
    this.preview.position.set(x,0.001,LAUNCH_Z); this.halo.position.set(x,0.002,LAUNCH_Z);
    const points=[new THREE.Vector3(x + dx * 0.045,0.003,LAUNCH_Z + dz * 0.045)];
    let px=x,pz=LAUNCH_Z,vx=dx;
    const path=[{x:px,z:pz,d:0}];
    for (let step=1;step<=53;step++) { const d=step*0.01;px += vx*0.01; pz += dz*0.01; if (Math.abs(px)>HALF_WIDTH-RADIUS) {px=clamp(px,-HALF_WIDTH+RADIUS,HALF_WIDTH-RADIUS);vx=-vx;}path.push({x:px,z:pz,d});if (d>=0.05) points.push(new THREE.Vector3(px,0.003,pz)); }
    this.line.geometry.dispose(); this.line.geometry=new THREE.BufferGeometry().setFromPoints(points); this.line.computeLineDistances();
    this.arrow.position.set(px,0.004,pz); this.arrow.rotation.set(-Math.PI/2,0,-Math.atan2(vx,-dz));
    this.aimPath=path;
    this.updateMeterRibbon(this.powerMeterBorder,path,0.5,0.032,0.0038);
    this.updateMeterRibbon(this.powerMeterTrack,path,0.5,0.026,0.004);
    this.updateMeterRibbon(this.powerMeterFill,path,0.24+0.26*ratio,0.022,0.0042);
  }
  updateMeterRibbon(mesh,path,end,width,height) {
    const vertices=[],start=0.24;
    for(let i=1;i<path.length;i++){
      const a=path[i-1],b=path[i];if(b.d<=start||a.d>=end)continue;
      const begin=Math.max(start,a.d),finish=Math.min(end,b.d),span=b.d-a.d;
      const t0=(begin-a.d)/span,t1=(finish-a.d)/span;
      const x0=a.x+(b.x-a.x)*t0,z0=a.z+(b.z-a.z)*t0,x1=a.x+(b.x-a.x)*t1,z1=a.z+(b.z-a.z)*t1;
      const length=Math.hypot(x1-x0,z1-z0);if(length<1e-8)continue;
      const nx=-(z1-z0)/length*width/2,nz=(x1-x0)/length*width/2;
      vertices.push(x0+nx,height,z0+nz,x0-nx,height,z0-nz,x1+nx,height,z1+nz,x1+nx,height,z1+nz,x0-nx,height,z0-nz,x1-nx,height,z1-nz);
    }
    mesh.geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));mesh.geometry.computeBoundingSphere();
  }
  syncPucks(pucks) {
    const ids = new Set(pucks.map(p=>p.id));
    for (const [id,mesh] of this.puckMeshes) if (!ids.has(id)) { this.scene.remove(mesh); this.puckMeshes.delete(id); }
    for (const puck of pucks) { let mesh=this.puckMeshes.get(puck.id); if(!mesh){mesh=this.makePuck();this.puckMeshes.set(puck.id,mesh);this.scene.add(mesh);} mesh.position.set(puck.x,(puck.y||0)+0.001,puck.z); mesh.rotation.set(puck.tilt||0,puck.rotation,0); }
  }
  setStock(count) {
    this.stock.clear();
    const shown=Math.min(13,count);
    for(let i=0;i<shown;i++){const puck=this.makePuck(); const pile=i<7?0:1,level=i<7?i:i-7; puck.position.set(0.306 + pile*0.062,-0.047+level*0.014,0.77-pile*0.06); puck.rotation.y=i*0.53;this.stock.add(puck);}
  }
  setLocked(counts) {
    this.locked.clear();
    counts.forEach((count,lane)=>{for(let i=0;i<count;i++){const puck=this.makePuck();puck.position.set(CENTERS[lane]+(i%2===0?-0.019:0.019),0.001+Math.floor(i/4)*0.014,-0.939+Math.floor(i%4/2)*0.059);puck.rotation.y=i*0.7;this.locked.add(puck);}});
  }
  setView(view, immediate = false) {
    const views={perspective:{theta:0.57,phi:0.79,distance:3.18},player:{theta:0,phi:0.54,distance:2.84},top:{theta:0,phi:1.565,distance:3.85}};
    this.goal={...(views[view]||views.perspective)}; this.view=view;
    if(immediate||this.reducedMotion)this.orbit={...this.goal};
  }
  beginReplay() {
    this.replayCamera={active:false,saved:{orbit:{...this.orbit},goal:{...this.goal},target:this.target.clone(),view:this.view},position:this.camera.position.clone(),target:this.cameraLook.clone(),fov:this.camera.fov};
    this.cameraTransition=null;
  }
  transitionToNormal() {this.cameraTransition={position:this.camera.position.clone(),target:this.cameraLook.clone(),fov:this.camera.fov,age:0};}
  setReplayCinematic(enabled) {
    if(!this.replayCamera)return;
    if(this.replayCamera.active&&!enabled)this.transitionToNormal();
    this.replayCamera.active=enabled;
    if(enabled)this.cameraTransition=null;
  }
  followReplayPuck(puck, progress, snap = false) {
    if(!this.replayCamera?.active)return;
    const pose=cinematicPose(puck,progress,this.camera.aspect),rig=this.replayCamera;
    rig.position.set(pose.position.x,pose.position.y,pose.position.z);rig.target.set(pose.target.x,pose.target.y,pose.target.z);rig.fov=pose.fov;
    if(snap){this.camera.position.copy(rig.position);this.cameraLook.copy(rig.target);this.camera.fov=rig.fov;this.camera.updateProjectionMatrix();}
  }
  endReplay() {
    if(!this.replayCamera)return;
    const saved=this.replayCamera.saved;this.transitionToNormal();this.orbit={...saved.orbit};this.goal={...saved.goal};this.target.copy(saved.target);this.view=saved.view;this.replayCamera=null;
  }
  makeControls() {
    const canvas=this.renderer.domElement;
    let pointer=null;
    const boardHit=e=>{const rect=canvas.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),this.camera);const hit=new THREE.Vector3();return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),hit)&&Math.abs(hit.x)<HALF_WIDTH&&hit.z>-0.7&&hit.z<0.99?hit:null;};
    canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false};canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointermove',e=>{if(this.rampPlacement){const hit=boardHit(e);if(hit){const r=normalizeRamp({x:hit.x,z:hit.z});this.rampGhost.position.set(r.x,0.003,r.z);}return;}if(!pointer||e.pointerId!==pointer.id)return;const dx=e.clientX-pointer.lastX,dy=e.clientY-pointer.lastY;if(Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)>4)pointer.moved=true;if(pointer.moved){this.goal.theta-=dx*0.008;this.goal.phi=clamp(this.goal.phi+dy*0.006,0.18,1.565);this.onOrbit?.();}pointer.lastX=e.clientX;pointer.lastY=e.clientY;});
    canvas.addEventListener('pointerup',e=>{if(!pointer||e.pointerId!==pointer.id)return;const hit=boardHit(e);if(this.rampPlacement&&hit){const r=normalizeRamp({x:hit.x,z:hit.z});this.onRampPlace?.(r.x,r.z);}else if(!pointer.moved&&hit&&hit.z>0.61)this.onPlace?.(clamp(hit.x,-0.162,0.162));pointer=null;});
    canvas.addEventListener('pointercancel',()=>pointer=null);
    canvas.addEventListener('wheel',e=>{e.preventDefault();this.onOrbit?.();this.goal.distance=clamp(this.goal.distance+e.deltaY*0.002,1.65,4.4);},{passive:false});
  }
  resize() {const {width,height}=this.container.getBoundingClientRect(); if(!width||!height)return;this.renderer.setSize(width,height);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();}
  render(dt) {
    const blend=this.reducedMotion?1:1-Math.exp(-dt*9);
    for(const key of ['theta','phi','distance'])this.orbit[key]+=(this.goal[key]-this.orbit[key])*blend;
    const oldFov=this.camera.fov;
    if(this.replayCamera?.active){
      const rig=this.replayCamera;
      const followBlend=this.reducedMotion?1:1-Math.exp(-dt*18);
      this.camera.position.lerp(rig.position,followBlend);this.cameraLook.lerp(rig.target,followBlend);this.camera.fov+=(rig.fov-this.camera.fov)*blend;
    }else{
      const {theta,phi,distance}=this.orbit;
      const fit=this.camera.aspect<1?1.13:1;
      const position=new THREE.Vector3(Math.sin(theta)*Math.cos(phi)*distance*fit,Math.sin(phi)*distance*fit,Math.cos(theta)*Math.cos(phi)*distance*fit).add(this.target);
      if(this.cameraTransition){
        const transition=this.cameraTransition;transition.age+=dt;
        const t=this.reducedMotion?1:clamp(transition.age/0.6,0,1),ease=t*t*(3-2*t);
        this.camera.position.lerpVectors(transition.position,position,ease);this.cameraLook.lerpVectors(transition.target,this.target,ease);this.camera.fov=transition.fov+(34-transition.fov)*ease;
        if(t===1)this.cameraTransition=null;
      }else{this.camera.position.copy(position);this.cameraLook.copy(this.target);this.camera.fov=34;}
    }
    if(Math.abs(this.camera.fov-oldFov)>0.00001)this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.cameraLook);
    this.renderer.render(this.scene,this.camera);
  }
}
