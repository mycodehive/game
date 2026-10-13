import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
// Use actual engine track sampling and bundled Three geometry/camera math.
const threeSource=await readFile(new URL('../minecraft/libs/three.module.js',import.meta.url),'utf8');
const THREE=await import(`data:text/javascript;base64,${Buffer.from(threeSource).toString('base64')}`);
const engineSource=await readFile(new URL('./engine.js',import.meta.url),'utf8');
const {MAPS,sampleTrack,createGame}=await import(`data:text/javascript;base64,${Buffer.from(engineSource).toString('base64')}`);
const source=await readFile(new URL('./render3d.js',import.meta.url),'utf8');
class Element{
  constructor(){this.style={};this.children=[];this.listeners=new Map();this.events=[];this.bounds={width:500,height:700};}
  appendChild(child){child.parent=this;this.children.push(child);}
  setAttribute(){}
  getBoundingClientRect(){return this.parent?.bounds||this.bounds;}
  addEventListener(name,handler){this.listeners.set(name,handler);}
  removeEventListener(name){this.listeners.delete(name);}
  dispatchEvent(event){this.events.push(event);}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);}
}
const renderers=[];
class Renderer{
  constructor(){this.domElement=new Element();this.shadowMap={};this.disposed=0;this.count=0;renderers.push(this);}
  setPixelRatio(){}
  setSize(w,h){this.width=w;this.height=h;}
  render(scene,camera){this.scene=scene;this.camera=camera;this.count++;}
  dispose(){this.disposed++;}
}
class CustomEventAdapter{constructor(type,options){this.type=type;Object.assign(this,options);}}
const executable=source.replace(/^import .*?;\n/gm,'').replace('export function createRenderer','function createRenderer')+'\nglobalThis.createRenderer=createRenderer;';
const context=vm.createContext({MAPS,sampleTrack,THREE:{...THREE,WebGLRenderer:Renderer},CustomEvent:CustomEventAdapter});vm.runInContext(executable,context);
const container=new Element();const view=context.createRenderer(container);const gpu=renderers[0];const game=createGame();
view.render(game.state,[],0);
const unicorn=gpu.scene.children.find(node=>node.userData.kind==='unicorn');
const body=unicorn.children.find(node=>node.userData.kind==='body');
const head=body.children.find(node=>node.userData.kind==='head');
const tail=body.children.find(node=>node.userData.kind==='tail');
const legs=body.children.filter(node=>node.userData.kind==='leg');
assert.equal(legs.length,4);assert.equal(tail.children.length,6,'six real rainbow tail tubes');assert.ok(head.children.some(node=>node.geometry?.type==='ConeGeometry'&&node.material.metalness>0.5),'golden horn is a real cone');
assert.ok(body.children.filter(node=>node.isMesh).length>=2);
let mapRoot=gpu.scene.children.find(node=>node.userData.kind==='map');
function assertTrack(root,map){
  const track=root.children.find(node=>node.userData.kind==='track');
  assert.equal(track.geometry.attributes.position.count,770);
  const positions=track.geometry.attributes.position;
  for(const index of [0,64,128,200,384]){
    const center=sampleTrack(map.id,index/384);
    const a=new THREE.Vector3().fromBufferAttribute(positions,index*2),b=new THREE.Vector3().fromBufferAttribute(positions,index*2+1);
    const midpoint=a.clone().add(b).multiplyScalar(0.5);
    assert.ok(Math.abs(midpoint.x-center.x)<1e-4&&Math.abs(midpoint.z-center.z)<1e-4,'ribbon center matches engine sampler');
    assert.ok(Math.abs(a.distanceTo(b)-map.width)<1e-4,'visible road width matches physics');
  }
  assert.ok(track.geometry.attributes.normal.getY(0)>0.9,'road surface normals face up');
  assert.equal(root.children.find(node=>node.userData.kind==='gates').children.length,4);
  assert.equal(root.children.find(node=>node.userData.kind==='finish').children.length,20);
}
assertTrack(mapRoot,MAPS[0]);
const rootCount=gpu.scene.children.length;let mapsDisposed=0;
for(const map of MAPS.slice(1)){
  const oldRoot=mapRoot;const ownedGeo=new Set(),ownedMat=new Set();let dg=0,dm=0;
  oldRoot.traverse(node=>{if(node.geometry)ownedGeo.add(node.geometry);if(node.material)(Array.isArray(node.material)?node.material:[node.material]).forEach(m=>ownedMat.add(m));});
  ownedGeo.forEach(value=>value.addEventListener('dispose',()=>dg++));ownedMat.forEach(value=>value.addEventListener('dispose',()=>dm++));
  game.selectMap(map.id);view.render(game.state,[],0);mapRoot=gpu.scene.children.find(node=>node.userData.kind==='map');
  assert.equal(oldRoot.parent,null);assert.equal(dg,ownedGeo.size);assert.equal(dm,ownedMat.size);assert.equal(gpu.scene.children.length,rootCount);assert.equal(mapRoot.userData.mapId,map.id);assertTrack(mapRoot,map);mapsDisposed++;
}
assert.equal(mapsDisposed,2);
const state=game.state;state.phase='racing';state.player.progress=0.22;state.player.speed=28;Object.assign(state.player,sampleTrack(state.mapId,state.player.progress));
view.render(state,[{type:'race-start',x:state.player.x,z:state.player.z}],0.05);
const oldLegAngle=legs[0].rotation.x;view.render(state,[],0.05);assert.notEqual(legs[0].rotation.x,oldLegAngle,'legs gallop at running speed');
assert.equal(unicorn.position.x,state.player.x);assert.equal(unicorn.position.z,state.player.z);assert.equal(unicorn.rotation.y,state.player.yaw);
assert.ok(gpu.camera.position.y>5,'camera sees volumetric unicorn and track');
const forward=new THREE.Vector3(Math.sin(state.player.yaw),0,Math.cos(state.player.yaw));const relative=gpu.camera.position.clone().sub(unicorn.position);assert.ok(relative.dot(forward)<0,'third-person camera stays behind runner');
const pooled=gpu.scene.children.find(node=>node.isInstancedMesh);assert.equal(pooled.count,150);
const stableRoot=mapRoot;for(let n=0;n<100;n++)view.render(state,[{type:'lap',x:state.player.x,z:state.player.z}],1/60);assert.equal(gpu.scene.children.find(node=>node.userData.kind==='map'),stableRoot);assert.equal(gpu.scene.children.length,rootCount,'effects never add scene objects');
state.phase='paused';view.render(state,[],0.05);
const pausedCamera=gpu.camera.position.clone(),pausedBody=body.position.clone(),pausedTail=tail.rotation.clone(),pausedLegs=legs.map(node=>node.rotation.x),pausedParticles=Array.from(pooled.instanceMatrix.array);
for(let n=0;n<5;n++)view.render(state,[],0.05);
assert.equal(gpu.camera.position.distanceTo(pausedCamera),0);assert.equal(body.position.distanceTo(pausedBody),0);assert.equal(tail.rotation.y,pausedTail.y);assert.deepEqual(legs.map(node=>node.rotation.x),pausedLegs);assert.deepEqual(Array.from(pooled.instanceMatrix.array),pausedParticles,'pause freezes cosmetic animation and particle motion');
state.phase='finished';view.render(state,[{type:'finish'}],0.05);state.phase='select';view.render(state,[],0);
const matrix=new THREE.Matrix4();pooled.getMatrixAt(0,matrix);assert.equal(new THREE.Vector3().setFromMatrixScale(matrix).length(),0,'same-map reset clears old finish effects');
container.bounds.width=900;container.bounds.height=500;view.resize();view.render(state,[],0);assert.equal(gpu.width,900);assert.equal(gpu.height,500);assert.equal(gpu.camera.aspect,1.8);
const geos=new Set(),mats=new Set();let dg=0,dm=0;gpu.scene.traverse(node=>{if(node.geometry)geos.add(node.geometry);if(node.material)(Array.isArray(node.material)?node.material:[node.material]).forEach(m=>mats.add(m));});geos.forEach(value=>value.addEventListener('dispose',()=>dg++));mats.forEach(value=>value.addEventListener('dispose',()=>dm++));
const renders=gpu.count;let prevented=false;view.canvas.listeners.get('webglcontextlost')({preventDefault(){prevented=true;}});assert.ok(prevented);assert.equal(container.events[0].type,'unicornruns:render-error');view.render(state,[],1/60);assert.equal(gpu.count,renders);view.dispose();view.dispose();assert.equal(gpu.disposed,1);assert.equal(container.children.length,0);assert.equal(dg,geos.size);assert.equal(dm,mats.size);
const quiet=context.createRenderer(new Element(),{reducedMotion:true});state.phase='racing';quiet.render(state,[],0.05);const quietGPU=renderers[1];assert.equal(quietGPU.scene.children.find(node=>node.isInstancedMesh).count,40);const qb=quietGPU.scene.children.find(node=>node.userData.kind==='unicorn').children.find(node=>node.userData.kind==='body');assert.equal(qb.position.y,0);assert.ok(qb.children.filter(node=>node.userData.kind==='leg').every(node=>Math.abs(node.rotation.x)<=0.163));quiet.dispose();
const fail=vm.createContext({MAPS,sampleTrack,THREE:{...THREE,WebGLRenderer:class{constructor(){throw new Error('GPU unavailable');}}},CustomEvent:CustomEventAdapter});vm.runInContext(executable,fail);const failed=new Element();assert.throws(()=>fail.createRenderer(failed),/GPU unavailable/);assert.equal(failed.children.length,0);
console.log('Unicorn Runs 3D: real sampled ribbon widths, three themes, volumetric unicorn/gallop/horn/rainbow, following camera, bounded sparkles, map-resource cleanup, exact pause/reset, reduced motion and WebGL lifecycle passed.');
