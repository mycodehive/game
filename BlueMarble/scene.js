// Local Three.js renderer. Rules and currency stay in app.js.
const host = document.getElementById('scene-3d');
const wrap = document.getElementById('scene-wrap');
const board = document.getElementById('board');
const view3d = document.getElementById('view-3d');
const view2d = document.getElementById('view-2d');
const status = document.getElementById('view-status');
let active3d = false;
let renderer;

function selectView(use3d) {
  active3d = use3d;
  wrap.hidden = !use3d;
  board.hidden = use3d;
  view3d.setAttribute('aria-pressed', String(use3d));
  view2d.setAttribute('aria-pressed', String(!use3d));
  status.textContent = use3d ? '3D 라이브 보드 · 도시를 클릭해 정보를 확인하세요.' : '2D 지도 · 도시를 클릭해 정보를 확인하세요.';
  if (use3d) window.dispatchEvent(new Event('resize'));
}
view2d.addEventListener('click', () => selectView(false));

try {
  const THREE = await import('../minecraft/libs/three.module.js');
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x080e1c);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x080e1c, 35, 80);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  const lookAt = new THREE.Vector3(0, 0.3, 0);
  let azimuth = -Math.PI / 4, elevation = 0.86, distance = 24;
  function cameraUpdate() {
    camera.position.set(Math.sin(azimuth) * Math.cos(elevation) * distance, Math.sin(elevation) * distance, Math.cos(azimuth) * Math.cos(elevation) * distance);
    camera.lookAt(lookAt);
  }
  scene.add(new THREE.HemisphereLight(0xc9eaff, 0x293144, 2));
  const light = new THREE.DirectionalLight(0xffffff, 2.7);
  light.position.set(-5, 12, 7);
  scene.add(light);
  const cyan = new THREE.PointLight(0x35d9ec, 35, 18);
  cyan.position.set(0, 3, 0);
  scene.add(cyan);
  const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: .48, metalness: .18, ...options });
  const box = (x, y, z, color, parent, px = 0, py = 0, pz = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(x, y, z), material(color));
    mesh.position.set(px, py, pz);
    parent.add(mesh);
    return mesh;
  };
  box(12.5, .5, 12.5, 0x15273e, scene, 0, -.45, 0);
  box(10.9, .15, 10.9, 0x0d192c, scene, 0, -.13, 0);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), material(0x080e1c));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -.72;
  scene.add(floor);
  const grid = new THREE.GridHelper(60, 60, 0x1b4a60, 0x142232);
  grid.position.y = -.7;
  scene.add(grid);
  const coords = [];
  for (let c = 0; c < 9; c++) coords.push({ x: (c - 4) * 1.28, z: 4 * 1.28 });
  for (let r = 7; r >= 0; r--) coords.push({ x: 4 * 1.28, z: (r - 4) * 1.28 });
  for (let c = 7; c >= 0; c--) coords.push({ x: (c - 4) * 1.28, z: -4 * 1.28 });
  for (let r = 1; r <= 7; r++) coords.push({ x: -4 * 1.28, z: (r - 4) * 1.28 });
  const tileGroups = [], clickable = [], tokens = new Map();
  let snapshot = null, buildingSignature = '';
  const specials = { START: '#34d399', EVENT: '#a78bfa', TAX: '#fb7185', ISLAND: '#38bdf8' };
  function textTexture(title, subtitle = '', color = '#ffffff') {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 192;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#17293e'; ctx.fillRect(0, 0, 256, 192);
    ctx.fillStyle = color; ctx.fillRect(0, 0, 256, 12);
    ctx.textAlign = 'center'; ctx.fillStyle = '#f0f9ff';
    ctx.font = 'bold 39px system-ui, sans-serif'; ctx.fillText(title, 128, 92, 235);
    ctx.fillStyle = '#a4bdd4'; ctx.font = '25px system-ui, sans-serif'; ctx.fillText(subtitle, 128, 143, 230);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
  function buildBoard(data) {
    data.tiles.forEach(tile => {
      const group = new THREE.Group(), coord = coords[tile.id];
      group.position.set(coord.x, 0, coord.z);
      const base = box(1.19, .25, 1.19, 0x243d56, group, 0, 0, 0);
      base.userData.tileId = tile.id; clickable.push(base);
      const label = new THREE.Mesh(new THREE.PlaneGeometry(1.15, .87), new THREE.MeshBasicMaterial({ map: textTexture(tile.name, tile.type === 'CITY' ? `₩ ${tile.price}` : ({ START: '+200', EVENT: 'CHANCE', TAX: '−100', ISLAND: 'REST' })[tile.type], tile.color || specials[tile.type]) }));
      label.rotation.x = -Math.PI / 2; label.position.set(0, .132, .12);
      label.userData.tileId = tile.id; clickable.push(label);
      group.add(label);
      box(1.15, .025, .17, tile.color || specials[tile.type], group, 0, .14, -.49);
      const developments = new THREE.Group(); group.add(developments);
      group.userData.developments = developments;
      scene.add(group); tileGroups.push(group);
    });
  }
  const title = new THREE.Mesh(new THREE.PlaneGeometry(5.3, 3.9), new THREE.MeshBasicMaterial({ map: textTexture('BLUE MARBLE', 'BUILD YOUR EMPIRE', '#37dbea') }));
  title.rotation.x = -Math.PI / 2; title.position.set(0, .035, .4); scene.add(title);
  // A small skyline in the inner board makes the board feel like a city table.
  for (let i = 0; i < 9; i++) {
    const height = .35 + (i % 4) * .28;
    const tower = box(.35, height, .35, i % 2 ? 0x245b74 : 0x1b3956, scene, (i - 4) * .53, height / 2, -2.4);
    for (let j = .2; j < height; j += .22) box(.36, .035, .36, 0x46b6ca, tower, 0, j - height / 2, 0);
  }
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dice = [];
  function diceTexture(value) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ecfaff'; ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#123249';
    const spots = { 1: [[64,64]], 2: [[32,32],[96,96]], 3: [[32,32],[64,64],[96,96]], 4: [[32,32],[96,32],[32,96],[96,96]], 5: [[32,32],[96,32],[64,64],[32,96],[96,96]], 6: [[32,28],[96,28],[32,64],[96,64],[32,100],[96,100]] };
    spots[value].forEach(([x,y]) => { ctx.beginPath(); ctx.arc(x,y,10,0,Math.PI*2); ctx.fill(); });
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
  const faceMaterials = Array.from({ length: 6 }, (_, i) => new THREE.MeshStandardMaterial({ map: diceTexture(i + 1), roughness: .4 }));
  for (let i = 0; i < 2; i++) {
    const die = new THREE.Mesh(new THREE.BoxGeometry(.66, .66, .66), [...faceMaterials]);
    die.position.set(i ? .55 : -.55, .6, 2.8); scene.add(die); dice.push(die);
  }
  function clearGroup(group) {
    while (group.children.length) {
      const child = group.children[0]; group.remove(child);
      child.traverse(object => { if (object.geometry) object.geometry.dispose(); if (object.material) object.material.dispose(); });
    }
  }
  function applyState(data) {
    snapshot = data;
    if (!tileGroups.length && data.tiles.length) buildBoard(data);
    const nextSignature = JSON.stringify(data.tiles.map(t => [t.ownerId, t.buildings]));
    if (buildingSignature !== nextSignature) {
      buildingSignature = nextSignature;
      data.tiles.forEach(tile => {
        const group = tileGroups[tile.id]?.userData.developments;
        if (!group) return;
        clearGroup(group);
        const owner = data.players.find(p => p.id === tile.ownerId);
        if (!owner) return;
        box(1.08, .04, .09, owner.color, group, 0, .2, .5);
        const structures = tile.buildings || {};
        ['house', 'building', 'hotel'].forEach((type, i) => {
          if (!structures[type]) return;
          const height = [.33, .64, .92][i];
          box(.25, height, .27, owner.color, group, (i - 1) * .32, .14 + height / 2, -.28);
          if (type === 'house') {
            const roof = new THREE.Mesh(new THREE.ConeGeometry(.23, .18, 4), material(0xe0f2fe));
            roof.position.set((i - 1) * .32, .14 + height + .08, -.28); roof.rotation.y = Math.PI / 4; group.add(roof);
          } else box(.26, .04, .28, 0xe0f2fe, group, (i - 1) * .32, .14 + height, -.28);
        });
      });
    }
    const activeIds = new Set(data.players.map(p => p.id));
    for (const [id, token] of tokens) {
      if (!activeIds.has(id)) { scene.remove(token); clearGroup(token); tokens.delete(id); }
    }
    data.players.forEach((player, index) => {
      let token = tokens.get(player.id);
      const coord = coords[player.position];
      const target = new THREE.Vector3(coord.x + (index % 2 ? .25 : -.25), .38, coord.z + (index < 2 ? .2 : -.1));
      if (!token) {
        token = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CylinderGeometry(.12, .22, .35, 16), material(player.color)); body.position.y = .05; token.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(.15, 16, 12), material(player.color)); head.position.y = .31; token.add(head);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(.26, .025, 6, 24), new THREE.MeshBasicMaterial({ color: '#e0faff' })); ring.rotation.x = Math.PI / 2; ring.position.y = -.12; token.add(ring); token.userData.ring = ring;
        token.position.copy(target); scene.add(token); tokens.set(player.id, token);
      }
      token.visible = !player.isBankrupt;
      token.userData.target = target;
      token.userData.ring.visible = player.id === data.currentPlayerId;
    });
    if (data.lastRoll) dice.forEach((die, i) => { die.material[2] = faceMaterials[(i ? data.lastRoll.d2 : data.lastRoll.d1) - 1]; });
    document.getElementById('scene-status').textContent = data.phase === 'setup' ? '새 게임을 시작하세요' : data.isAnimating ? '이동 중…' : 'LIVE BOARD';
  }
  window.addEventListener('bluemarble:state', event => applyState(event.detail));
  if (window.BlueMarbleGame) applyState(window.BlueMarbleGame.getSnapshot());
  else document.addEventListener('DOMContentLoaded', () => applyState(window.BlueMarbleGame.getSnapshot()), { once: true });
  function resize() {
    if (!active3d) return;
    const width = host.clientWidth, height = host.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);
  window.addEventListener('resize', resize);
  const canvas = renderer.domElement, raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  let drag = null;
  canvas.addEventListener('pointerdown', event => { drag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false }; canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 5) drag.moved = true;
    azimuth -= (event.clientX - drag.x) * .007;
    elevation = THREE.MathUtils.clamp(elevation + (event.clientY - drag.y) * .005, .4, 1.48);
    drag.x = event.clientX; drag.y = event.clientY;
  });
  canvas.addEventListener('pointerup', event => {
    if (!drag || event.pointerId !== drag.id) return;
    if (!drag.moved) {
      const rect = canvas.getBoundingClientRect();
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      cameraUpdate(); raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(clickable)[0];
      if (hit) window.BlueMarbleGame?.inspectTile(hit.object.userData.tileId);
    }
    drag = null;
  });
  canvas.addEventListener('pointercancel', () => { drag = null; });
  canvas.addEventListener('wheel', event => { event.preventDefault(); distance = THREE.MathUtils.clamp(distance + event.deltaY * .012, 15, 33); }, { passive: false });
  document.getElementById('camera-left').onclick = () => { azimuth -= .35; };
  document.getElementById('camera-right').onclick = () => { azimuth += .35; };
  document.getElementById('camera-in').onclick = () => { distance = Math.max(15, distance - 2); };
  document.getElementById('camera-out').onclick = () => { distance = Math.min(33, distance + 2); };
  document.getElementById('camera-home').onclick = () => { azimuth = -Math.PI / 4; elevation = .86; distance = 24; };
  document.getElementById('camera-top').onclick = () => { azimuth = 0; elevation = 1.48; distance = 22; };
  view3d.disabled = false; view3d.addEventListener('click', () => selectView(true));
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); selectView(false); view3d.disabled = true;
    status.textContent = '3D 화면 연결이 끊어져 2D 지도로 전환했습니다. 게임은 계속할 수 있습니다.';
  });
  canvas.addEventListener('webglcontextrestored', () => { view3d.disabled = false; status.textContent = '3D 화면이 복구되었습니다. 3D 보드 버튼으로 돌아갈 수 있습니다.'; });
  selectView(true); cameraUpdate(); resize();
  let previous = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - previous) / 1000, .05); previous = now;
    if (!active3d || document.hidden || renderer.getContext().isContextLost()) return;
    tokens.forEach(token => { token.position.lerp(token.userData.target, reducedMotion ? 1 : 1 - Math.exp(-dt * 22)); });
    dice.forEach((die, i) => {
      if (snapshot?.isAnimating && !reducedMotion) { die.rotation.x += dt * 4; die.rotation.z += dt * (i ? -3 : 3); }
      else { die.rotation.x = 0; die.rotation.z = 0; }
    });
    cameraUpdate(); renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
} catch (error) {
  renderer?.dispose(); host.replaceChildren(); selectView(false); view3d.disabled = true;
  status.textContent = '이 환경에서는 3D 화면을 사용할 수 없어 2D 지도로 플레이합니다.';
  console.warn('Blue Marble 3D unavailable:', error);
}
