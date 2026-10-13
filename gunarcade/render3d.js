import * as THREE from '../minecraft/libs/three.module.js';
import { HEROES, WEAPONS } from './engine.js';

const ENEMY_COLORS = { scout: '#ff926e', brute: '#ff657c', shooter: '#cb87ff', boss: '#ffc363' };
const WEAPON_GLYPHS = { rifle: 'R', shotgun: 'S', rail: 'P', burst: 'B' };

export function createRenderer(container, { reducedMotion = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
  renderer.setClearColor('#060c17');
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Gun Arcade 3D 네온 아레나. 준비 시간에 무기 상자를 수집하고 전투에서 적을 처치하세요.');
  Object.assign(canvas.style, { width: '100%', height: '100%', display: 'block', touchAction: 'none' });
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#060c17');
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 900);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const hitPoint = new THREE.Vector3();
  const focus = new THREE.Vector3();
  const targetFocus = new THREE.Vector3();
  const viewDirection = new THREE.Vector3(0, 0.82, 0.57).normalize();
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  const instancedMeshes = new Set();
  const maps = { enemies: new Map(), pickups: new Map(), bullets: new Map(), obstacles: new Map() };
  const dynamicRoot = new THREE.Group();
  dynamicRoot.userData.kind = 'dynamic';
  scene.add(dynamicRoot);
  const transform = new THREE.Object3D();
  let disposed = false;
  let lost = false;
  let stage = null;
  let heroId = null;
  let heroVisual;
  let selectedKind = null;
  let weaponVisual;
  let width = 0;
  let height = 0;
  let elapsed = 0;
  let muzzleTime = 0;
  let hurtTime = 0;
  let particleCursor = 0;
  let lastHalf = 32;
  let lastState;

  const geo = shape => { geometries.add(shape); return shape; };
  const mat = appearance => { materials.add(appearance); return appearance; };
  const box = geo(new THREE.BoxGeometry(1, 1, 1));
  const sphere = geo(new THREE.SphereGeometry(1, 12, 8));
  const ico = geo(new THREE.IcosahedronGeometry(1, 0));
  const cone = geo(new THREE.ConeGeometry(1, 2, 4));
  const cylinder = geo(new THREE.CylinderGeometry(1, 1, 1, 12));
  const torus = geo(new THREE.TorusGeometry(1, 0.13, 6, 24));
  const edgesGeometry = geo(new THREE.EdgesGeometry(box));
  const labelPlane = geo(new THREE.PlaneGeometry(2, 2));
  const glowMaterial = mat(new THREE.MeshBasicMaterial({ color: '#6fe9fa', transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }));
  const armorMaterial = mat(new THREE.MeshStandardMaterial({ color: '#23364e', metalness: 0.7, roughness: 0.3 }));
  const visorMaterial = mat(new THREE.MeshBasicMaterial({ color: '#b5f7ff' }));
  const hpMaterial = mat(new THREE.MeshBasicMaterial({ color: '#77ffc0', depthTest: false }));
  const hpBackMaterial = mat(new THREE.MeshBasicMaterial({ color: '#273144', depthTest: false }));
  const crateBodyMaterial = mat(new THREE.MeshStandardMaterial({ color: '#192e45', metalness: 0.75, roughness: 0.35 }));
  const shadowMaterial = mat(new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.28, depthWrite: false }));
  const shadowGeometry = geo(new THREE.CircleGeometry(1, 20));
  const weaponMaterials = new Map();
  const pickupLabels = new Map();
  const enemyMaterials = new Map();
  const outlineMaterials = new Map();
  for (const [kind, weapon] of Object.entries(WEAPONS)) {
    const appearance = mat(new THREE.MeshStandardMaterial({ color: weapon.color, emissive: weapon.color, emissiveIntensity: 0.35, metalness: 0.55, roughness: 0.3 }));
    weaponMaterials.set(kind, appearance);
    outlineMaterials.set(kind, mat(new THREE.LineBasicMaterial({ color: weapon.color, transparent: true, opacity: 0.9 })));
    const label = document.createElement('canvas');
    label.width = label.height = 128;
    const ctx = label.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 128, 128);
      ctx.font = '900 92px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff'; ctx.shadowColor = weapon.color; ctx.shadowBlur = 12;
      ctx.fillText(WEAPON_GLYPHS[kind] || kind[0].toUpperCase(), 64, 68);
      const texture = new THREE.CanvasTexture(label); texture.colorSpace = THREE.SRGBColorSpace; textures.add(texture);
      pickupLabels.set(kind, mat(new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false })));
    }
  }
  for (const [kind, color] of Object.entries(ENEMY_COLORS)) enemyMaterials.set(kind, mat(new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25, roughness: 0.38, metalness: 0.55 })));

  function mesh(shape, appearance, parent, x=0, y=0, z=0, sx=1, sy=1, sz=1) {
    const object = new THREE.Mesh(shape, appearance);
    object.position.set(x,y,z); object.scale.set(sx,sy,sz); parent.add(object);
    return object;
  }
  function shadow(parent, radius=1.3) {
    const object = mesh(shadowGeometry, shadowMaterial, parent, 0,0.045,0,radius,radius,1);
    object.rotation.x = -Math.PI/2;
  }

  scene.add(new THREE.AmbientLight('#aecbff', 1.2));
  const sunlight = new THREE.DirectionalLight('#edfaff', 2.2);
  sunlight.position.set(-24,60,18); sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(1024,1024);
  Object.assign(sunlight.shadow.camera, {left:-45,right:45,top:45,bottom:-45,near:1,far:140});
  sunlight.shadow.camera.updateProjectionMatrix();
  scene.add(sunlight);
  const pinkLight = new THREE.PointLight('#fc4f9f', 70, 140, 1); pinkLight.position.set(24,15,-16); scene.add(pinkLight);
  const blueLight = new THREE.PointLight('#44d8ff', 65, 140, 1); blueLight.position.set(-24,12,20); scene.add(blueLight);

  const floorMaterial = mat(new THREE.MeshStandardMaterial({color:'#091a27',metalness:0.32,roughness:0.6}));
  const floor = mesh(box,floorMaterial,scene,0,-0.4,0,64,0.8,64); floor.receiveShadow=true;
  mesh(box,armorMaterial,scene,0,-1.5,0,68,1.5,68);
  const grid = new THREE.GridHelper(64,32,'#368799','#18354b'); grid.position.y=0.02; scene.add(grid);
  geometries.add(grid.geometry); (Array.isArray(grid.material)?grid.material:[grid.material]).forEach(value=>materials.add(value));
  const borderMaterial = mat(new THREE.MeshStandardMaterial({color:'#4de5d0',emissive:'#4de5d0',emissiveIntensity:0.8,metalness:0.45,roughness:0.3}));
  const borders = new THREE.Group(); scene.add(borders);
  mesh(box,borderMaterial,borders,-32,0.65,0,0.4,1.3,64);
  mesh(box,borderMaterial,borders,32,0.65,0,0.4,1.3,64);
  mesh(box,borderMaterial,borders,0,0.65,-32,64,1.3,0.4);
  mesh(box,borderMaterial,borders,0,0.65,32,64,1.3,0.4);
  const warningMaterial = mat(new THREE.MeshBasicMaterial({color:'#ff784f',transparent:true,opacity:0.25,blending:THREE.AdditiveBlending,depthWrite:false}));
  const warningRing = mesh(torus,warningMaterial,scene,0,0.1,0,30,30,0.3); warningRing.rotation.x=-Math.PI/2;
  warningRing.visible=false;

  const playerGroup = new THREE.Group(); playerGroup.userData.kind='player'; scene.add(playerGroup);
  const playerHalo = mesh(torus,glowMaterial,playerGroup,0,0.14,0,1.5,1.5,0.4); playerHalo.rotation.x=-Math.PI/2;
  const muzzleMaterial = mat(new THREE.MeshBasicMaterial({color:'#ffeca0',transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));
  const muzzleFlash = mesh(ico,muzzleMaterial,playerGroup,0.5,1.8,2.8,0.75,0.75,0.9);
  const playerHP = new THREE.Group(); playerHP.userData.kind='player-hp'; scene.add(playerHP);
  mesh(box,hpBackMaterial,playerHP,0,0,0,3.2,0.19,0.08);
  const playerHPFill = mesh(box,hpMaterial,playerHP,0,0,0.03,3.05,0.11,0.08);

  function createHero(id) {
    if(heroVisual) {
      playerGroup.remove(heroVisual.group);
      heroVisual.material.dispose(); materials.delete(heroVisual.material);
    }
    const hero=HEROES.find(item=>item.id===id)||HEROES[0]||{id:'scout',color:'#55e5cd',stats:{}};
    const group=new THREE.Group(); group.userData.heroId=hero.id;
    const appearance=mat(new THREE.MeshStandardMaterial({color:hero.color,emissive:hero.color,emissiveIntensity:0.2,roughness:0.35,metalness:0.6}));
    const tank=hero.id==='tank'; const scout=hero.id==='scout'; const engineer=hero.id==='engineer';
    const bulk=tank?1.5:scout?0.8:1.05;
    mesh(box,appearance,group,0,1.65,0,1.3*bulk,1.3,0.95*bulk);
    mesh(tank?cylinder:box,armorMaterial,group,0,2.55,0,tank?0.72:0.92,tank?0.7:0.85,tank?0.72:0.8);
    mesh(box,visorMaterial,group,0,2.58,0.45,scout?0.7:1,0.19,0.09);
    [-1,1].forEach(sign=>{
      mesh(box,armorMaterial,group,sign*0.36*bulk,0.6,0,0.4*bulk,1.15,0.5);
      mesh(box,appearance,group,sign*0.85*bulk,1.75,0,0.35*bulk,0.9,0.5);
      if(tank) mesh(sphere,appearance,group,sign*0.93,2.02,0,0.46,0.46,0.46);
      if(scout) { const fin=mesh(cone,appearance,group,sign*0.8,1.9,-0.35,0.25,0.7,0.2); fin.rotation.z=sign*0.4; }
    });
    if(engineer) {
      mesh(box,appearance,group,0,1.85,-0.75,0.85,1,0.45);
      [-1,1].forEach(sign=>{mesh(box,visorMaterial,group,sign*0.35,3,0,0.09,0.8,0.09);mesh(sphere,appearance,group,sign*0.35,3.4,0,0.18,0.18,0.18);});
    } else if(hero.id==='ranger') {
      const crest=mesh(cone,appearance,group,0,3,0,0.38,0.48,0.32); crest.rotation.y=Math.PI/4;
      mesh(box,appearance,group,0,1.6,-0.65,0.8,1.3,0.22);
    }
    group.traverse(node=>{if(node.isMesh)node.castShadow=true;});
    playerGroup.add(group); heroVisual={group,material:appearance}; heroId=id;
  }

  function createWeapon(kind) {
    if(weaponVisual) playerGroup.remove(weaponVisual);
    const group=new THREE.Group(); group.userData.weaponKind=kind;
    const appearance=weaponMaterials.get(kind)||armorMaterial;
    const length=kind==='rail'?2.2:kind==='shotgun'?1.1:1.5;
    mesh(box,armorMaterial,group,0,0,0,0.48,0.42,length);
    const barrel=mesh(cylinder,appearance,group,0,0,length/2+0.35,0.15,0.7,0.15); barrel.rotation.x=Math.PI/2;
    if(kind==='shotgun') {const second=mesh(cylinder,appearance,group,0.21,0,length/2+0.35,0.13,0.7,0.13);second.rotation.x=Math.PI/2;}
    if(kind==='rail') mesh(box,appearance,group,0,0.22,0,0.2,0.15,1.7);
    if(kind==='burst') mesh(box,appearance,group,0.24,0,0,0.17,0.4,0.8);
    mesh(box,appearance,group,0,0.25,-0.2,0.18,0.15,0.45);
    group.position.set(0.72,1.75,0.9);
    playerGroup.add(group); weaponVisual=group; selectedKind=kind;
    muzzleFlash.position.set(0.72,1.75,0.9+length/2+0.8);
  }

  function release(entry) {
    dynamicRoot.remove(entry.group);
    if(entry.hpGroup) dynamicRoot.remove(entry.hpGroup);
    if(entry.ownMaterial) {entry.ownMaterial.dispose();materials.delete(entry.ownMaterial);}
  }
  function clearStage() {
    Object.values(maps).forEach(map=>{map.forEach(release);map.clear();});
    particles.forEach(particle=>{particle.life=0;}); muzzleTime=0;hurtTime=0;
  }
  function sync(map,items,create,update,visible=()=>true) {
    const used=new Set();
    for(const item of items||[]) {
      if(!visible(item))continue;
      used.add(item.id);let entry=map.get(item.id);
      if(!entry){entry=create(item);entry.group.userData.id=item.id;dynamicRoot.add(entry.group);if(entry.hpGroup)dynamicRoot.add(entry.hpGroup);map.set(item.id,entry);}
      update(entry,item);
    }
    for(const [id,entry] of map)if(!used.has(id)){release(entry);map.delete(id);}
  }

  function createEnemy(enemy) {
    const group=new THREE.Group();group.userData.kind='enemy';group.userData.type=enemy.type;
    const appearance=enemyMaterials.get(enemy.type)||enemyMaterials.get('scout');
    const brute=enemy.type==='brute';const boss=enemy.type==='boss';const shooter=enemy.type==='shooter';
    const size=boss?2.1:brute?1.45:1;
    mesh(boss?sphere:box,appearance,group,0,1.4*size,0,1.45*size,1.3*size,1.3*size);
    mesh(shooter?cone:box,armorMaterial,group,0,2.5*size,0,1.0*size,0.65*size,0.95*size);
    mesh(box,visorMaterial,group,0,2.5*size,0.5*size,0.85*size,0.17*size,0.08);
    if(shooter)mesh(box,appearance,group,0.7,1.8,0.8,0.45,0.45,1.6);
    if(brute||boss)[-1,1].forEach(sign=>mesh(ico,appearance,group,sign*1.1*size,1.7*size,0,0.5*size,0.5*size,0.5*size));
    [-1,1].forEach(sign=>mesh(box,armorMaterial,group,sign*0.4*size,0.4*size,0,0.5*size,0.7*size,0.65*size));
    shadow(group,size*1.2);
    const flashMaterial=mat(new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:0,depthWrite:false}));
    const flash=mesh(sphere,flashMaterial,group,0,1.7*size,0,size*1.4,size*1.6,size*1.4);
    const hpGroup=new THREE.Group();hpGroup.userData.kind='enemy-hp';
    mesh(box,hpBackMaterial,hpGroup,0,0,0,2.6*size,0.18,0.07);
    const fill=mesh(box,hpMaterial,hpGroup,0,0,0.03,2.45*size,0.1,0.08);
    group.traverse(node=>{if(node.isMesh&&node!==flash)node.castShadow=true;});
    return {group,hpGroup,fill,flash,size,hp:enemy.hp,flashUntil:0,ownMaterial:flashMaterial};
  }
  function updateEnemy(entry,enemy) {
    entry.group.position.set(enemy.x,0,enemy.z);
    const player=lastState.player||{x:0,z:0};entry.group.rotation.y=Math.atan2(player.x-enemy.x,player.z-enemy.z);
    const ratio=Math.max(0,Math.min(1,enemy.hp/Math.max(1,enemy.maxHp||enemy.hp)));
    entry.fill.scale.x=2.45*entry.size*ratio;entry.fill.position.x=-2.45*entry.size*(1-ratio)/2;
    entry.hpGroup.position.set(enemy.x,3.35*entry.size,enemy.z);entry.hpGroup.quaternion.copy(camera.quaternion);
    if(entry.hp!==enemy.hp)entry.flashUntil=elapsed+0.12;entry.hp=enemy.hp;
    entry.ownMaterial.opacity=entry.flashUntil>elapsed?0.32:0;
  }
  function createPickup(pickup) {
    const group=new THREE.Group();group.userData.kind='pickup';
    mesh(box,crateBodyMaterial,group,0,0.9,0,1.8,1.7,1.8);
    const edges=new THREE.LineSegments(edgesGeometry,outlineMaterials.get(pickup.kind)||outlineMaterials.values().next().value);edges.position.y=0.9;edges.scale.set(1.85,1.75,1.85);group.add(edges);
    const hologram=mesh(ico,weaponMaterials.get(pickup.kind)||visorMaterial,group,0,2.65,0,0.65,0.8,0.65);
    const label=pickupLabels.has(pickup.kind)?mesh(labelPlane,pickupLabels.get(pickup.kind),group,0,3.6,0):null;
    const ring=mesh(torus,weaponMaterials.get(pickup.kind)||visorMaterial,group,0,0.13,0,1.4,1.4,0.3);ring.rotation.x=-Math.PI/2;
    return {group,hologram,label};
  }
  function updatePickup(entry,pickup) {
    entry.group.position.set(pickup.x,0,pickup.z);
    entry.hologram.rotation.y=reducedMotion?0:elapsed*1.2;
    entry.hologram.position.y=reducedMotion?2.65:2.65+Math.sin(elapsed*2+pickup.x)*0.18;
    if(entry.label)entry.label.quaternion.copy(camera.quaternion);
  }
  const friendlyBulletMaterial=mat(new THREE.MeshBasicMaterial({color:'#95fff2'}));
  const enemyBulletMaterial=mat(new THREE.MeshBasicMaterial({color:'#ff527c'}));
  function createBullet(bullet) {
    const group=new THREE.Group();group.userData.kind='bullet';const core=mesh(sphere,bullet.enemy?enemyBulletMaterial:friendlyBulletMaterial,group);
    mesh(sphere,glowMaterial,group,0,0,0,1.8,1.8,1.8);
    return {group,core,trail:Array.from({length:reducedMotion?2:7},()=>new THREE.Vector3()),trailCount:0};
  }
  function createObstacle(obstacle) {
    const group=new THREE.Group();group.userData.kind='obstacle';
    const body=mesh(box,armorMaterial,group);body.castShadow=true;body.receiveShadow=true;
    const edges=new THREE.LineSegments(edgesGeometry,outlineMaterials.values().next().value);group.add(edges);
    const beacon=mesh(box,visorMaterial,group);
    return {group,body,edges,beacon};
  }

  const particleCapacity=reducedMotion?48:180;
  const particles=Array.from({length:particleCapacity},()=>({life:0,maxLife:1,x:0,y:0,z:0,vx:0,vy:0,vz:0,size:1,color:new THREE.Color()}));
  const particleMesh=new THREE.InstancedMesh(ico,mat(new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:0.9,blending:THREE.AdditiveBlending,depthWrite:false})),particleCapacity);
  particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);particleMesh.frustumCulled=false;scene.add(particleMesh);instancedMeshes.add(particleMesh);
  const trailCapacity=512;
  const trails=new THREE.InstancedMesh(sphere,glowMaterial,trailCapacity);trails.instanceMatrix.setUsage(THREE.DynamicDrawUsage);trails.frustumCulled=false;scene.add(trails);instancedMeshes.add(trails);

  function eventEffect(event) {
    if(!['pickup','shot','hit','kill','hurt','combat-start','stage-clear','gameover','stage-start'].includes(event.type))return;
    const big=['kill','stage-clear','combat-start','gameover','pickup'].includes(event.type);
    const amount=reducedMotion?(big?5:1):(big?22:5);
    const x=Number.isFinite(event.x)?event.x:lastState.player?.x||0;
    const z=Number.isFinite(event.z)?event.z:lastState.player?.z||0;
    for(let n=0;n<amount;n++){
      const particle=particles[particleCursor++%particleCapacity];const angle=n/amount*Math.PI*2;
      const speed=big?4+Math.random()*7:2+Math.random()*3;
      Object.assign(particle,{life:big?0.6:0.25,maxLife:big?0.6:0.25,x,y:1.8,z,vx:Math.cos(angle)*speed,vz:Math.sin(angle)*speed,vy:reducedMotion?0:2+Math.random()*6,size:big?0.24:0.12});
      particle.color.set(event.color||WEAPONS[event.kind]?.color||(event.type==='hurt'||event.type==='gameover'?'#ff597d':'#6ff5ed'));
    }
    if(event.type==='shot'&&Math.hypot(x-(lastState.player?.x||0),z-(lastState.player?.z||0))<4)muzzleTime=0.09;
    if(event.type==='hurt'&&!reducedMotion)hurtTime=0.2;
  }
  function syncEffects(dt) {
    particles.forEach((particle,index)=>{
      particle.life=Math.max(0,particle.life-dt);
      if(particle.life>0){particle.x+=particle.vx*dt;particle.y+=particle.vy*dt;particle.z+=particle.vz*dt;particle.vy-=dt*10;transform.position.set(particle.x,Math.max(0.2,particle.y),particle.z);transform.rotation.set(elapsed+index,elapsed*2,0);transform.scale.setScalar(particle.size*particle.life/particle.maxLife);}else transform.scale.setScalar(0);
      transform.updateMatrix();particleMesh.setMatrixAt(index,transform.matrix);particleMesh.setColorAt(index,particle.color);
    });
    particleMesh.instanceMatrix.needsUpdate=true;particleMesh.instanceColor.needsUpdate=true;
    let index=0;
    maps.bullets.forEach(entry=>{for(let n=0;n<entry.trailCount&&index<trailCapacity;n++){transform.position.copy(entry.trail[n]);transform.rotation.set(0,0,0);transform.scale.setScalar(entry.group.scale.x*(1-n/entry.trail.length)*0.65);transform.updateMatrix();trails.setMatrixAt(index++,transform.matrix);}});
    while(index<trailCapacity){transform.scale.setScalar(0);transform.updateMatrix();trails.setMatrixAt(index++,transform.matrix);}trails.instanceMatrix.needsUpdate=true;
    muzzleTime=Math.max(0,muzzleTime-dt);muzzleMaterial.opacity=muzzleTime>0?0.9:0;
    hurtTime=Math.max(0,hurtTime-dt);
  }

  function resize() {
    if(disposed||lost)return;
    const bounds=container.getBoundingClientRect();const w=Math.max(1,Math.floor(bounds.width||container.clientWidth||1));const h=Math.max(1,Math.floor(bounds.height||container.clientHeight||1));
    if(w===width&&h===height)return;width=w;height=h;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
  }
  function updateCamera(state,dt) {
    const overview=state.phase==='select';
    const player=state.player||{x:0,z:0};
    targetFocus.set(overview?0:Math.max(-lastHalf+10,Math.min(lastHalf-10,player.x)),0,overview?0:Math.max(-lastHalf+10,Math.min(lastHalf-10,player.z)));
    if(!lastState||dt===0)focus.copy(targetFocus);else focus.lerp(targetFocus,Math.min(1,dt*7));
    const distance=overview?Math.max(lastHalf*3.7,lastHalf*2.4/camera.aspect):Math.max(59,43/camera.aspect);
    camera.far=Math.max(900,distance*4);camera.updateProjectionMatrix();camera.position.copy(viewDirection).multiplyScalar(distance).add(focus);
    if(hurtTime>0)camera.position.x+=Math.sin(elapsed*50)*hurtTime*1.3;
    camera.lookAt(focus);camera.updateMatrixWorld();
  }
  function screenToWorld(clientX,clientY) {
    if(disposed||lost)return null;resize();
    const bounds=canvas.getBoundingClientRect();if(!bounds.width||!bounds.height)return null;
    pointer.set((clientX-bounds.left)/bounds.width*2-1,-(clientY-bounds.top)/bounds.height*2+1);
    raycaster.setFromCamera(pointer,camera);if(!raycaster.ray.intersectPlane(plane,hitPoint))return null;
    return {x:Math.max(-lastHalf,Math.min(lastHalf,hitPoint.x)),z:Math.max(-lastHalf,Math.min(lastHalf,hitPoint.z))};
  }
  function render(state,events=[],dt=0) {
    if(disposed||lost||!state)return;resize();dt=Math.max(0,Math.min(Number.isFinite(dt)?dt:0,0.05));elapsed+=dt;
    if(stage!==state.stage){clearStage();stage=state.stage;}
    const previousState=lastState;lastState=state;lastHalf=state.arenaHalf||32;
    floor.scale.set(lastHalf*2,0.8,lastHalf*2);grid.scale.setScalar(lastHalf/32);borders.scale.set(lastHalf/32,1,lastHalf/32);
    const combat=state.phase==='combat'||state.phase==='paused'&&state.pausePhase==='combat';
    borderMaterial.color.set(combat?'#ff8654':'#4de5d0');borderMaterial.emissive.copy(borderMaterial.color);
    floorMaterial.color.set(combat?'#201823':'#091a27');warningRing.visible=combat;
    warningRing.material.opacity=reducedMotion?0.18:0.17+Math.sin(elapsed*3)*0.06;
    warningRing.scale.set(lastHalf*0.94,lastHalf*0.94,0.3);
    if(heroId!==state.heroId)createHero(state.heroId);
    const player=state.player||{x:0,z:0,yaw:0,hp:100,maxHp:100};
    playerGroup.position.set(player.x,0,player.z);playerGroup.rotation.y=Number.isFinite(player.yaw)?player.yaw:0;
    heroVisual.group.position.y=!reducedMotion&&state.phase!=='paused'?Math.sin(elapsed*5)*0.035:0;
    const weapon=(state.weapons||[])[state.selectedWeapon||0];const kind=weapon?.kind||'rifle';if(kind!==selectedKind)createWeapon(kind);
    const hpRatio=Math.max(0,Math.min(1,player.hp/Math.max(1,player.maxHp)));playerHPFill.scale.x=3.05*hpRatio;playerHPFill.position.x=-3.05*(1-hpRatio)/2;playerHP.position.set(player.x,3.8,player.z);
    updateCamera(state,previousState?dt:0);playerHP.quaternion.copy(camera.quaternion);
    sync(maps.obstacles,state.obstacles,createObstacle,(entry,obstacle)=>{const h=obstacle.h||2.5;entry.group.position.set(obstacle.x,0,obstacle.z);entry.body.position.y=h/2;entry.body.scale.set(obstacle.w,h,obstacle.d);entry.edges.position.y=h/2;entry.edges.scale.copy(entry.body.scale).multiplyScalar(1.015);entry.beacon.position.set(0,h+0.03,0);entry.beacon.scale.set(obstacle.w*0.7,0.05,0.09);});
    sync(maps.pickups,state.pickups,createPickup,updatePickup,pickup=>!pickup.collected);
    sync(maps.enemies,state.enemies,createEnemy,updateEnemy,enemy=>enemy.alive!==false&&enemy.hp>0);
    sync(maps.bullets,state.bullets,createBullet,(entry,bullet)=>{entry.group.position.set(bullet.x,1.8,bullet.z);entry.group.scale.setScalar(Math.max(0.12,bullet.radius||0.2));entry.core.material=bullet.enemy?enemyBulletMaterial:friendlyBulletMaterial;if(state.phase==='combat'&&dt>0){for(let n=entry.trail.length-1;n>0;n--)entry.trail[n].copy(entry.trail[n-1]);entry.trail[0].copy(entry.group.position);entry.trailCount=Math.min(entry.trail.length,entry.trailCount+1);}});
    (events||[]).forEach(eventEffect);syncEffects(dt);renderer.render(scene,camera);
  }
  function onLost(event) {
    event.preventDefault();lost=true;
    container.dispatchEvent(new CustomEvent('gunarcade:render-error',{bubbles:true,detail:{mode:'3d',message:'3D 화면 연결이 끊겼습니다. 게임을 일시정지하고 새로고침해 주세요.'}}));
  }
  canvas.addEventListener('webglcontextlost',onLost);
  function dispose() {
    if(disposed)return;disposed=true;canvas.removeEventListener('webglcontextlost',onLost);clearStage();
    instancedMeshes.forEach(object=>object.dispose());geometries.forEach(object=>object.dispose());materials.forEach(object=>object.dispose());textures.forEach(object=>object.dispose());renderer.dispose();canvas.remove();
  }
  resize();updateCamera({phase:'select',player:{x:0,z:0}},0);syncEffects(0);
  return {canvas,resize,render,screenToWorld,dispose};
}
