import * as THREE from '../minecraft/libs/three.module.js';
import { MAPS, sampleTrack } from './engine.js';

const RAINBOW = ['#ff82af','#ffb267','#ffe680','#82e1b1','#7ac6ff','#b592ff'];
const THEMES = {
  forest: { sky:'#a8dfe0', fog:'#b8e5df', road:'#f6d6b9', edge:'#fff1b1', ground:'#88bc87', sun:'#fff2d8' },
  cloud: { sky:'#abcff5', fog:'#cbdfff', road:'#e8dffb', edge:'#ffb6e9', ground:'#c4e2ff', sun:'#ffffff' },
  star: { sky:'#111531', fog:'#242744', road:'#655d9c', edge:'#d6b3ff', ground:'#252841', sun:'#dce0ff' }
};

export function createRenderer(container, { reducedMotion = false } = {}) {
  const renderer = new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,2));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const canvas=renderer.domElement;
  canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Unicorn Runs 3D 유니콘과 입체 레이스 트랙');
  Object.assign(canvas.style,{width:'100%',height:'100%',display:'block',touchAction:'none'});
  container.appendChild(canvas);
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(60,1,0.1,650);
  const geometries=new Set(),materials=new Set();
  const geo=value=>{geometries.add(value);return value;};
  const mat=value=>{materials.add(value);return value;};
  const sphere=geo(new THREE.SphereGeometry(1,14,10));
  const cylinder=geo(new THREE.CylinderGeometry(1,1,1,12));
  const cone=geo(new THREE.ConeGeometry(1,2,16));
  const box=geo(new THREE.BoxGeometry(1,1,1));
  const sparkleShape=geo(new THREE.IcosahedronGeometry(1,0));
  const fur=mat(new THREE.MeshStandardMaterial({color:'#fff7fd',roughness:0.4,metalness:0.03}));
  const muzzleMaterial=mat(new THREE.MeshStandardMaterial({color:'#f7dfe9',roughness:0.55}));
  const gold=mat(new THREE.MeshStandardMaterial({color:'#ffe9a8',emissive:'#a27f22',emissiveIntensity:0.25,metalness:0.6,roughness:0.23}));
  const eyeMaterial=mat(new THREE.MeshBasicMaterial({color:'#293248'}));
  const eyeShine=mat(new THREE.MeshBasicMaterial({color:'#ffffff'}));
  const rainbowMaterials=RAINBOW.map(color=>mat(new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:0.12,roughness:0.5})));
  const glowMaterial=mat(new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:0.5,blending:THREE.AdditiveBlending,depthWrite:false}));
  const hemi=new THREE.HemisphereLight('#ffffff','#7c9aa2',2);scene.add(hemi);
  const sun=new THREE.DirectionalLight('#fff7e7',2.3);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
  Object.assign(sun.shadow.camera,{left:-30,right:30,top:30,bottom:-30,near:1,far:100});sun.shadow.camera.updateProjectionMatrix();scene.add(sun);scene.add(sun.target);

  function mesh(shape,appearance,parent,x=0,y=0,z=0,sx=1,sy=1,sz=1){
    const node=new THREE.Mesh(shape,appearance);node.position.set(x,y,z);node.scale.set(sx,sy,sz);parent.add(node);return node;
  }
  const unicorn=new THREE.Group();unicorn.userData.kind='unicorn';scene.add(unicorn);
  // Model construction uses local +Z as forward, matching engine yaw atan2(dx,dz).
  const body=new THREE.Group();body.userData.kind="body";unicorn.add(body);
  mesh(sphere,fur,body,0,1.7,0,0.83,0.88,1.45);
  mesh(sphere,fur,body,0,2.15,0.95,0.6,1.05,0.6).rotation.x=0.24;
  const head=new THREE.Group();head.userData.kind="head";head.position.set(0,2.72,1.25);body.add(head);
  mesh(sphere,fur,head,0,0,0,0.59,0.63,0.68);
  mesh(sphere,muzzleMaterial,head,0,-0.24,0.58,0.5,0.4,0.62);
  const horn=mesh(cone,gold,head,0,0.76,0.15,0.14,0.55,0.14);horn.rotation.x=0.18;
  [-1,1].forEach(sign=>{
    const ear=mesh(cone,fur,head,sign*0.37,0.62,-0.1,0.17,0.3,0.12);ear.rotation.z=-sign*0.25;
    mesh(sphere,eyeMaterial,head,sign*0.48,0.05,0.28,0.1,0.14,0.1);
    mesh(sphere,eyeShine,head,sign*0.53,0.085,0.32,0.033,0.045,0.033);
    mesh(sphere,muzzleMaterial,head,sign*0.45,-0.19,0.25,0.12,0.09,0.07);
    mesh(sphere,eyeMaterial,head,sign*0.17,-0.12,1.06,0.04,0.055,0.022);
  });
  const legs=[];
  [-1,1].forEach(sign=>[-1,1].forEach(end=>{
    const leg=new THREE.Group();leg.userData.kind="leg";leg.position.set(sign*0.55,1.3,end*0.86);body.add(leg);
    mesh(cylinder,fur,leg,0,-0.45,0,0.18,0.95,0.18);
    mesh(sphere,fur,leg,0,-0.77,0,0.21,0.22,0.2);
    mesh(cylinder,gold,leg,0,-1.05,0.05,0.22,0.23,0.25);
    legs.push({node:leg,phase:(end>0?0:Math.PI)+sign*0.2,end});
  }));
  const mane=new THREE.Group();body.add(mane);
  rainbowMaterials.forEach((appearance,index)=>{
    const offset=index-2.5;
    mesh(sphere,appearance,mane,offset*0.055,2.98-index*0.13,0.72-index*0.12,0.16,0.27,0.27);
    mesh(sphere,appearance,mane,0,2.4-index*0.12,0.29-index*0.1,0.24,0.28,0.3);
  });
  const tail=new THREE.Group();tail.userData.kind="tail";tail.position.set(0,1.95,-1.2);body.add(tail);
  rainbowMaterials.forEach((appearance,index)=>{
    const x=(index-2.5)*0.075;
    const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(x,0,0),new THREE.Vector3(x,0.18,-0.65),new THREE.Vector3(x,-0.1,-1.3),new THREE.Vector3(x,-0.7,-1.65)]);
    mesh(geo(new THREE.TubeGeometry(curve,16,0.09,6,false)),appearance,tail);
  });
  unicorn.traverse(node=>{if(node.isMesh)node.castShadow=true;});

  let mapRoot=null,mapResources=null,currentMap=null,disposed=false,lost=false;
  let width=0,height=0,elapsed=0,gallop=0,finished=false,lastState=null;
  const cameraTarget=new THREE.Vector3(),cameraDestination=new THREE.Vector3(),focus=new THREE.Vector3();
  const transform=new THREE.Object3D();
  const particleCapacity=reducedMotion?40:150;
  const particles=Array.from({length:particleCapacity},()=>({life:0,maxLife:1,x:0,y:0,z:0,vx:0,vy:0,vz:0,color:new THREE.Color()}));
  let particleCursor=0,trailAccumulator=0;
  const particleMesh=new THREE.InstancedMesh(sparkleShape,glowMaterial,particleCapacity);
  particleMesh.frustumCulled=false;particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(particleMesh);

  function releaseMap(){
    if(!mapRoot)return;
    mapRoot.traverse(node=>{if(node.isInstancedMesh)node.dispose();});
    mapResources.geometries.forEach(value=>value.dispose());mapResources.materials.forEach(value=>value.dispose());
    scene.remove(mapRoot);mapRoot=null;mapResources=null;
  }
  function createMap(mapId){
    releaseMap();
    const map=MAPS.find(item=>item.id===mapId)||MAPS[0];const theme=THEMES[map.id]||THEMES.forest;
    mapRoot=new THREE.Group();mapRoot.userData.kind='map';mapRoot.userData.mapId=map.id;scene.add(mapRoot);
    mapResources={geometries:new Set(),materials:new Set()};
    const mg=value=>{mapResources.geometries.add(value);return value;};
    const mm=value=>{mapResources.materials.add(value);return value;};
    const mapBox=mg(new THREE.BoxGeometry(1,1,1));const mapSphere=mg(new THREE.SphereGeometry(1,9,7));
    const mapCone=mg(new THREE.ConeGeometry(1,2,7));
    scene.background=new THREE.Color(theme.sky);scene.fog=new THREE.Fog(theme.fog,55,map.id==='star'?220:165);
    sun.color.set(theme.sun);sun.intensity=map.id==='star'?1.8:2.3;hemi.color.set(map.id==='star'?'#bcc6ff':'#ffffff');
    const vertices=[],indices=[],colors=[],edgeLeft=[],edgeRight=[],centers=[];
    const segments=384;const half=map.width/2;
    const roadColor=new THREE.Color(theme.road),stripeColor=new THREE.Color(theme.road).lerp(new THREE.Color('#ffffff'),0.16);
    for(let index=0;index<=segments;index++){
      const point=sampleTrack(map.id,index/segments);const normalX=Math.cos(point.yaw),normalZ=-Math.sin(point.yaw);
      const left=new THREE.Vector3(point.x-normalX*half,0.02,point.z-normalZ*half);
      const right=new THREE.Vector3(point.x+normalX*half,0.02,point.z+normalZ*half);
      edgeLeft.push(left);edgeRight.push(right);centers.push(point);
      vertices.push(left.x,left.y,left.z,right.x,right.y,right.z);
      const c=Math.floor(index/6)%2?roadColor:stripeColor;colors.push(c.r,c.g,c.b,c.r,c.g,c.b);
      if(index<segments){const n=index*2;indices.push(n,n+2,n+1,n+1,n+2,n+3);}
    }
    const ribbon=mg(new THREE.BufferGeometry());ribbon.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));ribbon.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));ribbon.setIndex(indices);ribbon.computeVertexNormals();
    const road=mesh(ribbon,mm(new THREE.MeshStandardMaterial({vertexColors:true,roughness:map.id==='star'?0.45:0.75,metalness:map.id==='star'?0.25:0.03,side:THREE.DoubleSide})),mapRoot);road.receiveShadow=true;road.userData.kind='track';
    const edgeMaterial=mm(new THREE.MeshStandardMaterial({color:theme.edge,emissive:theme.edge,emissiveIntensity:map.id==='star'?0.85:0.25,roughness:0.4}));
    [edgeLeft,edgeRight].forEach(points=>{points.forEach(point=>point.y=0.18);mesh(mg(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),384,0.13,6,false)),edgeMaterial,mapRoot);});
    const bounds=new THREE.Box3().setFromBufferAttribute(ribbon.attributes.position);const size=bounds.getSize(new THREE.Vector3());const center=bounds.getCenter(new THREE.Vector3());
    if(map.id==='forest')mesh(mg(new THREE.PlaneGeometry(size.x+180,size.z+180)),mm(new THREE.MeshStandardMaterial({color:theme.ground,roughness:1})),mapRoot,center.x,-0.22,center.z).rotation.x=-Math.PI/2;
    else if(map.id==='star')mesh(mg(new THREE.PlaneGeometry(size.x+260,size.z+260)),mm(new THREE.MeshStandardMaterial({color:theme.ground,roughness:0.85,metalness:0.3})),mapRoot,center.x,-4,center.z).rotation.x=-Math.PI/2;
    const finishPoint=sampleTrack(map.id,0);
    const finish=new THREE.Group();finish.userData.kind='finish';finish.position.set(finishPoint.x,0.05,finishPoint.z);finish.rotation.y=finishPoint.yaw;mapRoot.add(finish);
    const white=mm(new THREE.MeshBasicMaterial({color:'#fffaf2'})),dark=mm(new THREE.MeshBasicMaterial({color:'#40385a'}));
    for(let row=0;row<2;row++)for(let column=0;column<10;column++)mesh(mapBox,(row+column)%2?white:dark,finish,(column-4.5)*map.width/10,0,row*0.65-0.32,map.width/10,0.055,0.64);
    const gates=new THREE.Group();gates.userData.kind='gates';mapRoot.add(gates);
    [0,0.25,0.5,0.75].forEach((progress,index)=>{
      const point=sampleTrack(map.id,progress);const gate=new THREE.Group();gate.position.set(point.x,0,point.z);gate.rotation.y=point.yaw;gates.add(gate);
      [-1,1].forEach(sign=>mesh(mapBox,edgeMaterial,gate,sign*(half+0.65),2.8,0,0.45,5.6,0.55));
      mesh(mapBox,edgeMaterial,gate,0,5.6,0,map.width+1.8,0.45,0.6);
      mesh(mapBox,index===0?white:dark,gate,0,5.58,0.36,map.width*0.55,0.85,0.09);
      rainbowMaterials.forEach((_,n)=>mesh(mapBox,mm(new THREE.MeshBasicMaterial({color:RAINBOW[n]})),gate,(n-2.5)*map.width/12,5.57,0.43,map.width/12,0.55,0.05));
    });
    function batch(shape,appearance,count){const object=new THREE.InstancedMesh(shape,appearance,count);mapRoot.add(object);return object;}
    const count=120;
    if(map.id==='forest'){
      const trunks=batch(mapBox,mm(new THREE.MeshStandardMaterial({color:'#8b6955',roughness:1})),count);
      const crowns=batch(mapCone,mm(new THREE.MeshStandardMaterial({color:'#52916f',roughness:0.9})),count);
      for(let index=0;index<count;index++){
        const point=sampleTrack(map.id,index/count);const side=index%2?1:-1;const offset=half+8+(index%7)*2.5;
        const x=point.x+Math.cos(point.yaw)*side*offset,z=point.z-Math.sin(point.yaw)*side*offset;
        transform.position.set(x,1.4,z);transform.rotation.set(0,index,0);transform.scale.set(0.7,2.8,0.7);transform.updateMatrix();trunks.setMatrixAt(index,transform.matrix);
        transform.position.y=4.2;transform.scale.set(2.5+(index%3)*0.4,2.8,2.5);transform.updateMatrix();crowns.setMatrixAt(index,transform.matrix);
      }
      trunks.castShadow=crowns.castShadow=true;
    }else if(map.id==='cloud'){
      const clouds=batch(mapSphere,mm(new THREE.MeshStandardMaterial({color:'#f9f6ff',roughness:1})),count*3);
      for(let index=0;index<count;index++){
        const point=sampleTrack(map.id,index/count);const side=index%2?1:-1;const offset=half+8+(index%7)*3;
        for(let puff=0;puff<3;puff++){
          transform.position.set(point.x+Math.cos(point.yaw)*side*offset+(puff-1)*2.2,-2-(index%4)*2,point.z-Math.sin(point.yaw)*side*offset);
          transform.rotation.set(0,0,0);transform.scale.set(3.7,1.8+(puff%2),2.8);transform.updateMatrix();clouds.setMatrixAt(index*3+puff,transform.matrix);
        }
      }
    }else{
      const stars=batch(mg(new THREE.OctahedronGeometry(1,0)),mm(new THREE.MeshBasicMaterial({color:'#ffe3a7'})),count*2);
      for(let index=0;index<count*2;index++){
        const point=sampleTrack(map.id,index/(count*2));const side=index%2?1:-1;const offset=half+12+(index%11)*4;
        transform.position.set(point.x+Math.cos(point.yaw)*side*offset,4+(index%13)*2,point.z-Math.sin(point.yaw)*side*offset);
        transform.rotation.set(index,0,index*0.7);transform.scale.setScalar(0.28+(index%4)*0.15);transform.updateMatrix();stars.setMatrixAt(index,transform.matrix);
      }
    }
    currentMap=map.id;particles.forEach(particle=>{particle.life=0;});finished=false;gallop=0;trailAccumulator=0;
  }
  function sparkle(x,z,big=false,color=null){
    const count=reducedMotion?(big?5:1):(big?28:3);
    for(let n=0;n<count;n++){
      const particle=particles[particleCursor++%particleCapacity];const angle=n/count*Math.PI*2;
      Object.assign(particle,{life:big?1:0.6,maxLife:big?1:0.6,x,y:big?2:0.55,z,vx:Math.cos(angle)*(big?4:0.5),vy:big?3+Math.random()*4:1+Math.random(),vz:Math.sin(angle)*(big?4:0.5)});
      particle.color.set(color||RAINBOW[n%RAINBOW.length]);
    }
  }
  function updateParticles(dt){
    particles.forEach((particle,index)=>{
      particle.life=Math.max(0,particle.life-dt);
      if(particle.life>0){particle.x+=particle.vx*dt;particle.y+=particle.vy*dt;particle.z+=particle.vz*dt;particle.vy-=dt*3;transform.position.set(particle.x,Math.max(0.12,particle.y),particle.z);transform.rotation.set(elapsed+index,elapsed*2,0);transform.scale.setScalar((particle.life/particle.maxLife)*0.13);}else transform.scale.setScalar(0);
      transform.updateMatrix();particleMesh.setMatrixAt(index,transform.matrix);particleMesh.setColorAt(index,particle.color);
    });particleMesh.instanceMatrix.needsUpdate=true;particleMesh.instanceColor.needsUpdate=true;
  }
  function resize(){
    if(disposed||lost)return;const bounds=container.getBoundingClientRect();const w=Math.max(1,Math.floor(bounds.width||container.clientWidth||1)),h=Math.max(1,Math.floor(bounds.height||container.clientHeight||1));
    if(w===width&&h===height)return;width=w;height=h;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
  }
  function render(state,events=[],dt=0){
    if(disposed||lost||!state)return;resize();dt=Math.max(0,Math.min(Number.isFinite(dt)?dt:0,0.05));if(state.phase==="paused")dt=0;elapsed+=dt;
    const map=MAPS.find(item=>item.id===state.mapId)||MAPS[0];if(currentMap!==map.id)createMap(map.id);
    if(lastState&&['select','countdown'].includes(state.phase)&&!['select','countdown'].includes(lastState.phase)){
      particles.forEach(particle=>{particle.life=0;});finished=false;gallop=0;trailAccumulator=0;
    }
    const player=state.player||{...sampleTrack(map.id,0),speed:0,progress:0};
    const active=state.phase==='racing';const speed=Math.max(0,player.speed||0);
    unicorn.position.set(player.x,0,player.z);unicorn.rotation.y=player.yaw||0;
    if(active){gallop+=dt*(4+speed*0.55);}else gallop+=dt*1.5;
    const amplitude=active?Math.min(0.65,speed*0.018)*(reducedMotion?0.25:1):0;
    if(state.phase!=="paused")legs.forEach(leg=>{leg.node.rotation.x=Math.sin(gallop+leg.phase)*amplitude;});
    if(state.phase!=="paused") {
    body.position.y=reducedMotion?0:active?Math.abs(Math.sin(gallop*2))*Math.min(0.14,speed*0.004):Math.sin(elapsed*1.4)*0.025;
    head.rotation.x=reducedMotion?0:active?Math.sin(gallop)*0.04:0;
    tail.rotation.y=reducedMotion?0:Math.sin(elapsed*3)*0.13;
    }
    const forwardX=Math.sin(player.yaw||0),forwardZ=Math.cos(player.yaw||0);
    cameraDestination.set(player.x-forwardX*(camera.aspect<0.8?17:14),8.5,player.z-forwardZ*(camera.aspect<0.8?17:14));
    const ahead=sampleTrack(map.id,(player.progress||0)+0.025);
    cameraTarget.set(ahead.x,1.7,ahead.z);
    if(state.phase!=="paused"||lastState===null||lastState.mapId!==state.mapId){
      if(lastState===null||lastState.mapId!==state.mapId||dt===0){camera.position.copy(cameraDestination);focus.copy(cameraTarget);}else{camera.position.lerp(cameraDestination,Math.min(1,dt*6));focus.lerp(cameraTarget,Math.min(1,dt*6));}
    }
    camera.lookAt(focus);camera.updateMatrixWorld();
    sun.position.set(player.x-12,24,player.z+12);sun.target.position.set(player.x,0,player.z);sun.target.updateMatrixWorld();
    if(active&&!reducedMotion){trailAccumulator+=dt;if(trailAccumulator>0.08){trailAccumulator=0;sparkle(player.x-forwardX*1.3,player.z-forwardZ*1.3);}}
    for(const event of events||[]){const type=event.type||'';if(/lap|finish|win|complete|countdown|start|boost/i.test(type))sparkle(Number.isFinite(event.x)?event.x:player.x,Number.isFinite(event.z)?event.z:player.z,true,event.color);}
    if(state.phase==='finished'&&!finished){sparkle(player.x,player.z,true);finished=true;}if(state.phase!=='finished')finished=false;
    updateParticles(dt);renderer.render(scene,camera);lastState={mapId:state.mapId,phase:state.phase};
  }
  function onLost(event){event.preventDefault();lost=true;container.dispatchEvent(new CustomEvent('unicornruns:render-error',{bubbles:true,detail:{message:'3D 화면 연결이 끊겼습니다. 화면 복구 버튼을 눌러 레이스를 이어가세요.'}}));}
  canvas.addEventListener('webglcontextlost',onLost);
  function dispose(){if(disposed)return;disposed=true;canvas.removeEventListener('webglcontextlost',onLost);releaseMap();particleMesh.dispose();geometries.forEach(value=>value.dispose());materials.forEach(value=>value.dispose());renderer.dispose();canvas.remove();}
  resize();updateParticles(0);
  return {canvas,render,resize,dispose};
}
