// Real Three geometry/cameras; adapt only DOM/canvas/WebGL for GPU-free CI.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const threeSource=await readFile(new URL('../minecraft/libs/three.module.js',import.meta.url),'utf8');
const three=await import(`data:text/javascript;base64,${Buffer.from(threeSource).toString('base64')}`);
const source=await readFile(new URL('./render3d.js',import.meta.url),'utf8');
const engineSource=await readFile(new URL('./engine.js',import.meta.url),'utf8');
const {HEROES,WEAPONS}=await import(`data:text/javascript;base64,${Buffer.from(engineSource).toString('base64')}`);
class Element {
  constructor(){this.style={};this.listeners=new Map();this.children=[];this.bounds={left:23,top:17,width:500,height:700};this.events=[];}
  setAttribute(){}
  appendChild(child){child.parent=this;this.children.push(child);}
  getBoundingClientRect(){return this.parent?.bounds||this.bounds;}
  addEventListener(name,handler){this.listeners.set(name,handler);}
  removeEventListener(name){this.listeners.delete(name);}
  dispatchEvent(event){this.events.push(event);}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);}
}
const instances=[];
class Renderer {
  constructor(){this.domElement=new Element();this.shadowMap={};this.renderCount=0;this.disposed=0;instances.push(this);}
  setPixelRatio(){}
  setClearColor(){}
  setSize(w,h){this.width=w;this.height=h;}
  render(scene,camera){this.scene=scene;this.camera=camera;this.renderCount++;}
  dispose(){this.disposed++;}
}
const labels=[];
const document={createElement(){return {width:0,height:0,getContext(){return {clearRect(){},fillText(text){labels.push(text);}};}};}};
class CustomEventAdapter{constructor(type,options){this.type=type;Object.assign(this,options);}}
const context=vm.createContext({document,HEROES,WEAPONS,THREE:{...three,WebGLRenderer:Renderer},CustomEvent:CustomEventAdapter,console});
const executable=source.replace(/^import .*?;\n/gm,'').replace('export function createRenderer','function createRenderer')+'\nglobalThis.createRenderer=createRenderer;';
vm.runInContext(executable,context);
const container=new Element();
const view=context.createRenderer(container);
assert.equal(container.children.length,1);
assert.equal(labels.join(','),'R,S,P,B');
const gpu=instances[0];
const state={phase:'select',pausePhase:null,heroId:'scout',stage:1,prepRemaining:30,arenaHalf:32,
  player:{x:0,z:0,yaw:0,hp:100,maxHp:100,speed:7},selectedWeapon:0,
  weapons:[{id:'w1',kind:'rifle'},{id:'w2',kind:'shotgun'},{id:'w3',kind:'rail'}],
  pickups:Object.keys(WEAPONS).map((kind,i)=>({id:`pickup${i}`,x:-15+i*10,z:8,kind,collected:false})),
  enemies:['scout','brute','shooter','boss'].map((type,i)=>({id:`enemy${i}`,x:-12+i*8,z:-15,type,hp:100,maxHp:100,radius:1,alive:true})),
  bullets:[{id:'b1',x:1,z:2,radius:0.2,enemy:false},{id:'b2',x:-2,z:-3,radius:0.3,enemy:true}],
  obstacles:[{id:'o1',x:8,z:8,w:6,d:4,h:3}]};
view.render(state,[],0);
const dynamic=gpu.scene.children.find(node=>node.userData.kind==='dynamic');
const byKind=kind=>dynamic.children.filter(node=>node.userData.kind===kind);
const player=gpu.scene.children.find(node=>node.userData.kind==='player');
const getHero=()=>player.children.find(node=>node.userData.heroId);
assert.equal(byKind('enemy').length,4);
assert.equal(byKind('enemy-hp').length,4);
assert.equal(byKind('pickup').length,Object.keys(WEAPONS).length);
const cachedTextures=new Set();let releasedLabels=0;
dynamic.traverse(node=>{if(node.material?.map)cachedTextures.add(node.material.map);});
assert.equal(cachedTextures.size,4);
cachedTextures.forEach(texture=>texture.addEventListener('dispose',()=>releasedLabels++));
for(const x of [-32,32])for(const z of [-32,32]){
  const projected=new three.Vector3(x,0,z).project(gpu.camera);
  assert.ok(Math.abs(projected.x)<0.96&&Math.abs(projected.y)<0.96,'selection preview fits the complete arena');
}
assert.equal(byKind('obstacle').length,1);
assert.equal(byKind('bullet').length,2);
assert.equal(byKind('enemy')[0].position.x,-12);
assert.equal(byKind('enemy')[0].position.z,-15);
assert.equal(byKind('obstacle')[0].children[0].scale.x,6);
assert.equal(byKind('obstacle')[0].children[0].scale.y,3);
assert.equal(byKind('obstacle')[0].children[0].scale.z,4);
const heroMeshes=new Map();
const heroWidths=new Map();
let heroMaterialsReleased=0;
for(const hero of HEROES){
  const oldHero=getHero();const oldMaterial=oldHero.children[0].material;
  if(oldHero.userData.heroId!==hero.id)oldMaterial.addEventListener('dispose',()=>heroMaterialsReleased++);
  state.heroId=hero.id;view.render(state,[],0);
  heroMeshes.set(hero.id,getHero().children.length);
  heroWidths.set(hero.id,getHero().children[0].scale.x);
  assert.equal(getHero().userData.heroId,hero.id);
  assert.equal(getHero().children[0].material.color.getHexString(),new three.Color(hero.color).getHexString());
}
assert.equal(heroMaterialsReleased,3);
assert.ok(heroMeshes.get('engineer')>heroMeshes.get('ranger'),'engineer has physical antennas/backpack');
assert.ok(heroWidths.get('tank')>heroWidths.get('ranger'),'tank has a physically bulkier armored model');
for(const kind of Object.keys(WEAPONS)){
  state.weapons[0]={id:'selected',kind};state.selectedWeapon=0;view.render(state,[],0);
  assert.equal(player.children.filter(node=>node.userData.weaponKind).length,1);
  assert.equal(player.children.find(node=>node.userData.weaponKind).userData.weaponKind,kind);
}
state.player={...state.player,x:12,z:-7,yaw:Math.PI/2,hp:50};state.phase='combat';
view.render(state,[{type:'combat-start',x:0,z:0},{type:'shot',x:12,z:-7,kind:'rail'}],0);
assert.equal(player.position.x,12);assert.equal(player.position.z,-7);assert.equal(player.rotation.y,Math.PI/2);
const hp=gpu.scene.children.find(node=>node.userData.kind==='player-hp');
assert.equal(hp.children[1].scale.x,3.05*0.5);
const enemy=byKind('enemy')[0];const enemyHP=byKind('enemy-hp')[0];
state.enemies[0].hp=25;view.render(state,[{type:'hit',x:-12,z:-15}],1/60);
assert.equal(byKind('enemy')[0],enemy,'enemy groups reused for matching ids');
assert.ok(Math.abs(enemyHP.children[1].scale.x-2.45*0.25)<1e-10);
const bullet=byKind('bullet')[0];state.bullets[0].x=3;view.render(state,[],1/60);assert.equal(byKind('bullet')[0],bullet);assert.equal(bullet.position.x,3);
const pools=gpu.scene.children.filter(node=>node.isInstancedMesh);
assert.equal(pools.length,2);assert.equal(pools[0].count,180);assert.equal(pools[1].count,512);
const objectCount=dynamic.children.length;
for(let i=0;i<50;i++)view.render(state,[{type:'kill',x:0,z:0},{type:'pickup',x:8,z:8,kind:'shotgun'}],1/60);
assert.equal(dynamic.children.length,objectCount,'VFX do not create unbounded objects');

function pointerRoundTrip(){
  gpu.camera.updateMatrixWorld();const bounds=view.canvas.getBoundingClientRect();
  for(const [x,z] of [[0,0],[12,-7],[20,5],[-12,-15],[30,20]]){
    const projected=new three.Vector3(x,0,z).project(gpu.camera);
    const mapped=view.screenToWorld(bounds.left+(projected.x+1)/2*bounds.width,bounds.top+(1-projected.y)/2*bounds.height);
    assert.ok(Math.abs(mapped.x-x)<1e-6,`XZ aiming x=${x}`);assert.ok(Math.abs(mapped.z-z)<1e-6,`XZ aiming z=${z}`);
  }
  assert.ok(gpu.camera.position.y>20,'camera views genuine 3D depth');
  assert.ok(gpu.camera.position.z>state.player.z,'camera is aligned with world Z');
}
pointerRoundTrip();container.bounds.width=960;container.bounds.height=600;view.resize();view.render(state,[],0);pointerRoundTrip();
assert.equal(gpu.width,960);assert.equal(gpu.height,600);
state.phase='paused';state.pausePhase='combat';view.render(state,[],1/60);assert.equal(byKind('enemy').length,4);
state.pickups[0].collected=true;state.enemies[0].alive=false;state.bullets=[];view.render(state,[],1/60);
assert.equal(byKind('pickup').length,Object.keys(WEAPONS).length-1);assert.equal(byKind('enemy').length,3);assert.equal(byKind('bullet').length,0);
state.stage=2;state.phase='prepare';state.enemies=[];state.pickups=[];state.obstacles=[];view.render(state,[{type:'stage-start',x:0,z:0}],1/60);
assert.equal(dynamic.children.length,0,'old stage entities/HP bars are removed');
const seenGeometries=new Set(),seenMaterials=new Set(),seenTextures=new Set();let releasedGeo=0,releasedMat=0,releasedTex=0;
gpu.scene.traverse(node=>{if(node.geometry)seenGeometries.add(node.geometry);if(node.material)(Array.isArray(node.material)?node.material:[node.material]).forEach(m=>{seenMaterials.add(m);if(m.map)seenTextures.add(m.map);});});
seenGeometries.forEach(g=>g.addEventListener('dispose',()=>releasedGeo++));seenMaterials.forEach(m=>m.addEventListener('dispose',()=>releasedMat++));seenTextures.forEach(t=>t.addEventListener('dispose',()=>releasedTex++));
const beforeLoss=gpu.renderCount;let prevented=false;view.canvas.listeners.get('webglcontextlost')({preventDefault(){prevented=true;}});
assert.ok(prevented);assert.equal(container.events[0].type,'gunarcade:render-error');view.render(state,[],1/60);assert.equal(gpu.renderCount,beforeLoss);assert.equal(view.screenToWorld(100,100),null);
view.dispose();view.dispose();assert.equal(gpu.disposed,1);assert.equal(container.children.length,0);assert.equal(releasedGeo,seenGeometries.size);assert.equal(releasedMat,seenMaterials.size);assert.equal(releasedTex,seenTextures.size);assert.equal(releasedLabels,4,"cached weapon hologram textures disposed");
const quiet=context.createRenderer(new Element(),{reducedMotion:true});quiet.render(state,[{type:'hurt'}],1/60);assert.equal(instances[1].scene.children.find(n=>n.isInstancedMesh).count,48);quiet.dispose();
const fail=vm.createContext({document,HEROES,WEAPONS,THREE:{...three,WebGLRenderer:class{constructor(){throw new Error('WebGL unavailable');}}},CustomEvent:CustomEventAdapter});vm.runInContext(executable,fail);const failedContainer=new Element();assert.throws(()=>fail.createRenderer(failedContainer),/WebGL unavailable/);assert.equal(failedContainer.children.length,0);
console.log('GunArcade 3D: heroes/weapons, enemy shapes/HP, crates, world geometry, id reuse, bounded VFX, XZ pointer projection, following camera/resize, stage cleanup, context-loss pause event, reduced motion and GPU/resource lifecycle passed.');
