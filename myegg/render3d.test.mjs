import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const threeSource=await readFile(new URL('../minecraft/libs/three.module.js',import.meta.url),'utf8');
const THREE=await import(`data:text/javascript;base64,${Buffer.from(threeSource).toString('base64')}`);
const engineSource=await readFile(new URL('./engine.js',import.meta.url),'utf8');
const {LOCATIONS,TRAILS,DEMON_TYPES,createGame}=await import(`data:text/javascript;base64,${Buffer.from(engineSource).toString('base64')}`);
const source=await readFile(new URL('./render3d.js',import.meta.url),'utf8');
class Element{
  constructor(){this.style={};this.children=[];this.listeners=new Map();this.events=[];this.bounds={left:20,top:25,width:500,height:700};}
  appendChild(child){child.parent=this;this.children.push(child);}
  setAttribute(){}
  getBoundingClientRect(){return this.parent?.bounds||this.bounds;}
  addEventListener(type,handler){this.listeners.set(type,handler);}
  removeEventListener(type){this.listeners.delete(type);}
  dispatchEvent(event){this.events.push(event);}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);}
}
const labels=[];const document={createElement(){return{width:0,height:0,getContext(){return{fillRect(){},fillText(text){labels.push(text);}};}};}};
const renderers=[];
class Renderer{constructor(){this.domElement=new Element();this.shadowMap={};this.count=0;this.disposed=0;renderers.push(this);}setPixelRatio(){}setSize(w,h){this.width=w;this.height=h;}render(scene,camera){this.scene=scene;this.camera=camera;this.count++;}dispose(){this.disposed++;}}
class CustomEventAdapter{constructor(type,options){this.type=type;Object.assign(this,options);}}
const executable=source.replace(/^import .*?;\n/gm,'').replace('export function createRenderer','function createRenderer')+'\nglobalThis.createRenderer=createRenderer;';
let rayTargets=[];
class RaycasterSpy extends THREE.Raycaster { intersectObjects(objects,recursive){rayTargets=objects.slice();return super.intersectObjects(objects,recursive);} }
const context=vm.createContext({THREE:{...THREE,WebGLRenderer:Renderer,Raycaster:RaycasterSpy},LOCATIONS,TRAILS,DEMON_TYPES,document,CustomEvent:CustomEventAdapter});vm.runInContext(executable,context);
const container=new Element();const view=context.createRenderer(container);const gpu=renderers[0];let now=0;const game=createGame({now:()=>now,random:()=>0.99});const state=game.state;
view.render(state,[],0);
assert.equal(container.children.length,1);assert.ok(labels.includes('트레일')&&labels.includes('판매')&&labels.includes('훈련'));
const dynamic=gpu.scene.children.find(node=>node.userData.kind==='dynamic');const byKind=kind=>dynamic.children.filter(node=>node.userData.kind===kind);
assert.equal(byKind('nest').length,6);assert.equal(byKind('egg').length,6);assert.equal(byKind('guard').length,2);
const safe=gpu.scene.children.find(node=>node.userData.kind==='safe-zone');assert.equal(safe.scale.x,24);assert.equal(safe.scale.z,23);assert.equal(safe.position.z,18.5);
function clickWorld(x,y,z){gpu.camera.updateMatrixWorld();const point=new THREE.Vector3(x,y,z).project(gpu.camera);const b=view.canvas.getBoundingClientRect();return view.hitTest(b.left+(point.x+1)*b.width/2,b.top+(1-point.y)*b.height/2);}
assert.equal(clickWorld(0,0.8,22)?.type,'nest');assert.equal(clickWorld(0,0.8,22)?.id,'nest-2');
assert.equal(clickWorld(8,2,14)?.type,'sales');assert.equal(clickWorld(8,2.8,24)?.type,'shop');assert.equal(clickWorld(-8,1,14)?.type,'treadmill');
assert.equal(rayTargets.length,15);assert.equal(new Set(rayTargets).size,15);
game.start();const egg=state.wildEggs[0];state.player.x=egg.x;state.player.z=egg.z;view.render(state,[],0);
assert.equal(clickWorld(egg.x,1.05,egg.z)?.type,'egg');assert.equal(clickWorld(egg.x,1.05,egg.z)?.id,egg.id);
const oldEgg=byKind('egg').find(node=>node.userData.id===egg.id);let releasedEggMaterial=0;oldEgg.children[0].material.addEventListener('dispose',()=>releasedEggMaterial++);
assert.equal(game.pickupEgg(egg.id).ok,true);view.render(state,game.drainEvents(),0.02);assert.equal(byKind('egg').length,5);assert.equal(releasedEggMaterial,1);
assert.notEqual(clickWorld(egg.x,1.05,egg.z)?.id,egg.id,'collected eggs leave raycast target list');assert.equal(rayTargets.length,14);assert.ok(!rayTargets.includes(oldEgg));
const player=gpu.scene.children.find(node=>node.userData.kind==='player');assert.ok(player.children.some(node=>node.userData.kind==='egg'),'carried egg is attached to the actual avatar');
state.player.x=-5;state.player.z=22;game.update(0,{});assert.equal(game.depositEgg('nest-1').ok,true);view.render(state,game.drainEvents(),0.02);
assert.ok(!player.children.some(node=>node.userData.kind==='egg'));const nest=byKind('nest').find(node=>node.userData.target.id==='nest-1');assert.ok(nest.children.some(node=>node.userData.kind==='egg'));
now=30000;game.update(0,{});view.render(state,[],0.02);const progress=byKind('nest-progress')[0];assert.ok(Math.abs(progress.children[1].scale.x-2.35*0.5)<1e-9);
now=61000;game.update(0,{});view.render(state,game.drainEvents(),0.02);assert.equal(nest.children[2].visible,true,'ready nest shows glowing halo');
state.demons=Object.entries(DEMON_TYPES).map(([species,data],i)=>({id:`test-${species}`,species,name:data.name,color:data.color,x:-6+i*3,z:19,sellPrice:data.sellPrice}));view.render(state,[],0.02);assert.equal(byKind('demon').length,5);const demonCounts=new Map(byKind('demon').map(node=>[node.userData.species,node.children.length]));assert.ok(demonCounts.get('dragon')>demonCounts.get('leaf'),'winged dragon has distinct body geometry');
const treadmill=gpu.scene.children.find(node=>node.userData.kind==='treadmill');const stripes=treadmill.children.filter(node=>node.isMesh&&node.position.y===0.56);assert.equal(stripes.length,9);state.player.x=-8;state.player.z=14;state.trailId='rainbow';view.render(state,[],0.05);const stripeZ=stripes[0].position.z;view.render(state,[],0.05);assert.notEqual(stripes[0].position.z,stripeZ,'actual belt stripes move during training');
const particles=gpu.scene.children.find(node=>node.isInstancedMesh);assert.equal(particles.count,160);const rootCount=gpu.scene.children.length;for(let n=0;n<40;n++)view.render(state,[{type:'hatch',x:0,z:22}],1/60);assert.equal(gpu.scene.children.length,rootCount,'effects use a fixed pool');
state.phase='paused';view.render(state,[],0.05);const frozenCamera=gpu.camera.position.clone(),frozenParticles=Array.from(particles.instanceMatrix.array),frozenStripe=stripes[0].position.z,frozenDemon=byKind('demon')[0].position.y,frozenEgg=byKind('egg')[0].position.y;
for(let n=0;n<5;n++)view.render(state,[],0.05);assert.equal(gpu.camera.position.distanceTo(frozenCamera),0);assert.deepEqual(Array.from(particles.instanceMatrix.array),frozenParticles);assert.equal(stripes[0].position.z,frozenStripe);assert.equal(byKind('demon')[0].position.y,frozenDemon);assert.equal(byKind('egg')[0].position.y,frozenEgg);
game.restart();view.render(state,[],0);assert.equal(byKind('demon').length,0);assert.equal(byKind('nest').length,6);assert.equal(byKind('egg').length,6);assert.equal(byKind('guard').length,2);assert.ok(!player.children.some(node=>node.userData.kind==='egg'));
for(let cycle=0;cycle<6;cycle++){game.restart();view.render(state,[],0);clickWorld(0,0.8,22);assert.equal(rayTargets.length,15);assert.equal(new Set(rayTargets).size,15,'restart does not accumulate duplicate clickable objects');assert.ok(rayTargets.every(node=>node.parent),'all clickable roots remain attached');}
container.bounds.width=960;container.bounds.height=600;view.resize();view.render(state,[],0);assert.equal(gpu.width,960);assert.equal(gpu.height,600);assert.equal(clickWorld(0,0.8,22)?.type,'nest');
const geometries=new Set(),materials=new Set(),textures=new Set();let dg=0,dm=0,dt=0;gpu.scene.traverse(node=>{if(node.geometry)geometries.add(node.geometry);if(node.material)(Array.isArray(node.material)?node.material:[node.material]).forEach(m=>{materials.add(m);if(m.map)textures.add(m.map);});});geometries.forEach(v=>v.addEventListener('dispose',()=>dg++));materials.forEach(v=>v.addEventListener('dispose',()=>dm++));textures.forEach(v=>v.addEventListener('dispose',()=>dt++));
let prevented=false;const renders=gpu.count;view.canvas.listeners.get('webglcontextlost')({preventDefault(){prevented=true;}});assert.ok(prevented);assert.equal(container.events[0].type,'myegg:render-error');view.render(state,[],0.05);assert.equal(gpu.count,renders);assert.equal(view.hitTest(100,100),null);view.dispose();view.dispose();assert.equal(gpu.disposed,1);assert.equal(container.children.length,0);assert.equal(dg,geometries.size);assert.equal(dm,materials.size);assert.equal(dt,textures.size);
const quiet=context.createRenderer(new Element(),{reducedMotion:true});quiet.render(state,[],0.05);assert.equal(renderers[1].scene.children.find(node=>node.isInstancedMesh).count,40);quiet.dispose();
const fail=vm.createContext({THREE:{...THREE,WebGLRenderer:class{constructor(){throw new Error('GPU unavailable');}}},LOCATIONS,TRAILS,DEMON_TYPES,document,CustomEvent:CustomEventAdapter});vm.runInContext(executable,fail);const failed=new Element();assert.throws(()=>fail.createRenderer(failed),/GPU unavailable/);assert.equal(failed.children.length,0);
console.log('MyEgg 3D: actual engine egg pickup/carry/deposit/readiness, nests/demons/guards, raycast all5target types, progress bars, treadmill, trail pools, exact pause, restart ids, resize, GPU errors and geometry/material/texture disposal passed.');
