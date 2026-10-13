import * as THREE from '../minecraft/libs/three.module.js';
const stage = document.getElementById('stage3d');
const board = document.getElementById('boardWrapper');
const toggle = document.getElementById('viewToggle');
const rotate = document.getElementById('rotateView');
const status = document.getElementById('viewStatus');
const snapshot = window.getLadderSnapshot();
let renderer;
try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
catch { status.textContent = '3D를 지원하지 않아 2D 보드로 플레이합니다.'; toggle.textContent = '2D 모드'; }
if (renderer) init();
function init() {
  stage.appendChild(renderer.domElement);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0d1b2c');
  const camera = new THREE.PerspectiveCamera(43, 1, .1, 100);
  scene.add(new THREE.HemisphereLight('#d8f4ff', '#244345', 2));
  const light = new THREE.DirectionalLight('#ffe4c7', 2.4); light.position.set(8, 15, 7); scene.add(light);
  const material = color => new THREE.MeshStandardMaterial({ color, roughness: .65 });
  const point = n => { const r = Math.floor((n - 1) / 10), c = (n - 1) % 10; return new THREE.Vector3((r % 2 === 0 ? c : 9 - c) - 4.5, .17, 4.5 - r); };
  const base = new THREE.Mesh(new THREE.BoxGeometry(10.4, .4, 10.4), material('#253e51')); base.position.y = -.27; scene.add(base);
  const label = (text, color) => {
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.font = 'bold 28px system-ui'; ctx.textAlign = 'center'; ctx.fillText(text, 32, 42);
    const map = new THREE.CanvasTexture(canvas);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(.65, .65), new THREE.MeshBasicMaterial({ map, transparent:true, depthWrite:false }));
    mesh.rotation.x = -Math.PI / 2; return mesh;
  };
  for (let n = 1; n <= 100; n++) {
    const p = point(n), endpoint = n === 100 || n === 1;
    const tile = new THREE.Mesh(new THREE.BoxGeometry(.94, .13, .94), material(endpoint ? '#327960' : n % 2 ? '#203950' : '#29465c'));
    tile.position.copy(p); tile.position.y = -.01; scene.add(tile);
    const number = label(String(n), endpoint ? '#a7ffd9' : '#d8edf8'); number.position.copy(p); number.position.y = .075; scene.add(number);
  }
  function bar(a, b, radius, mat) {
    const d = b.clone().sub(a), mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, d.length(), 8), mat);
    mesh.position.copy(a).add(b).multiplyScalar(.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); scene.add(mesh);
  }
  const ladderMat = material('#ebc17b'), slideMat = material('#5bd2da');
  for (const [from, to] of Object.entries(snapshot.jumps)) {
    const a = point(Number(from)), b = point(to); a.y = .23; b.y = .27;
    if (Number(from) < to) {
      const side = b.clone().sub(a); side.set(-side.z, 0, side.x).normalize().multiplyScalar(.12);
      bar(a.clone().add(side), b.clone().add(side), .033, ladderMat); bar(a.clone().sub(side), b.clone().sub(side), .033, ladderMat);
      const steps = Math.max(3, Math.floor(a.distanceTo(b) / .3));
      for (let i = 1; i < steps; i++) { const c = a.clone().lerp(b, i / steps); bar(c.clone().add(side), c.clone().sub(side), .028, ladderMat); }
    } else {
      const mid = a.clone().lerp(b, .5); mid.y = .6;
      const curve = new THREE.CatmullRomCurve3([a, mid, b]);
      scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, .09, 8, false), slideMat));
    }
  }
  const pieces = ['#ff7477', '#7faeff'].map((color, i) => {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.1, .18, .32, 16), material(color)); body.position.y = .25;
    const head = new THREE.Mesh(new THREE.SphereGeometry(.14, 16, 12), material(color)); head.position.y = .48; group.add(body, head); scene.add(group);
    return { group, target: point(snapshot.positions[i]) };
  });
  let angle = 0, dragging = false, pointerX = 0, visible = true;
  function sync(detail) { detail.positions.forEach((n, i) => { pieces[i].target.copy(point(n)); pieces[i].target.x += i === 0 ? -.2 : .2; }); }
  sync(snapshot); pieces.forEach(p => p.group.position.copy(p.target));
  window.addEventListener('ladder-state', e => sync(e.detail));
  function resize() { const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  function setView(value) { visible = value; stage.hidden = !value; board.hidden = value; rotate.hidden = !value; toggle.textContent = value ? '2D 보기' : '3D 보기'; status.textContent = value ? '3D 보드 · 드래그로 시점 회전' : '2D 보드'; if (value) resize(); window.dispatchEvent(new Event('resize')); }
  toggle.disabled = false; toggle.addEventListener('click', () => setView(!visible)); rotate.addEventListener('click', () => { angle += Math.PI / 4; });
  renderer.domElement.addEventListener('pointerdown', e => { dragging = true; pointerX = e.clientX; renderer.domElement.setPointerCapture(e.pointerId); });
  renderer.domElement.addEventListener('pointermove', e => { if (dragging) { angle += (e.clientX - pointerX) * .009; pointerX = e.clientX; } });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(event => renderer.domElement.addEventListener(event, () => { dragging = false; }));
  renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); setView(false); toggle.disabled = true; status.textContent = '3D 연결이 끊겨 2D 보드로 전환했습니다. 새로고침하면 재시도합니다.'; });
  new ResizeObserver(resize).observe(stage); setView(true);
  let last = 0;
  function animate(time) {
    requestAnimationFrame(animate); const dt = Math.min((time - last) / 1000, .05); last = time;
    if (!visible || document.hidden) return;
    camera.position.set(Math.sin(angle) * 11, 13, Math.cos(angle) * 11); camera.lookAt(0, 0, 0);
    pieces.forEach(piece => piece.group.position.lerp(piece.target, 1 - Math.exp(-12 * dt)));
    renderer.render(scene, camera);
  }
  requestAnimationFrame(animate);
}
