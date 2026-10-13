import * as THREE from '../minecraft/libs/three.module.js';
import { INGREDIENTS } from './engine.js';

export function createRenderer(container, { reducedMotion = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  const canvas = renderer.domElement;
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#fff5dc');
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  scene.add(new THREE.HemisphereLight('#ffffff', '#d6af80', 2.6));
  const light = new THREE.DirectionalLight('#fff8de', 3); light.position.set(-5, 10, 8); scene.add(light);
  const mat = color => new THREE.MeshStandardMaterial({ color, roughness: 0.72 });
  const mesh = (geometry, color, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geometry, mat(color)); m.position.set(x, y, z); parent.add(m); return m; };
  const sphere = (parent, color, x, y, z, sx, sy, sz) => { const m = mesh(new THREE.SphereGeometry(1, 20, 12), color, parent, x, y, z); m.scale.set(sx, sy, sz); return m; };
  const cylinder = (parent, color, radius, height, y = 0) => mesh(new THREE.CylinderGeometry(radius, radius, height, 40), color, parent, 0, y, 0);
  function disposeRoot(root) { const geos = new Set(), mats = new Set(); root.traverse(n => { if (n.geometry) geos.add(n.geometry); if (n.material) mats.add(n.material); }); geos.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); root.removeFromParent(); }
  const backdrop = new THREE.Group(); backdrop.userData.kind = 'backdrop'; scene.add(backdrop);
  mesh(new THREE.BoxGeometry(24, 0.4, 14), '#f5ddba', backdrop, 0, -0.35, 0);
  sphere(backdrop, '#ffcd68', -7, 5, -4, 0.9, 0.9, 0.3);
  for (let i = 0; i < 3; i++) sphere(backdrop, '#ffffff', -4 + i * 0.7, 5.4 + (i === 1 ? 0.2 : 0), -4, 0.65, 0.42, 0.25);
  for (let i = 0; i < 3; i++) sphere(backdrop, '#ffffff', 5 + i * 0.65, 4.8 + (i === 1 ? 0.25 : 0), -4, 0.65, 0.4, 0.25);
  const roots = ['target', 'stack'].map((kind, i) => { const root = new THREE.Group(); root.position.x = i ? 2.9 : -2.9; root.userData.kind = kind; scene.add(root); const plate = cylinder(root, i ? '#ffc4d9' : '#b8edd9', 2.15, 0.16, 0); plate.userData.kind = 'plate'; cylinder(root, '#fffef7', 1.95, 0.08, 0.1); return root; });
  const layers = [[], []]; const signatures = ['', '']; let stage = null, clock = 0, lost = false, disposed = false, shake = 0;
  const ingredientList = Array.isArray(INGREDIENTS) ? INGREDIENTS : Object.values(INGREDIENTS);
  const ingredient = id => ingredientList.find(v => v.id === id) || INGREDIENTS[id] || { height: 0.3 };
  function makeLayer(id, role) {
    const group = new THREE.Group(); group.userData.kind = 'ingredient'; group.userData.ingredientId = id;
    const h = ingredient(id).height || 0.3; group.userData.height = h;
    const name = String(id).toLowerCase();
    if (name.includes('bun') || name.includes('bread')) {
      const top = name.includes('top');
      if (top) { const dome = mesh(new THREE.SphereGeometry(1.6, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), '#eeb76c', group); dome.scale.y = h / 1.6; cylinder(group, '#eeb76c', 1.6, 0.04, 0); for (let i = 0; i < 24; i++) { const angle = i * 2.399, r = 0.35 + (i % 5) * 0.22; const x = Math.sin(angle) * r, z = Math.cos(angle) * r; const y = Math.sqrt(1 - r * r / 2.56) * h; const seed = sphere(group, '#fff4cb', x, y + 0.015, z, 0.055, 0.02, 0.11); seed.rotation.y = angle; } if (role === 'target') { sphere(group, '#49372f', -0.38, h * 0.4, 1.43, 0.08, 0.1, 0.035); sphere(group, '#49372f', 0.38, h * 0.4, 1.43, 0.08, 0.1, 0.035); sphere(group, '#ff9da1', -0.65, h * 0.25, 1.4, 0.13, 0.06, 0.025); sphere(group, '#ff9da1', 0.65, h * 0.25, 1.4, 0.13, 0.06, 0.025); } }
      else cylinder(group, '#e5a760', 1.6, h, h / 2);
    } else if (name.includes('patty')) { cylinder(group, '#865039', 1.48, h, h / 2); for (let i = 0; i < 5; i++) mesh(new THREE.BoxGeometry(2.45, 0.02, 0.07), '#613c2b', group, 0, h + 0.01, (i - 2) * 0.35); }
    else if (name.includes('cheese')) { const m = mesh(new THREE.BoxGeometry(2.9, h, 2.9), '#ffd75f', group, 0, h / 2); m.rotation.y = Math.PI / 4; for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2; const corner = mesh(new THREE.BoxGeometry(0.5, h, 0.7), '#ffd75f', group, Math.sin(a) * 1.5, h * 0.05, Math.cos(a) * 1.5); corner.rotation.y = a; corner.rotation.x = 0.25; } }
    else if (name.includes('lettuce')) { for (let i = 0; i < 9; i++) { const a = i * Math.PI * 2 / 9; sphere(group, i % 2 ? '#81d267' : '#a5e879', Math.cos(a) * 0.9, h / 2, Math.sin(a) * 0.9, 0.8, h / 2, 0.65); } }
    else if (name.includes('tomato')) { cylinder(group, '#f2736c', 1.4, h, h / 2); cylinder(group, '#ff9986', 1.22, 0.025, h + 0.01); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; sphere(group, '#ffe5ad', Math.sin(a) * 0.85, h + 0.035, Math.cos(a) * 0.85, 0.055, 0.018, 0.12); } }
    else if (name.includes('pickle')) { for (let i = 0; i < 3; i++) { const disk = cylinder(group, '#89bb58', 0.62, h, h / 2); disk.position.x = (i - 1) * 0.8; disk.position.z = i === 1 ? 0.4 : -0.25; for (let j = 0; j < 3; j++) sphere(group, '#dbe89e', disk.position.x + (j - 1) * 0.22, h + 0.01, disk.position.z, 0.04, 0.015, 0.09); } }
    else if (name.includes('onion')) { for (let i = 0; i < 3; i++) { const ring = mesh(new THREE.TorusGeometry(0.55, h / 2, 10, 30), '#e4b8ea', group, (i - 1) * 0.72, h / 2, i === 1 ? 0.3 : -0.2); ring.rotation.x = Math.PI / 2; } }
    else if (name.includes('egg')) { sphere(group, '#fffefa', 0, h * 0.25, 0, 1.5, h * 0.25, 1.3); sphere(group, '#ffc447', 0.1, h * 0.6, 0, 0.55, h * 0.4, 0.55); }
    else if (name.includes('bacon')) { for (let i = 0; i < 3; i++) { mesh(new THREE.BoxGeometry(2.7, h * 0.7, 0.45), '#dc8d80', group, 0, h / 2, (i - 1) * 0.6); mesh(new THREE.BoxGeometry(2.7, 0.025, 0.13), '#ffceb1', group, 0, h + 0.01, (i - 1) * 0.6); } }
    else cylinder(group, '#ffbf76', 1.4, h, h / 2);
    return group;
  }
  const poolSize = reducedMotion ? 24 : 100;
  const particles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.15, 0.03), mat('#ffd166'), poolSize); particles.userData.kind = 'confetti'; scene.add(particles);
  const particleState = Array.from({ length: poolSize }, () => ({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0 })); const dummy = new THREE.Object3D();
  function clearParticles() { particleState.forEach(p => p.life = 0); }
  function sync(index, ids) {
    const safe = (ids || []).slice(0, 14); const signature = safe.join('|'); if (signature === signatures[index]) return;
    let prefix = 0; while (prefix < layers[index].length && prefix < safe.length && layers[index][prefix].userData.ingredientId === safe[prefix]) prefix++;
    for (const m of layers[index].splice(prefix)) disposeRoot(m);
    let y = 0.19; layers[index].forEach(m => y += m.userData.height);
    for (const id of safe.slice(prefix)) { const m = makeLayer(id, index ? 'stack' : 'target'); m.userData.baseY = y; m.userData.drop = index && !reducedMotion ? 0.7 : 0; m.position.y = y + m.userData.drop; roots[index].add(m); layers[index].push(m); y += m.userData.height; }
    roots[index].userData.height = y; signatures[index] = signature;
  }
  function resize() { if (disposed) return; const b = container.getBoundingClientRect(); renderer.setSize(Math.max(1, b.width), Math.max(1, b.height), false); camera.aspect = Math.max(1, b.width) / Math.max(1, b.height); camera.updateProjectionMatrix(); }
  function render(state, events = [], dt = 0) {
    if (disposed || lost) return;
    const frozen = state.phase === 'paused'; const delta = frozen ? 0 : Math.min(0.05, Math.max(0, dt)); clock += delta;
    if (stage !== state.stage) { stage = state.stage; clearParticles(); shake = 0; }
    sync(0, state.target); sync(1, state.stack);
    for (const e of events) { if (e.type === 'stage-start') { clearParticles(); shake = 0; } if (e.type === 'correct' || e.type === 'stage-clear') particleState.forEach((p, i) => Object.assign(p, { life: 1.8, x: 2.9, y: (roots[1].userData.height || 2) + 0.3, z: 0, vx: Math.sin(i * 2.399) * (1 + i % 4), vy: 2 + i % 4 })); if (e.type === 'wrong' && !reducedMotion) shake = 0.3; }
    shake = Math.max(0, shake - delta); roots[1].position.x = 2.9 + (shake ? Math.sin(clock * 45) * shake * 0.3 : 0);
    layers.forEach(list => list.forEach(m => { m.userData.drop = Math.max(0, m.userData.drop - delta * 3); m.position.y = m.userData.baseY + m.userData.drop; }));
    particleState.forEach((p, i) => { p.life = Math.max(0, p.life - delta); if (p.life) { p.x += p.vx * delta; p.y += p.vy * delta; p.vy -= delta * 5; dummy.position.set(p.x, p.y, Math.sin(i) * 1.5); dummy.rotation.set(clock + i, clock * 2, i); dummy.scale.setScalar(p.life > 0 ? 1 : 0); } else dummy.scale.setScalar(0); dummy.updateMatrix(); particles.setMatrixAt(i, dummy.matrix); }); particles.instanceMatrix.needsUpdate = true;
    const height = Math.max(3, ...roots.map(r => r.userData.height || 0)); const centerY = height / 2;
    const distance = Math.max(11, 17 / Math.max(camera.aspect, 0.2), height * 1.8);
    camera.position.set(0, centerY + distance * 0.36, distance); camera.lookAt(0, centerY, 0); camera.updateMatrixWorld(); renderer.render(scene, camera);
  }
  const contextLost = event => { event.preventDefault(); lost = true; container.dispatchEvent(new CustomEvent('burgerbuddies:render-error', { detail: { message: '3D 화면 연결이 끊겼어요. 다시 열어 주세요.' } })); };
  canvas.addEventListener('webglcontextlost', contextLost);
  canvas.setAttribute('aria-label', '왼쪽은 주문 햄버거, 오른쪽은 내가 만든 햄버거'); container.appendChild(canvas); resize();
  function dispose() { if (disposed) return; disposed = true; canvas.removeEventListener('webglcontextlost', contextLost); disposeRoot(scene); renderer.dispose(); canvas.remove(); }
  return { canvas, resize, render, dispose };
}
