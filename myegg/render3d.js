import * as THREE from '../minecraft/libs/three.module.js';
import { LOCATIONS, TRAILS, DEMON_TYPES } from './engine.js';

const COLORS=['#ff9dbb','#ffc67c','#94dceb','#bda6ff','#9ed9b1'];

export function createRenderer(container,{reducedMotion=false}={}){
  const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const canvas=renderer.domElement;canvas.setAttribute('role','img');canvas.setAttribute('aria-label','MyEgg 3D 알과 아기 데몬 마을. 알, 둥지, 상점, 판매대, 러닝머신을 클릭해 상호작용합니다.');
  Object.assign(canvas.style,{width:'100%',height:'100%',display:'block',touchAction:'none'});container.appendChild(canvas);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#c7e6ed');scene.fog=new THREE.Fog('#d2e8e9',65,140);
  const camera=new THREE.PerspectiveCamera(50,1,0.1,650);const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  const geometrySet=new Set(),materialSet=new Set(),textureSet=new Set();
  const geo=value=>{geometrySet.add(value);return value;},mat=value=>{materialSet.add(value);return value;};
  const sphere=geo(new THREE.SphereGeometry(1,14,10)),box=geo(new THREE.BoxGeometry(1,1,1)),cone=geo(new THREE.ConeGeometry(1,2,10)),cylinder=geo(new THREE.CylinderGeometry(1,1,1,12)),torus=geo(new THREE.TorusGeometry(1,0.18,8,24));
  const circle=geo(new THREE.CircleGeometry(1,24)),signPlane=geo(new THREE.PlaneGeometry(1,1)),star=geo(new THREE.OctahedronGeometry(1,0));
  const white=mat(new THREE.MeshStandardMaterial({color:'#fff5ef',roughness:0.6}));
  const dark=mat(new THREE.MeshStandardMaterial({color:'#36516a',roughness:0.65,metalness:0.15}));
  const eyes=mat(new THREE.MeshBasicMaterial({color:'#223c51'}));const eyeLight=mat(new THREE.MeshBasicMaterial({color:'#ffffff'}));
  const wood=mat(new THREE.MeshStandardMaterial({color:'#c59874',roughness:0.9}));const straw=mat(new THREE.MeshStandardMaterial({color:'#efd694',roughness:0.85}));
  const pink=mat(new THREE.MeshStandardMaterial({color:'#ffa8cb',roughness:0.4}));
  const aqua=mat(new THREE.MeshStandardMaterial({color:'#83d8e2',emissive:'#2e7485',emissiveIntensity:0.15,roughness:0.45}));
  const green=mat(new THREE.MeshBasicMaterial({color:'#86edb0',transparent:true,opacity:0.55,depthWrite:false}));
  const glow=mat(new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:0.6,blending:THREE.AdditiveBlending,depthWrite:false}));
  const hitMaterial=mat(new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));
  const eggDot=mat(new THREE.MeshStandardMaterial({color:'#ffffff',roughness:0.5}));
  const readyMaterial=mat(new THREE.MeshBasicMaterial({color:'#ffe58b',transparent:true,opacity:0.7,blending:THREE.AdditiveBlending,depthWrite:false}));
  const progressBack=mat(new THREE.MeshBasicMaterial({color:'#6d827b'})),progressFill=mat(new THREE.MeshBasicMaterial({color:'#9affc6'}));
  const demonMaterials=new Map(Object.entries(DEMON_TYPES).map(([id,definition])=>[id,mat(new THREE.MeshStandardMaterial({color:definition.color||COLORS[0],roughness:0.55}))]));
  function mesh(shape,appearance,parent,x=0,y=0,z=0,sx=1,sy=1,sz=1){const object=new THREE.Mesh(shape,appearance);object.position.set(x,y,z);object.scale.set(sx,sy,sz);parent.add(object);return object;}
  function target(group,type,id){group.userData.target={type,id};}
  const clickable=[];const maps={eggs:new Map(),nests:new Map(),demons:new Map(),guards:new Map()};
  const dynamicRoot=new THREE.Group();dynamicRoot.userData.kind='dynamic';scene.add(dynamicRoot);
  scene.add(new THREE.HemisphereLight('#ffffff','#87a483',2.3));const sun=new THREE.DirectionalLight('#fff0da',2.2);sun.position.set(-24,55,22);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-45,right:45,top:45,bottom:-45,near:1,far:140});sun.shadow.camera.updateProjectionMatrix();scene.add(sun);
  const half=LOCATIONS.arenaHalf||32;
  const ground=mesh(box,mat(new THREE.MeshStandardMaterial({color:'#a3cdb0',roughness:1})),scene,0,-0.25,0,half*2,0.5,half*2);ground.receiveShadow=true;
  const grid=new THREE.GridHelper(half*2,32,'#90bfa2','#9bc7ab');grid.position.y=0.015;scene.add(grid);geometrySet.add(grid.geometry);(Array.isArray(grid.material)?grid.material:[grid.material]).forEach(value=>materialSet.add(value));
  const zone=LOCATIONS.protectedZone||{minX:-12,maxX:12,minZ:7,maxZ:30};
  const safe=mesh(box,mat(new THREE.MeshStandardMaterial({color:'#c8edcf',roughness:0.9})),scene,(zone.minX+zone.maxX)/2,0.025,(zone.minZ+zone.maxZ)/2,zone.maxX-zone.minX,0.05,zone.maxZ-zone.minZ);safe.userData.kind='safe-zone';safe.receiveShadow=true;
  const border=mat(new THREE.MeshStandardMaterial({color:'#72dbaa',emissive:'#4b9973',emissiveIntensity:0.25,roughness:0.5}));
  const boundary=new THREE.Group();scene.add(boundary);mesh(box,border,boundary,zone.minX,0.17,(zone.minZ+zone.maxZ)/2,0.12,0.24,zone.maxZ-zone.minZ);mesh(box,border,boundary,zone.maxX,0.17,(zone.minZ+zone.maxZ)/2,0.12,0.24,zone.maxZ-zone.minZ);mesh(box,border,boundary,0,0.17,zone.maxZ,zone.maxX-zone.minX,0.24,0.12);
  [-1,1].forEach(sign=>{mesh(box,border,boundary,sign*8,0.17,zone.minZ,8,0.24,0.12);mesh(cylinder,aqua,boundary,sign*3.5,1.8,zone.minZ,0.17,3.6,0.17);mesh(sphere,pink,boundary,sign*3.5,3.65,zone.minZ,0.4,0.4,0.4);});

  function sign(text,color,parent,x,y,z,width=3,height=1.2){
    const label=document.createElement('canvas');label.width=512;label.height=256;const ctx=label.getContext('2d');
    if(!ctx)return null;ctx.fillStyle=color;ctx.fillRect(0,0,512,256);ctx.fillStyle='#ffffff';ctx.font='900 92px system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,130);
    const texture=new THREE.CanvasTexture(label);texture.colorSpace=THREE.SRGBColorSpace;textureSet.add(texture);
    return mesh(signPlane,mat(new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide})),parent,x,y,z,width,height,1);
  }
  function createStall(type,id,position,color,text){
    const group=new THREE.Group();group.userData.kind=type;group.position.set(position.x,0,position.z);scene.add(group);target(group,type,id);clickable.push(group);
    mesh(box,wood,group,0,0.9,0,3.8,1.8,2.1);mesh(box,white,group,0,1.85,0,4.1,0.18,2.4);
    const roofMaterial=mat(new THREE.MeshStandardMaterial({color,roughness:0.6}));
    [-1,1].forEach(side=>[-1,1].forEach(end=>mesh(cylinder,wood,group,side*1.75,2.6,end*0.9,0.08,1.6,0.08)));
    const roof=mesh(cone,roofMaterial,group,0,3.6,0,3,0.55,2);roof.rotation.y=Math.PI/4;
    sign(text,color,group,0,2.9,1.16,3.1,0.95);mesh(box,hitMaterial,group,0,1.9,0,4.4,3.8,2.9);
    if(type==='sales'){mesh(torus,straw,group,0,1.95,0,0.65,0.65,0.65).rotation.x=Math.PI/2;mesh(sphere,pink,group,0,2.25,0,0.37,0.5,0.37);}
    else{[-1,0,1].forEach((x,index)=>mesh(star,mat(new THREE.MeshBasicMaterial({color:COLORS[index]})),group,x*0.6,2.1,0,0.23,0.33,0.23));}
    return group;
  }
  const shop=createStall('shop','shop',LOCATIONS.shop,'#a896dc','트레일');
  const sales=createStall('sales','sales',LOCATIONS.sales,'#f89bb1','판매');
  const treadmill=new THREE.Group();treadmill.userData.kind='treadmill';treadmill.position.set(LOCATIONS.treadmill.x,0,LOCATIONS.treadmill.z);scene.add(treadmill);target(treadmill,'treadmill','treadmill');clickable.push(treadmill);
  mesh(box,aqua,treadmill,0,0.23,0,3.6,0.46,4.8);mesh(box,dark,treadmill,0,0.5,0,2.8,0.09,4.2);const beltStripes=[];
  for(let index=0;index<9;index++)beltStripes.push(mesh(box,white,treadmill,0,0.56,-2+index*0.5,2.65,0.02,0.045));
  [-1,1].forEach(side=>{mesh(cylinder,aqua,treadmill,side*1.2,1.8,-1.6,0.1,2.8,0.1);mesh(box,aqua,treadmill,side*1.2,2.9,-0.85,0.16,0.15,1.8);});sign('훈련','#61b9c8',treadmill,0,2.8,-1.55,2.3,0.85);mesh(box,hitMaterial,treadmill,0,1.3,0,3.8,2.7,5);
  sign('안전한 내 기지','#77bf96',boundary,0,3.45,zone.minZ,5.9,0.95);
  sign('알 탐험 구역','#e59a8e',scene,0,3,-15,5.1,1.15);
  // Trees beyond the playable boundary keep target objects clear and readable.
  const foliage=mat(new THREE.MeshStandardMaterial({color:'#80b897',roughness:1}));
  [-1,1].forEach(side=>{for(let n=0;n<8;n++){const tree=new THREE.Group();tree.position.set(side*(half+2),0,-28+n*8);scene.add(tree);mesh(cylinder,wood,tree,0,1.5,0,0.4,3,0.4);mesh(sphere,foliage,tree,0,3.5,0,2.1,2.4,2.1);}});

  const player=new THREE.Group();player.userData.kind='player';scene.add(player);const body=new THREE.Group();player.add(body);
  mesh(sphere,aqua,body,0,1.25,0,0.8,1,0.62);mesh(sphere,aqua,body,0,2.15,0,0.72,0.68,0.61);
  [-1,1].forEach(side=>{mesh(sphere,white,body,side*0.28,2.25,0.51,0.21,0.25,0.09);mesh(sphere,eyes,body,side*0.28,2.23,0.6,0.08,0.11,0.05);mesh(sphere,pink,body,side*0.46,1.98,0.49,0.12,0.085,0.045);mesh(cone,pink,body,side*0.43,2.83,0,0.17,0.25,0.17).rotation.z=-side*0.4;mesh(sphere,aqua,body,side*0.78,1.45,0.18,0.2,0.45,0.2);mesh(sphere,dark,body,side*0.43,0.28,0,0.27,0.32,0.32);});
  mesh(sphere,white,body,0,1.22,0.57,0.48,0.55,0.09);mesh(sphere,eyes,body,0,1.93,0.59,0.09,0.035,0.035);
  player.traverse(node=>{if(node.isMesh)node.castShadow=true;});
  let carried=null,carriedId=null,disposed=false,lost=false,width=0,height=0,elapsed=0,previousPhase=null,lastState=null;
  const focus=new THREE.Vector3(),targetFocus=new THREE.Vector3(),desiredCamera=new THREE.Vector3(),direction=new THREE.Vector3(0,0.84,0.54).normalize(),transform=new THREE.Object3D();
  const particleCount=reducedMotion?40:160;const particles=Array.from({length:particleCount},()=>({life:0,maxLife:1,x:0,y:0,z:0,vx:0,vy:0,vz:0,color:new THREE.Color()}));let particleCursor=0,trailTime=0;
  const particleMesh=new THREE.InstancedMesh(star,glow,particleCount);particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);particleMesh.frustumCulled=false;scene.add(particleMesh);

  function createEgg(egg){
    const group=new THREE.Group();group.userData.kind='egg';group.userData.id=egg.id;const appearance=mat(new THREE.MeshStandardMaterial({color:egg.color||COLORS[0],roughness:0.32,metalness:0.05}));
    mesh(sphere,appearance,group,0,0.95,0,0.63,0.88,0.63);[-1,1].forEach(side=>{mesh(sphere,eggDot,group,side*0.3,1.2,0.48,0.13,0.17,0.045);mesh(sphere,eggDot,group,side*0.23,0.67,0.48,0.1,0.11,0.04);});
    group.traverse(node=>{if(node.isMesh)node.castShadow=true;});return{group,appearance};
  }
  function disposeEgg(visual){if(!visual)return;visual.appearance.dispose();materialSet.delete(visual.appearance);}
  function release(entry){dynamicRoot.remove(entry.group);if(entry.progressGroup)dynamicRoot.remove(entry.progressGroup);if(entry.egg)disposeEgg(entry.egg);if(entry.appearance)disposeEgg(entry);const index=clickable.indexOf(entry.group);if(index>=0)clickable.splice(index,1);}
  function sync(map,items,create,update,visible=()=>true){const ids=new Set();for(const item of items||[]){if(!visible(item))continue;ids.add(item.id);let entry=map.get(item.id);if(!entry){entry=create(item);dynamicRoot.add(entry.group);if(entry.progressGroup)dynamicRoot.add(entry.progressGroup);map.set(item.id,entry);}update(entry,item);}for(const[id,entry]of map)if(!ids.has(id)){release(entry);map.delete(id);}}
  function createNest(nest){
    const group=new THREE.Group();group.userData.kind='nest';target(group,'nest',nest.id);clickable.push(group);
    mesh(cylinder,straw,group,0,0.1,0,1.3,0.18,1.3);const rim=mesh(torus,straw,group,0,0.26,0,1.35,1.35,1.2);rim.rotation.x=Math.PI/2;
    const ring=mesh(torus,readyMaterial,group,0,0.07,0,1.7,1.7,0.25);ring.rotation.x=Math.PI/2;ring.visible=false;
    mesh(cylinder,hitMaterial,group,0,0.8,0,1.7,1.6,1.7);
    const progressGroup=new THREE.Group();progressGroup.userData.kind='nest-progress';mesh(box,progressBack,progressGroup,0,0,0,2.5,0.18,0.08);const fill=mesh(box,progressFill,progressGroup,0,0,0.04,2.35,0.1,0.08);
    return{group,ring,progressGroup,fill,egg:null,eggId:null};
  }
  function updateNest(entry,nest,phase){
    entry.group.position.set(nest.x,0,nest.z);entry.progressGroup.position.set(nest.x,2.65,nest.z);entry.progressGroup.quaternion.copy(camera.quaternion);entry.progressGroup.visible=!!nest.egg;
    if(entry.eggId!==nest.egg?.id){if(entry.egg){entry.group.remove(entry.egg.group);disposeEgg(entry.egg);}entry.egg=nest.egg?createEgg(nest.egg):null;entry.eggId=nest.egg?.id;if(entry.egg){entry.egg.group.position.y=0.22;entry.group.add(entry.egg.group);}}
    const ratio=nest.egg?Math.max(0,Math.min(1,1-(nest.egg.remaining||0)/Math.max(1,nest.egg.duration||60))):0;
    entry.fill.scale.x=2.35*ratio;entry.fill.position.x=-2.35*(1-ratio)/2;entry.ring.visible=!!nest.egg?.ready;
    if(entry.egg&&phase!=='paused')entry.egg.group.rotation.z=nest.egg.ready&&!reducedMotion?Math.sin(elapsed*5)*0.08:0;
  }
  function createDemon(demon){
    const group=new THREE.Group();group.userData.kind='demon';group.userData.species=demon.species;const appearance=demonMaterials.get(demon.species)||pink;
    mesh(sphere,appearance,group,0,0.8,0,0.6,0.75,0.53);
    [-1,1].forEach(side=>{mesh(sphere,white,group,side*0.2,1.02,0.43,0.13,0.16,0.06);mesh(sphere,eyes,group,side*0.2,1,0.48,0.055,0.078,0.025);mesh(sphere,appearance,group,side*0.28,0.19,0.12,0.24,0.18,0.25);const horn=mesh(cone,straw,group,side*0.32,1.52,-0.05,0.12,0.26,0.12);horn.rotation.z=-side*0.3;
      if(demon.species==='bat'||demon.species==='dragon')mesh(sphere,appearance,group,side*0.73,0.95,-0.15,0.45,0.28,0.1);
      if(demon.species==='fox')mesh(cone,appearance,group,side*0.34,1.52,0,0.23,0.4,0.15);
    });
    if(demon.species==='leaf')mesh(cone,foliage,group,0,1.7,0,0.25,0.38,0.2).rotation.z=0.35;
    if(demon.species==='spark')mesh(star,straw,group,0,1.68,0,0.19,0.32,0.19);
    if(demon.species==='dragon')mesh(cone,appearance,group,0,0.55,-0.68,0.2,0.5,0.2).rotation.x=Math.PI/2;
    group.traverse(node=>{if(node.isMesh)node.castShadow=true;});return{group};
  }
  function createGuard(guard){const group=new THREE.Group();group.userData.kind='guard';mesh(sphere,dark,group,0,1.05,0,0.8,1.05,0.7);mesh(sphere,aqua,group,0,2,0,0.72,0.6,0.6);mesh(cylinder,dark,group,0,2.6,0,0.9,0.2,0.7);[-1,1].forEach(side=>{mesh(sphere,white,group,side*0.24,2.1,0.5,0.2,0.21,0.08);mesh(sphere,eyes,group,side*0.24,2.09,0.58,0.07,0.09,0.035);mesh(sphere,dark,group,side*0.4,0.2,0,0.3,0.28,0.33);});mesh(box,straw,group,0,1.3,0.69,0.32,0.36,0.05);return{group};}
  function burst(x,z,color,big=false){const amount=reducedMotion?(big?5:1):(big?24:2);for(let n=0;n<amount;n++){const particle=particles[particleCursor++%particleCount];const angle=n/amount*Math.PI*2;Object.assign(particle,{life:big?0.9:0.55,maxLife:big?0.9:0.55,x,y:big?1.4:0.25,z,vx:Math.cos(angle)*(big?3:0.3),vy:big?3:0.8,vz:Math.sin(angle)*(big?3:0.3)});particle.color.set(color||COLORS[n%COLORS.length]);}}
  function updateParticles(dt){particles.forEach((particle,index)=>{particle.life=Math.max(0,particle.life-dt);if(particle.life>0){particle.x+=particle.vx*dt;particle.y+=particle.vy*dt;particle.z+=particle.vz*dt;particle.vy-=dt*3;transform.position.set(particle.x,Math.max(0.1,particle.y),particle.z);transform.rotation.set(elapsed+index,0,elapsed*2);transform.scale.setScalar((particle.life/particle.maxLife)*0.15);}else transform.scale.setScalar(0);transform.updateMatrix();particleMesh.setMatrixAt(index,transform.matrix);particleMesh.setColorAt(index,particle.color);});particleMesh.instanceMatrix.needsUpdate=true;particleMesh.instanceColor.needsUpdate=true;}
  function resize(){if(disposed||lost)return;const bounds=container.getBoundingClientRect(),w=Math.max(1,Math.floor(bounds.width||container.clientWidth||1)),h=Math.max(1,Math.floor(bounds.height||container.clientHeight||1));if(w===width&&h===height)return;width=w;height=h;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  function hitTest(clientX,clientY){if(disposed||lost)return null;resize();const bounds=canvas.getBoundingClientRect();if(!bounds.width||!bounds.height)return null;pointer.set((clientX-bounds.left)/bounds.width*2-1,-(clientY-bounds.top)/bounds.height*2+1);scene.updateMatrixWorld(true);raycaster.setFromCamera(pointer,camera);for(const hit of raycaster.intersectObjects(clickable,true)){let object=hit.object;while(object){if(object.userData.target)return {...object.userData.target};object=object.parent;}}return null;}
  function render(state,events=[],dt=0){
    if(disposed||lost||!state)return;resize();dt=Math.max(0,Math.min(Number.isFinite(dt)?dt:0,0.05));if(state.phase==='paused')dt=0;elapsed+=dt;
    if(state.phase==='intro'&&previousPhase!=='intro'){particles.forEach(p=>{p.life=0;});trailTime=0;}
    const p=state.player||{x:0,z:18,yaw:0};player.position.set(p.x,0,p.z);player.rotation.y=p.yaw||0;
    if(state.phase!=='paused')body.position.y=reducedMotion?0:Math.sin(elapsed*5)*0.025;
    if(carriedId!==state.carrying?.id){if(carried){player.remove(carried.group);disposeEgg(carried);}carried=state.carrying?createEgg(state.carrying):null;carriedId=state.carrying?.id;if(carried){carried.group.position.set(0,0.7,0.86);carried.group.scale.setScalar(0.75);player.add(carried.group);}}
    targetFocus.set(Math.max(-half+9,Math.min(half-9,p.x)),0,Math.max(-half+9,Math.min(half-9,p.z)));
    const distance=Math.max(48,39/camera.aspect);desiredCamera.copy(direction).multiplyScalar(distance).add(targetFocus);
    if(state.phase!=='paused'||!lastState){if(!lastState||dt===0){focus.copy(targetFocus);camera.position.copy(desiredCamera);}else{focus.lerp(targetFocus,Math.min(1,dt*6));camera.position.lerp(desiredCamera,Math.min(1,dt*6));}}
    camera.lookAt(focus);camera.updateMatrixWorld();
    sync(maps.eggs,state.wildEggs,egg=>{const entry=createEgg(egg);target(entry.group,'egg',egg.id);clickable.push(entry.group);return entry;},(entry,egg)=>{entry.group.position.x=egg.x;entry.group.position.z=egg.z;if(state.phase!=='paused')entry.group.position.y=reducedMotion?0.1:0.1+Math.sin(elapsed*2+egg.x)*0.08;});
    sync(maps.nests,state.nests,createNest,(entry,nest)=>updateNest(entry,nest,state.phase));
    sync(maps.demons,state.demons,createDemon,(entry,demon)=>{entry.group.position.x=demon.x;entry.group.position.z=demon.z;if(state.phase!=='paused')entry.group.position.y=reducedMotion?0:Math.abs(Math.sin(elapsed*4+demon.x))*0.06;entry.group.rotation.y=Math.atan2(p.x-demon.x,p.z-demon.z);});
    sync(maps.guards,state.guards,createGuard,(entry,guard)=>{entry.group.position.set(guard.x,0,guard.z);entry.group.rotation.y=guard.yaw||0;});
    const training=state.phase==='playing'&&Math.hypot(p.x-LOCATIONS.treadmill.x,p.z-LOCATIONS.treadmill.z)<3;
    if(state.phase!=='paused')beltStripes.forEach((stripe,index)=>{stripe.position.z=training?-2+((index*0.5+elapsed*2)%4.5):-2+index*0.5;});
    if(state.phase==='playing'&&state.trailId&&state.trailId!=='none'&&!reducedMotion){trailTime+=dt;if(trailTime>0.09){trailTime=0;const trail=TRAILS[state.trailId];burst(p.x-Math.sin(p.yaw||0),p.z-Math.cos(p.yaw||0),state.trailId==='rainbow'?COLORS[Math.floor(elapsed*8)%COLORS.length]:trail?.color);}}
    for(const event of events||[])burst(Number.isFinite(event.x)?event.x:p.x,Number.isFinite(event.z)?event.z:p.z,event.color||COLORS[0],true);
    updateParticles(dt);renderer.render(scene,camera);previousPhase=state.phase;lastState=state;
  }
  function onLost(event){event.preventDefault();lost=true;container.dispatchEvent(new CustomEvent('myegg:render-error',{bubbles:true,detail:{message:'3D 화면 연결이 끊겼습니다. 화면 복구 버튼을 눌러 이어서 플레이하세요.'}}));}
  canvas.addEventListener('webglcontextlost',onLost);
  function dispose(){if(disposed)return;disposed=true;canvas.removeEventListener('webglcontextlost',onLost);Object.values(maps).forEach(map=>{map.forEach(release);map.clear();});disposeEgg(carried);particleMesh.dispose();geometrySet.forEach(value=>value.dispose());materialSet.forEach(value=>value.dispose());textureSet.forEach(value=>value.dispose());renderer.dispose();canvas.remove();}
  resize();camera.position.set(0,40,50);camera.lookAt(0,0,18);camera.updateMatrixWorld();updateParticles(0);
  return{canvas,render,resize,hitTest,dispose};
}
