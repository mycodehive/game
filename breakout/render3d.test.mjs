// Real Three.js scene, geometry and projection; only the DOM/WebGL GPU are adapted.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const threeSource = await readFile(new URL('../minecraft/libs/three.module.js', import.meta.url), 'utf8');
const three = await import(`data:text/javascript;base64,${Buffer.from(threeSource).toString('base64')}`);
const source = await readFile(new URL('./render3d.js', import.meta.url), 'utf8');
const renderers = [];
class Element {
  constructor() { this.style={}; this.listeners=new Map(); this.children=[]; this.bounds={left:23,top:17,width:500,height:700}; this.events=[]; }
  setAttribute() {}
  appendChild(child) { child.parent=this; this.children.push(child); }
  getBoundingClientRect() { return this.parent?.bounds || this.bounds; }
  addEventListener(name,listener) { this.listeners.set(name,listener); }
  removeEventListener(name) { this.listeners.delete(name); }
  dispatchEvent(event) { this.events.push(event); }
  remove() { if(this.parent) this.parent.children=this.parent.children.filter(child=>child!==this); }
}
class Renderer {
  constructor() { this.domElement=new Element(); this.renderCount=0; this.disposed=0; renderers.push(this); }
  setPixelRatio() {}
  setClearColor() {}
  setSize(w,h) { this.width=w; this.height=h; }
  render(scene,camera) { this.scene=scene; this.camera=camera; this.renderCount++; }
  dispose() { this.disposed++; }
}
class CustomEventAdapter { constructor(type,options) { this.type=type; Object.assign(this,options); } }
const labelTexts=[];
const document = {
  createElement() {
    return {
      width: 0, height: 0,
      getContext() {
        return { clearRect() {}, fillText(text) { labelTexts.push(text); } };
      }
    };
  }
};
const context=vm.createContext({document,THREE:{...three,WebGLRenderer:Renderer},CustomEvent:CustomEventAdapter,console});
vm.runInContext(source.replace(/^import .*?;\n/,'').replace('export function create3DRenderer','function create3DRenderer')+'\nglobalThis.create3DRenderer=create3DRenderer;',context);
const container=new Element();
const view=context.create3DRenderer(container);
assert.equal(container.children.length,1);
assert.equal(labelTexts.join(","),"M,P,L,W,S,T,+","3D pickup labels match the shared UI");
const gpu=renderers[0];
const state={phase:'playing',level:1,score:0,lives:3,combo:0,paddle:{x:50,y:130,width:20,height:2.5},
  balls:[{id:'ball1',x:45,y:100,vx:20,vy:-40,radius:1.4,attached:false}],
  bricks:['normal','armor','blast','moving','boss'].map((type,i)=>({id:`brick${i}`,x:15+i*17,y:30,w:13,h:7,hp:i?3:1,maxHp:i?3:1,type,alive:true})),
  drops:['multi','pierce','laser','expand','shield','slow','heal'].map((kind,i)=>({id:`drop${i}`,x:15+i*10,y:80,kind})),
  shots:[{id:'shot1',x:40,y:100}],effects:{shield:2,pierce:5,laser:3}};
view.render(state,[{type:'brick-break',x:40,y:35,color:'#ffaabb'}],1/60);
assert.equal(gpu.renderCount,1);
const root=gpu.scene.children.find(node=>node.isGroup);
const byKind=kind=>root.children.filter(node=>node.userData.kind===kind);
assert.equal(byKind('brick').length,5);
assert.equal(byKind('ball').length,1);
assert.equal(byKind('drop').length,7);
const labelTextures=new Set();
root.traverse(node=>{if(node.material?.map)labelTextures.add(node.material.map);});
assert.equal(labelTextures.size,7);
let disposedLabels=0;
labelTextures.forEach(texture=>texture.addEventListener('dispose',()=>disposedLabels++));
assert.equal(byKind('shot').length,1);
assert.equal(byKind('brick')[0].position.x,-35);
state.bricks[0].color="#123456";
view.render(state,[],0);
assert.equal(byKind("brick")[0].children[0].material.color.getHexString(),"123456","engine brick colors are honored");
assert.equal(byKind('brick')[0].position.y,40);
assert.ok(byKind('brick')[0].children[0].scale.z>=3,'bricks are volumetric meshes');
assert.equal(byKind('ball')[0].position.x,-5);
assert.equal(byKind('ball')[0].position.y,-30);
assert.equal(byKind('ball')[0].scale.x,1.4);
const armor=byKind('brick')[1];
const armorMaterial=armor.children[0].material;
state.bricks[1].hp=1;
view.render(state,[],1/60);
assert.equal(byKind('brick')[1],armor,'existing ids reuse visual groups');
assert.ok(Math.abs(armor.children[3].scale.x-13*0.7/3)<1e-9,'health indicator tracks armor HP');
assert.ok(armorMaterial.emissiveIntensity>=1,'damaged brick flashes');
const instanced=gpu.scene.children.filter(node=>node.isInstancedMesh);
assert.equal(instanced.length,2,'particle/trail draw calls remain fixed');
assert.equal(instanced[0].count,192);
assert.equal(instanced[1].count,384);
for(let n=0;n<40;n++) view.render(state,[{type:'item',x:30,y:60,kind:'multi'},{type:'level-clear',x:50,y:70}],1/60);
assert.equal(root.children.length,14,'events do not add scene objects');

// Round-trip ray/plane mapping at several logical points in portrait and landscape.
function verifyProjection() {
  gpu.camera.updateMatrixWorld();
  const bounds=view.canvas.getBoundingClientRect();
  for(const [x,y] of [[0,0],[100,140],[25,130],[75,75],[50,70]]) {
    const point=new three.Vector3(x-50,70-y,0).project(gpu.camera);
    const mapped=view.screenToWorld(bounds.left+(point.x+1)/2*bounds.width,bounds.top+(1-point.y)/2*bounds.height);
    assert.ok(Math.abs(mapped.x-x)<1e-6,`pointer x round-trip at ${x},${y}`);
    assert.ok(Math.abs(mapped.y-y)<1e-6,`pointer y round-trip at ${x},${y}`);
  }
  for(const x of [-54,54]) for(const y of [-74,74]) {
    const point=new three.Vector3(x,y,8).project(gpu.camera);
    assert.ok(Math.abs(point.x)<0.94&&Math.abs(point.y)<0.94,'entire board fits camera');
  }
  assert.ok(Math.abs(gpu.camera.position.y)>10,'camera has a visible perspective angle');
}
// Remove transient camera shake before testing fit and exact ray mapping.
view.render(state,[],0.05);view.render(state,[],0.05);view.render(state,[],0.05);view.render(state,[],0.05);view.render(state,[],0.05);
verifyProjection();
container.bounds.width=850;container.bounds.height=460;
view.resize();
view.render(state,[],0);
assert.equal(gpu.width,850);
assert.equal(gpu.height,460);
verifyProjection();
let oldArmorDisposed=0;
armorMaterial.addEventListener('dispose',()=>oldArmorDisposed++);
state.level=2;state.bricks=[{id:'new-brick',x:50,y:20,w:15,h:8,hp:2,maxHp:2,type:'armor',alive:true}];state.drops=[];state.shots=[];
view.render(state,[],1/60);
assert.equal(oldArmorDisposed,1,'old unique brick materials are disposed during level changes');
assert.equal(byKind('brick').length,1);
assert.equal(byKind('drop').length,0);
assert.equal(byKind('shot').length,0);
assert.equal(armor.parent,null);
state.bricks[0].alive=false;
view.render(state,[],1/60);
assert.equal(byKind('brick').length,0,'broken bricks stop rendering');
state.phase='paused';
view.render(state,[],1/60);
assert.equal(byKind('ball').length,1,'pause retains board geometry');
const allGeometry=new Set();const allMaterials=new Set();let disposedGeometry=0;let disposedMaterial=0;
gpu.scene.traverse(node=>{if(node.geometry)allGeometry.add(node.geometry);if(node.material)(Array.isArray(node.material)?node.material:[node.material]).forEach(m=>allMaterials.add(m));});
allGeometry.forEach(g=>g.addEventListener('dispose',()=>disposedGeometry++));
allMaterials.forEach(m=>m.addEventListener('dispose',()=>disposedMaterial++));
const beforeLost=gpu.renderCount;
let prevented=false;
view.canvas.listeners.get('webglcontextlost')({preventDefault(){prevented=true;}});
assert.equal(prevented,true);
assert.equal(container.events[0].type,'breakout:render-error');
view.render(state,[],1/60);
assert.equal(gpu.renderCount,beforeLost,'context loss stops GPU work');
assert.equal(view.screenToWorld(100,100),null);
view.dispose();view.dispose();
assert.equal(gpu.disposed,1,'disposal is idempotent');
assert.equal(container.children.length,0);
assert.equal(disposedGeometry,allGeometry.size);
assert.equal(disposedMaterial,allMaterials.size);
assert.equal(disposedLabels,7,"cached pickup textures are released on disposal");
const quietContainer=new Element();
const quiet=context.create3DRenderer(quietContainer,{reducedMotion:true});
quiet.render({...state,level:1,bricks:[]},[{type:'upgrade',x:50,y:70}],1/60);
assert.equal(renderers[1].scene.children.find(node=>node.isInstancedMesh).count,48,'reduced motion uses smaller effects pool');
quiet.dispose();
const failingContext=vm.createContext({document,THREE:{...three,WebGLRenderer:class {constructor(){throw new Error('GPU unavailable');}}},CustomEvent:CustomEventAdapter,console});
vm.runInContext(source.replace(/^import .*?;\n/,'').replace('export function create3DRenderer','function create3DRenderer')+'\nglobalThis.create3DRenderer=create3DRenderer;',failingContext);
const failedContainer=new Element();
assert.throws(()=>failingContext.create3DRenderer(failedContainer),/GPU unavailable/,'GPU failure throws to controller fallback');
assert.equal(failedContainer.children.length,0);
console.log('Breakout 3D: real scene geometry/types, HP flashes, mesh reuse, bounded VFX, portrait/landscape camera fit, ray-plane aiming, level cleanup, context-loss fallback, idempotent resource disposal and reduced-motion checks passed.');
