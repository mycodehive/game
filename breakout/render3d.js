import * as THREE from '../minecraft/libs/three.module.js';

const WIDTH = 100;
const HEIGHT = 140;
const PALETTE = {
  normal: '#55e5cd', armor: '#81aaff', blast: '#ff8660', moving: '#cb8eff', boss: '#ff5d94',
  multi: '#60eaff', pierce: '#bd8aff', laser: '#ff668c', expand: '#76f4a9',
  shield: '#72bfff', slow: '#ffc96a', heal: '#ff88c7'
};

/** Render the engine's logical arena as an actual, angled Three.js scene. */
export function create3DRenderer(container, { reducedMotion = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
  renderer.setClearColor('#071019');
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', '3D 네온 벽돌깨기 게임 화면');
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  canvas.style.touchAction = 'none';
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#071019');
  const camera = new THREE.PerspectiveCamera(45, 1, 1, 1400);
  const aimPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const rayHit = new THREE.Vector3();
  const geometries = new Set();
  const materials = new Set();
  const instances = new Set();
  const textures = new Set();
  const maps = { bricks: new Map(), balls: new Map(), drops: new Map(), shots: new Map() };
  const dynamicRoot = new THREE.Group();
  scene.add(dynamicRoot);
  const transform = new THREE.Object3D();
  let disposed = false;
  let contextLost = false;
  let currentLevel = null;
  let width = 0;
  let height = 0;
  let elapsed = 0;
  let cameraImpulse = 0;
  let particleCursor = 0;
  let trailCount = 0;

  const geometry = value => { geometries.add(value); return value; };
  const material = value => { materials.add(value); return value; };
  const box = geometry(new THREE.BoxGeometry(1, 1, 1));
  const sphere = geometry(new THREE.SphereGeometry(1, 12, 8));
  const octahedron = geometry(new THREE.OctahedronGeometry(1, 0));
  const torus = geometry(new THREE.TorusGeometry(1, 0.18, 6, 20));
  const cylinder = geometry(new THREE.CylinderGeometry(0.25, 0.25, 4, 6));
  const outlineGeometry = geometry(new THREE.EdgesGeometry(box));
  const labelPlane = geometry(new THREE.PlaneGeometry(3.2, 3.2));
  const softGlow = material(new THREE.MeshBasicMaterial({ color: '#63efdb', transparent: true, opacity: 0.17, blending: THREE.AdditiveBlending, depthWrite: false }));
  const bright = material(new THREE.MeshBasicMaterial({ color: '#d6fff5' }));
  const outline = material(new THREE.LineBasicMaterial({ color: '#ccf9ff', transparent: true, opacity: 0.6 }));
  const paddleMaterial = material(new THREE.MeshStandardMaterial({ color: '#55e5cd', emissive: '#2d9c90', emissiveIntensity: 0.8, metalness: 0.55, roughness: 0.25 }));
  const ballMaterial = material(new THREE.MeshStandardMaterial({ color: '#ecfff9', emissive: '#67e5bd', emissiveIntensity: 1.2, roughness: 0.15, metalness: 0.2 }));
  const pierceMaterial = material(new THREE.MeshStandardMaterial({ color: '#ffdf9a', emissive: '#ff8338', emissiveIntensity: 1.1, roughness: 0.15 }));
  const shotMaterial = material(new THREE.MeshBasicMaterial({ color: '#ff91ea' }));
  const labelMaterials = new Map();
  const glyphs = { multi: 'M', pierce: 'P', laser: 'L', expand: 'W', shield: 'S', slow: 'T', heal: '+' };
  for (const [kind, glyph] of Object.entries(glyphs)) {
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = labelCanvas.height = 128;
    const ctx = labelCanvas.getContext('2d');
    if (!ctx) continue;
    ctx.clearRect(0, 0, 128, 128);
    ctx.font = '900 94px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = PALETTE[kind];
    ctx.shadowBlur = 12;
    ctx.fillText(glyph, 64, 68);
    const texture = new THREE.CanvasTexture(labelCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.add(texture);
    labelMaterials.set(kind, material(new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false })));
  }
  const dropMaterials = new Map(Object.entries(PALETTE).map(([kind, hex]) => [kind, material(new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.25 }))]));

  function mesh(shape, appearance, parent, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
    const object = new THREE.Mesh(shape, appearance);
    object.position.set(x, y, z);
    object.scale.set(sx, sy, sz);
    parent.add(object);
    return object;
  }

  scene.add(new THREE.AmbientLight('#bfdfff', 1.1));
  const keyLight = new THREE.DirectionalLight('#ffffff', 2.1);
  keyLight.position.set(-35, 75, 110);
  scene.add(keyLight);
  const pinkLight = new THREE.PointLight('#ff59c8', 100, 240, 1);
  pinkLight.position.set(60, 25, 65);
  scene.add(pinkLight);
  const blueLight = new THREE.PointLight('#51dfff', 80, 220, 1);
  blueLight.position.set(-55, -50, 50);
  scene.add(blueLight);

  const board = new THREE.Group();
  scene.add(board);
  mesh(box, material(new THREE.MeshStandardMaterial({ color: '#0b1c2a', metalness: 0.35, roughness: 0.8 })), board, 0, 0, -3.2, 108, 148, 5);
  mesh(box, material(new THREE.MeshStandardMaterial({ color: '#08131f', roughness: 0.95 })), board, 0, 0, -0.6, WIDTH, HEIGHT, 0.4);
  const gridPoints = [];
  for (let x = -50; x <= 50; x += 10) gridPoints.push(new THREE.Vector3(x, -70, -0.34), new THREE.Vector3(x, 70, -0.34));
  for (let y = -70; y <= 70; y += 10) gridPoints.push(new THREE.Vector3(-50, y, -0.34), new THREE.Vector3(50, y, -0.34));
  const grid = new THREE.LineSegments(geometry(new THREE.BufferGeometry().setFromPoints(gridPoints)), material(new THREE.LineBasicMaterial({ color: '#204358', transparent: true, opacity: 0.5 })));
  board.add(grid);
  const edgeMaterial = material(new THREE.MeshStandardMaterial({ color: '#59c7e1', emissive: '#247e9b', emissiveIntensity: 0.9, metalness: 0.4, roughness: 0.35 }));
  mesh(box, edgeMaterial, board, -50.5, 0, 0.6, 0.8, 141, 2);
  mesh(box, edgeMaterial, board, 50.5, 0, 0.6, 0.8, 141, 2);
  mesh(box, edgeMaterial, board, 0, 70.5, 0.6, 102, 0.8, 2);
  const drainMaterial = material(new THREE.MeshBasicMaterial({ color: '#fc619d', transparent: true, opacity: 0.75 }));
  mesh(box, drainMaterial, board, 0, -70.5, 0, 102, 0.45, 0.5);
  const cornerMaterial = material(new THREE.MeshBasicMaterial({ color: '#b4f9ff' }));
  [-50.5, 50.5].forEach(x => [-70.5, 70.5].forEach(y => mesh(box, cornerMaterial, board, x, y, 1, 1.7, 4, 2)));

  const paddle = new THREE.Group();
  scene.add(paddle);
  const paddleBody = mesh(box, paddleMaterial, paddle);
  const paddleGlow = mesh(box, softGlow, paddle);
  const paddleStripe = mesh(box, bright, paddle);
  const shield = mesh(box, material(new THREE.MeshBasicMaterial({ color: '#65b3ff', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })), scene, 0, -65, 1.4, 98, 0.7, 0.8);
  shield.visible = false;

  const particleCapacity = reducedMotion ? 48 : 192;
  const particles = Array.from({ length: particleCapacity }, () => ({ life: 0, maxLife: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 1, color: new THREE.Color() }));
  const particleMesh = new THREE.InstancedMesh(octahedron, material(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })), particleCapacity);
  particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  particleMesh.frustumCulled = false;
  scene.add(particleMesh);
  instances.add(particleMesh);
  const trailCapacity = 384;
  const trails = new THREE.InstancedMesh(sphere, softGlow, trailCapacity);
  trails.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  trails.frustumCulled = false;
  scene.add(trails);
  instances.add(trails);

  function logicalPosition(object, x, y, z) {
    object.position.set(Number.isFinite(x) ? x - 50 : 0, Number.isFinite(y) ? 70 - y : 0, z);
  }

  function releaseVisual(entry) {
    dynamicRoot.remove(entry.group);
    if (entry.ownMaterial) {
      entry.ownMaterial.dispose();
      materials.delete(entry.ownMaterial);
    }
  }

  function clearLevel() {
    Object.values(maps).forEach(map => { map.forEach(releaseVisual); map.clear(); });
    particles.forEach(particle => { particle.life = 0; });
    cameraImpulse = 0;
  }

  function syncMap(map, items, create, update, visible = () => true) {
    const ids = new Set();
    for (const item of items || []) {
      if (!visible(item)) continue;
      ids.add(item.id);
      let entry = map.get(item.id);
      if (!entry) { entry = create(item); entry.group.userData.id = item.id; dynamicRoot.add(entry.group); map.set(item.id, entry); }
      update(entry, item);
    }
    for (const [id, entry] of map) if (!ids.has(id)) { releaseVisual(entry); map.delete(id); }
  }

  function createBrick(brick) {
    const group = new THREE.Group();
    group.userData.kind = "brick";
    const appearance = material(new THREE.MeshStandardMaterial({ color: brick.color || PALETTE[brick.type] || PALETTE.normal, emissive: brick.color || PALETTE[brick.type] || PALETTE.normal, emissiveIntensity: 0.26, roughness: 0.28, metalness: brick.type === 'armor' ? 0.8 : 0.4 }));
    const body = mesh(box, appearance, group);
    const edges = new THREE.LineSegments(outlineGeometry, outline);
    group.add(edges);
    const hpTrack = mesh(box, materialForTrack, group);
    const hpFill = mesh(box, bright, group);
    const emblem = mesh(brick.type === 'blast' ? octahedron : brick.type === 'boss' ? torus : box, dropMaterials.get(brick.type) || bright, group);
    return { group, body, edges, hpTrack, hpFill, emblem, ownMaterial: appearance, hp: brick.hp, hitUntil: 0 };
  }
  const materialForTrack = material(new THREE.MeshBasicMaterial({ color: '#183346' }));

  function updateBrick(entry, brick) {
    entry.ownMaterial.color.set(brick.color || PALETTE[brick.type] || PALETTE.normal);
    entry.ownMaterial.emissive.set(brick.color || PALETTE[brick.type] || PALETTE.normal);
    const w = brick.w || 10;
    const h = brick.h || 5;
    logicalPosition(entry.group, brick.x, brick.y, 2.1);
    const depth = brick.type === 'boss' ? 5 : brick.type === 'armor' ? 4 : 3;
    entry.body.scale.set(Math.max(0.1, w - 0.45), Math.max(0.1, h - 0.4), depth);
    entry.edges.scale.copy(entry.body.scale).multiplyScalar(1.015);
    const ratio = Math.max(0, Math.min(1, brick.hp / Math.max(1, brick.maxHp || brick.hp)));
    const showHP = (brick.maxHp || 1) > 1;
    entry.hpTrack.visible = entry.hpFill.visible = showHP;
    entry.hpTrack.position.set(0, -h * 0.3, depth / 2 + 0.13);
    entry.hpTrack.scale.set(w * 0.7, 0.32, 0.18);
    entry.hpFill.position.set(-(w * 0.7) * (1 - ratio) / 2, -h * 0.3, depth / 2 + 0.25);
    entry.hpFill.scale.set(w * 0.7 * ratio, 0.25, 0.16);
    entry.emblem.visible = brick.type !== 'normal';
    entry.emblem.position.set(0, showHP ? h * 0.1 : 0, depth / 2 + 0.35);
    entry.emblem.scale.setScalar(brick.type === 'boss' ? Math.min(h * 0.22, 1.7) : 0.65);
    entry.emblem.rotation.z = brick.type === 'moving' && !reducedMotion ? Math.sin(elapsed * 3) * 0.4 : Math.PI / 4;
    if (entry.hp !== brick.hp) entry.hitUntil = elapsed + 0.12;
    entry.hp = brick.hp;
    entry.ownMaterial.emissiveIntensity = entry.hitUntil > elapsed ? 1.5 : 0.2 + ratio * 0.16;
    if (brick.type === 'boss' && !reducedMotion) entry.ownMaterial.emissiveIntensity += Math.sin(elapsed * 3) * 0.08;
  }

  function createBall() {
    const group = new THREE.Group();
    group.userData.kind = "ball";
    const core = mesh(sphere, ballMaterial, group);
    mesh(sphere, softGlow, group, 0, 0, 0, 1.65, 1.65, 1.65);
    return { group, core, trail: Array.from({ length: reducedMotion ? 4 : 14 }, () => new THREE.Vector3()), validTrail: 0 };
  }

  function createDrop(drop) {
    const group = new THREE.Group();
    group.userData.kind = "drop";
    const body = mesh(octahedron, dropMaterials.get(drop.kind) || dropMaterials.get('multi'), group, 0, 0, 0, 2.1, 2.1, 1.3);
    const emblem = new THREE.Group();
    group.add(emblem);
    mesh(torus, dropMaterials.get(drop.kind) || bright, emblem, 0, 0, 0.5, 2.35, 2.35, 1);
    if (labelMaterials.has(drop.kind)) mesh(labelPlane, labelMaterials.get(drop.kind), emblem, 0, 0, 2.2);

    return { group, body, emblem };
  }

  function updateDrop(entry, drop) {
    logicalPosition(entry.group, drop.x, drop.y, 3.8);
    entry.body.rotation.z = reducedMotion ? Math.PI / 4 : elapsed * 1.4;
    entry.body.rotation.y = reducedMotion ? 0 : Math.sin(elapsed * 2) * 0.3;
  }

  function burst(event) {
    if (!['brick-hit','brick-break','paddle-hit','wall-hit','item','life-lost','level-clear','launch','shot','upgrade','gameover'].includes(event.type)) return;
    const large = ['brick-break','level-clear','gameover','item','upgrade'].includes(event.type);
    const count = reducedMotion ? (large ? 6 : 2) : (large ? 22 : 8);
    const hex = event.color || PALETTE[event.kind] || (event.type === 'life-lost' || event.type === 'gameover' ? '#ff648f' : event.type === 'level-clear' || event.type === 'upgrade' ? '#c9ff80' : '#66eff0');
    const originX = Number.isFinite(event.x) ? event.x - 50 : 0;
    const originY = Number.isFinite(event.y) ? 70 - event.y : 0;
    for (let i = 0; i < count; i++) {
      const particle = particles[particleCursor++ % particleCapacity];
      const angle = i / count * Math.PI * 2 + Math.random() * 0.2;
      const speed = large ? 10 + Math.random() * 18 : 4 + Math.random() * 9;
      Object.assign(particle, { life: reducedMotion ? 0.25 : large ? 0.65 : 0.3, maxLife: reducedMotion ? 0.25 : large ? 0.65 : 0.3, x: originX, y: originY, z: 4.5, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, vz: reducedMotion ? 0 : 2 + Math.random() * 10, size: large ? 0.7 + Math.random() * 0.8 : 0.5 });
      particle.color.set(hex);
    }
    if (!reducedMotion && ['brick-break','life-lost','level-clear'].includes(event.type)) cameraImpulse = Math.max(cameraImpulse, event.type === 'brick-break' ? 0.12 : 0.22);
  }

  function updateParticles(dt) {
    particles.forEach((particle, i) => {
      particle.life = Math.max(0, particle.life - dt);
      if (particle.life > 0) {
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.z += particle.vz * dt;
        particle.vz -= dt * 12;
        transform.position.set(particle.x, particle.y, particle.z);
        transform.rotation.set(elapsed * 2 + i, elapsed + i, 0);
        transform.scale.setScalar(particle.size * particle.life / particle.maxLife);
      } else transform.scale.setScalar(0);
      transform.updateMatrix();
      particleMesh.setMatrixAt(i, transform.matrix);
      particleMesh.setColorAt(i, particle.color);
    });
    particleMesh.instanceMatrix.needsUpdate = true;
    particleMesh.instanceColor.needsUpdate = true;
  }

  function updateTrails() {
    trailCount = 0;
    maps.balls.forEach(entry => {
      for (let j = 0; j < entry.validTrail && trailCount < trailCapacity; j++) {
        transform.position.copy(entry.trail[j]);
        transform.rotation.set(0, 0, 0);
        transform.scale.setScalar((1 - j / entry.trail.length) * entry.group.scale.x * 0.6);
        transform.updateMatrix();
        trails.setMatrixAt(trailCount++, transform.matrix);
      }
    });
    for (let i = trailCount; i < trailCapacity; i++) {
      transform.scale.setScalar(0); transform.updateMatrix(); trails.setMatrixAt(i, transform.matrix);
    }
    trails.instanceMatrix.needsUpdate = true;
  }

  const viewDirection = new THREE.Vector3(0, -0.27, 1).normalize();
  let fittedDistance = 210;
  const arenaCorners = [];
  [-54,54].forEach(x => [-74,74].forEach(y => [-6,8].forEach(z => arenaCorners.push(new THREE.Vector3(x,y,z)))));
  function positionCamera(shake = 0) {
    camera.position.copy(viewDirection).multiplyScalar(fittedDistance);
    if (shake) camera.position.x += Math.sin(elapsed * 55) * shake;
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
  }

  function resize() {
    if (disposed || contextLost) return;
    const bounds = container.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.floor(bounds.width || container.clientWidth || 1));
    const nextHeight = Math.max(1, Math.floor(bounds.height || container.clientHeight || 1));
    if (nextWidth === width && nextHeight === height) return;
    width = nextWidth; height = nextHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    fittedDistance = Math.max(120, 100 / camera.aspect);
    for (let attempt = 0; attempt < 30; attempt++) {
      camera.far = Math.max(1400, fittedDistance * 4);
      camera.updateProjectionMatrix();
      positionCamera();
      const fits = arenaCorners.every(corner => {
        const projected = corner.clone().project(camera);
        return Math.abs(projected.x) < 0.93 && Math.abs(projected.y) < 0.93 && projected.z < 1;
      });
      if (fits) break;
      fittedDistance *= 1.12;
    }
    camera.far = Math.max(1400, fittedDistance * 4);
    camera.updateProjectionMatrix();
    positionCamera();
  }

  function screenToWorld(clientX, clientY) {
    if (disposed || contextLost) return null;
    resize();
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    pointer.set((clientX - bounds.left) / bounds.width * 2 - 1, -(clientY - bounds.top) / bounds.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    if (!raycaster.ray.intersectPlane(aimPlane, rayHit)) return null;
    return { x: Math.max(0, Math.min(100, rayHit.x + 50)), y: Math.max(0, Math.min(140, 70 - rayHit.y)) };
  }

  function render(state, events = [], dt = 0) {
    if (disposed || contextLost || !state) return;
    resize();
    dt = Math.max(0, Math.min(Number.isFinite(dt) ? dt : 0, 0.05));
    elapsed += dt;
    if (state.level !== currentLevel) { currentLevel = state.level; clearLevel(); }
    const p = state.paddle || { x: 50, y: 130, width: 18, height: 2.5 };
    logicalPosition(paddle, p.x, p.y, 3);
    paddleBody.scale.set(p.width || 18, p.height || 2.5, 3);
    paddleGlow.scale.set((p.width || 18) + 2, (p.height || 2.5) + 1.6, 3.3);
    paddleStripe.position.set(0, 0, 1.7);
    paddleStripe.scale.set((p.width || 18) * 0.75, 0.35, 0.3);
    paddleMaterial.emissiveIntensity = state.effects?.laser > 0 ? 1.6 : 0.8;
    shield.visible = (state.effects?.shield || 0) > 0;
    shield.material.opacity = reducedMotion ? 0.5 : 0.5 + Math.sin(elapsed * 5) * 0.12;
    syncMap(maps.bricks, state.bricks, createBrick, updateBrick, brick => brick.alive !== false && brick.hp > 0);
    syncMap(maps.balls, state.balls, createBall, (entry, ball) => {
      logicalPosition(entry.group, ball.x, ball.y, 4);
      entry.group.scale.setScalar(ball.radius || 1.2);
      entry.core.material = state.effects?.pierce > 0 ? pierceMaterial : ballMaterial;
      if (ball.attached) entry.validTrail = 0;
      else if (state.phase === 'playing' && dt > 0) {
        for (let i = entry.trail.length - 1; i > 0; i--) entry.trail[i].copy(entry.trail[i-1]);
        entry.trail[0].copy(entry.group.position);
        entry.validTrail = Math.min(entry.trail.length, entry.validTrail + 1);
      }
    });
    syncMap(maps.drops, state.drops, createDrop, updateDrop);
    syncMap(maps.shots, state.shots, () => { const group = new THREE.Group(); group.userData.kind = "shot"; mesh(cylinder,shotMaterial,group); return {group}; }, (entry, shot) => logicalPosition(entry.group,shot.x,shot.y,4));
    (events || []).forEach(burst);
    updateParticles(dt);
    updateTrails();
    cameraImpulse = Math.max(0, cameraImpulse - dt);
    positionCamera(cameraImpulse * 1.2);
    renderer.render(scene, camera);
  }

  function onContextLost(event) {
    event.preventDefault();
    contextLost = true;
    container.dispatchEvent(new CustomEvent('breakout:render-error', { bubbles: true, detail: { mode: '3d', message: '3D 렌더링 연결이 끊어졌습니다. 2D 모드로 전환해 주세요.' } }));
  }
  canvas.addEventListener('webglcontextlost', onContextLost);

  function dispose() {
    if (disposed) return;
    disposed = true;
    canvas.removeEventListener('webglcontextlost', onContextLost);
    clearLevel();
    instances.forEach(instance => instance.dispose());
    geometries.forEach(shape => shape.dispose());
    textures.forEach(texture => texture.dispose());
    materials.forEach(appearance => appearance.dispose());
    renderer.dispose();
    canvas.remove();
  }

  resize();
  // Hide all uninitialized instance slots before the first engine render.
  updateParticles(0);
  updateTrails();
  return { canvas, resize, render, screenToWorld, dispose };
}
