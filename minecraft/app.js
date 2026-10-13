import * as THREE from "./libs/three.module.js";

const dom = {
  viewport: document.getElementById("viewport"),
  characterList: document.getElementById("character-list"),
  selectedName: document.getElementById("selected-name"),
  selectedDescription: document.getElementById("selected-description"),
  playerPos: document.getElementById("player-pos"),
  focusName: document.getElementById("focus-name"),
  attackState: document.getElementById("attack-state"),
  crystals: document.getElementById("crystal-count"), time: document.getElementById("time-left"),
  health: document.getElementById("health-value"), healthBar: document.getElementById("health-bar"),
  message: document.getElementById("game-message"), overlay: document.getElementById("game-overlay"),
  overlayTitle: document.getElementById("overlay-title"), overlayDescription: document.getElementById("overlay-description"),
  overlayLabel: document.getElementById("overlay-label"), start: document.getElementById("start-button"),
  pause: document.getElementById("pause-button"), restart: document.getElementById("restart-button"),
  stage: document.getElementById("stage-number"), missionSummary: document.getElementById("mission-summary"),
  missionGoal: document.getElementById("mission-goal"), stageTitle: document.getElementById("stage-title")
};

const characters = [
  {
    id: "explorer",
    name: "탐험가",
    role: "빠른 이동 · HP 180",
    description: "이동 속도 8.6. 그림자를 따돌리며 빠르게 조각을 모으세요.",
    colors: { hair: "#4d2d18", skin: "#f2c39b", shirt: "#e67e22", pants: "#2f5fa7" }
  },
  {
    id: "farmer",
    name: "농부",
    role: "튼튼한 체력 · HP 240",
    description: "체력 240. 여유 있게 길을 탐색하는 모험가에게 추천합니다.",
    colors: { hair: "#d3a24f", skin: "#f0c89d", shirt: "#7eb356", pants: "#6d4c41" }
  },
  {
    id: "knight",
    name: "기사",
    role: "강력한 파동 · HP 200",
    description: "파동 피해 55. 다가오는 그림자 수호자를 빠르게 물리치세요.",
    colors: { hair: "#6f7684", skin: "#edc19d", shirt: "#a8b6c9", pants: "#7e2635" }
  }
];

const scene = new THREE.Scene();
scene.background = new THREE.Color("#8fd8ff");
scene.fog = new THREE.Fog("#93d9ff", 22, 75);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 180);
camera.position.set(0, 7, 10);

let renderer;
try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
catch (error) {
  dom.overlay.hidden = true;
  dom.viewport.innerHTML = '<p class="renderer-error" role="alert">3D 화면을 시작할 수 없습니다. 브라우저의 하드웨어 가속을 켜고 새로고침해 주세요. 이 게임은 WebGL을 지원하는 브라우저에서 실행됩니다.</p>';
  dom.message.textContent = "3D 렌더러를 사용할 수 없습니다.";
  dom.start.disabled = true;
  dom.restart.disabled = true;
  throw error;
}
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
dom.viewport.appendChild(renderer.domElement);

const clock = new THREE.Clock();
const keys = new Set();
const worldBounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };
const entities = [];
const treeObstacles = [];
const crystals = [];
const portalPosition = new THREE.Vector3(0, 0, 5);
const game = { phase: "ready", stage: 1, side: 40, crystalTarget: 8, sentinelTarget: 3, duration: 120, remaining: 120, collected: 0, elapsed: 0 };
let campaignRoot;
let batches = {};
let sun;
const instanceTransform = new THREE.Object3D();
const instanceColor = new THREE.Color();
const instanceOffset = new THREE.Vector3();
let portal;
const safeSpawn = new THREE.Vector3(0, 0, 5);


const player = {
  group: new THREE.Group(),
  speed: 7.4,
  selectedId: characters[0].id,
  yaw: 0,
  isMoving: false,
  moveDirection: new THREE.Vector3(0, 0, 1),
  walkTime: 0,
  parts: {},
  health: 180,
  maxHealth: 180,
  hurtCooldown: 0
};

const attackState = {
  range: 3.2,
  cooldownSec: 0.48,
  cooldown: 0,
  damage: 34,
  pulseTime: 0
};

let lastResizeWidth = 0;
let lastResizeHeight = 0;
const cameraOffset = new THREE.Vector3(12, 10.5, 14);
const cameraFocus = new THREE.Vector3();
const cameraForward = new THREE.Vector3(-cameraOffset.x, 0, -cameraOffset.z).normalize();
const cameraRight = new THREE.Vector3().crossVectors(cameraForward, new THREE.Vector3(0, 1, 0)).normalize();

const attackPulse = new THREE.Mesh(
  new THREE.RingGeometry(0.6, 1.45, 24),
  new THREE.MeshBasicMaterial({
    color: "#ffd26a",
    transparent: true,
    opacity: 0
  })
);
attackPulse.rotation.x = -Math.PI / 2;
attackPulse.position.y = 0.12;
scene.add(attackPulse);

init();

function init() {
  setupLights();
  rebuildCampaignMap();
  setupPlayer();
  renderCharacterButtons();
  updateSelectedCharacter(player.selectedId);
  bindEvents();
  resizeRenderer();
  animate();
}

function setupLights() {
  const hemi = new THREE.HemisphereLight("#bde8ff", "#5e8f43", 0.95);
  scene.add(hemi);

  sun = new THREE.DirectionalLight("#fff6d6", 1.22);
  sun.position.set(16, 24, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 90;
  scene.add(sun);
}

function rebuildCampaignMap() {
  if (campaignRoot) {
    // Release every stage-owned resource exactly once, including shared batches.
    const geometries = new Set();
    const materials = new Set();
    campaignRoot.traverse((node) => {
      if (node.geometry) geometries.add(node.geometry);
      if (node.material) (Array.isArray(node.material) ? node.material : [node.material]).forEach(material => materials.add(material));
      if (node.isInstancedMesh) node.dispose();
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    scene.remove(campaignRoot);
  }
  campaignRoot = new THREE.Group();
  scene.add(campaignRoot);
  entities.length = 0;
  treeObstacles.length = 0;
  crystals.length = 0;
  batches = {};
  const half = game.side / 2;
  Object.assign(worldBounds, { minX: -half, maxX: half, minZ: -half, maxZ: half });
  scene.fog.near = 22 * (game.side / 40);
  scene.fog.far = 75 * (game.side / 40);
  camera.far = Math.max(180, game.side * 3);
  camera.updateProjectionMatrix();
  sun.shadow.camera.left = sun.shadow.camera.bottom = -half * 1.5;
  sun.shadow.camera.right = sun.shadow.camera.top = half * 1.5;
  sun.shadow.camera.far = Math.max(90, game.side * 3);
  sun.shadow.camera.updateProjectionMatrix();
  sun.position.set(game.side * 0.4, game.side * 0.6, game.side * 0.25);
  setupGround();
  setupWorldObjects();
  setupMission();
  syncMissionInstances();
  updateMissionCopy();
}

function setupGround() {
  const terrainSize = game.side * 3;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(terrainSize, terrainSize), new THREE.MeshStandardMaterial({ color: "#77b654" }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  campaignRoot.add(ground);
  campaignRoot.userData.ground = ground;
  const grid = new THREE.GridHelper(terrainSize, 60, "#6da252", "#70ab57");
  grid.position.y = 0.01;
  campaignRoot.add(grid);
  // Decorative grass stays at a fixed draw-call cost as the map expands.
  const grass = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), new THREE.MeshStandardMaterial({color:"#66a948"}), 80);
  for (let i=0;i<80;i++) {
    instanceTransform.position.set((Math.random()-0.5)*game.side,0.125,(Math.random()-0.5)*game.side);
    instanceTransform.rotation.set(0,0,0);
    instanceTransform.scale.setScalar(1);
    instanceTransform.updateMatrix();
    grass.setMatrixAt(i,instanceTransform.matrix);
  }
  grass.receiveShadow = true;
  campaignRoot.add(grass);
}

function setupWorldObjects() {
  addHouse("집", 0, 0);
  addTree("나무", -10, -10);
  addTree("나무", -11, -2);
  addTree("나무", -4, 8);
  addTree("나무", 9, -9);
  addTree("나무", 11, -3);
  addAnimal("고양이", "cat", 5, -1, "#e0b07b", "#7a4d2f", 0.8);
  addAnimal("말", "horse", 10, 5, "#8d5c3d", "#5f3a24", 1.2);
  addAnimal("소", "cow", -5, 6, "#f2f0eb", "#4c3424", 1.1);
  addAnimal("돼지", "pig", 2, 7, "#f1a5b6", "#e78ba1", 1.0);
  addAnimal("닭", "chicken", 6, 4, "#f7f7f5", "#d5402f", 0.72);
  addAnimal("양", "sheep", -9, 3, "#f8f7f3", "#d9d9d4", 1.05);
}

function setupPlayer() {
  player.group.position.copy(safeSpawn);
  scene.add(player.group);
  rebuildPlayerModel(getSelectedCharacter());
}

function renderCharacterButtons() {
  dom.characterList.innerHTML = "";
  characters.forEach((character) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "character-button";
    button.dataset.characterId = character.id;
    button.innerHTML = `<span class="character-name">${character.name}</span><span class="character-role">${character.role}</span>`;
    button.addEventListener("click", () => updateSelectedCharacter(character.id));
    dom.characterList.appendChild(button);
  });
}

function updateSelectedCharacter(characterId) {
  if (game.phase === "playing" || game.phase === "paused") return;
  player.selectedId = characterId;
  const selected = getSelectedCharacter();
  dom.selectedName.textContent = selected.name;
  dom.selectedDescription.textContent = selected.description;
  const stats = { explorer: [8.6, 180, 34], farmer: [7.4, 240, 34], knight: [7.6, 200, 55] }[characterId];
  [player.speed, player.maxHealth, attackState.damage] = stats;
  player.health = player.maxHealth;
  dom.healthBar.max = player.maxHealth;
  rebuildPlayerModel(selected);
  updateHud();
  Array.from(dom.characterList.children).forEach((button) => {
    button.classList.toggle("active", button.dataset.characterId === characterId);
    button.setAttribute("aria-pressed", String(button.dataset.characterId === characterId));
  });
}

function rebuildPlayerModel(character) {
  player.parts = {};

  while (player.group.children.length > 0) {
    const child = player.group.children[0];
    player.group.remove(child);
    if (child.geometry) {
      child.geometry.dispose();
    }
    if (child.material) {
      child.material.dispose();
    }
  }

  const part = (name, w, h, d, color, x, y, z) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color })
    );
    mesh.position.set(x, y, z);
    mesh.userData.basePosition = mesh.position.clone();
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    player.group.add(mesh);
    player.parts[name] = mesh;
  };

  part("leftLeg", 0.58, 0.95, 0.38, character.colors.pants, -0.18, 0.48, 0);
  part("rightLeg", 0.58, 0.95, 0.38, character.colors.pants, 0.18, 0.48, 0);
  part("torso", 1.1, 1.05, 0.62, character.colors.shirt, 0, 1.5, 0);
  part("leftArm", 0.34, 0.92, 0.34, character.colors.skin, -0.75, 1.5, 0);
  part("rightArm", 0.34, 0.92, 0.34, character.colors.skin, 0.75, 1.5, 0);
  part("head", 0.92, 0.88, 0.92, character.colors.skin, 0, 2.48, 0);
  part("hair", 0.96, 0.26, 0.96, character.colors.hair, 0, 2.84, 0);
}

function addTree(label, x, z) {
  x *= game.side / 40; z *= game.side / 40;
  const root = new THREE.Group();
  root.position.set(x, 0, z);

  const trunk = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 2.4, 0.8),
    new THREE.MeshStandardMaterial({ color: "#7b4d26" })
  );
  trunk.position.y = 1.2;
  trunk.castShadow = true;
  root.add(trunk);

  const canopy = [
    [0, 3.1, 0, 2.5],
    [0.9, 2.8, 0, 1.8],
    [-0.9, 2.8, 0, 1.8],
    [0, 2.8, 0.9, 1.8],
    [0, 2.8, -0.9, 1.8]
  ];
  canopy.forEach(([px, py, pz, s], i) => {
    const leaf = new THREE.Mesh(
      new THREE.BoxGeometry(s, s, s),
      new THREE.MeshStandardMaterial({ color: i % 2 === 0 ? "#3b7d32" : "#4d9a43" })
    );
    leaf.position.set(px, py, pz);
    leaf.castShadow = true;
    root.add(leaf);
  });

  campaignRoot.add(root);
  registerEntity(label, "tree", root, 90);
}

function addHouse(label, x, z) {
  const root = new THREE.Group();
  root.position.set(x, 0, z);

  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(6, 3.2, 5.5),
    new THREE.MeshStandardMaterial({ color: "#d8c19a" })
  );
  walls.position.y = 1.6;
  walls.castShadow = true;
  walls.receiveShadow = true;
  root.add(walls);

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(4.6, 2.6, 4),
    new THREE.MeshStandardMaterial({ color: "#9b4128" })
  );
  roof.position.y = 4.35;
  roof.rotation.y = Math.PI * 0.25;
  roof.castShadow = true;
  root.add(roof);

  const door = new THREE.Mesh(
    new THREE.BoxGeometry(1.05, 1.7, 0.2),
    new THREE.MeshStandardMaterial({ color: "#7a4f2f" })
  );
  door.position.set(0, 0.85, 2.65);
  root.add(door);

  const windowGeom = new THREE.BoxGeometry(0.9, 0.9, 0.2);
  const windowMat = new THREE.MeshStandardMaterial({ color: "#8ec9f3", emissive: "#213949", emissiveIntensity: 0.24 });
  const windowLeft = new THREE.Mesh(windowGeom, windowMat);
  windowLeft.position.set(-1.6, 1.8, 2.65);
  const windowRight = new THREE.Mesh(windowGeom, windowMat.clone());
  windowRight.position.set(1.6, 1.8, 2.65);
  root.add(windowLeft, windowRight);

  campaignRoot.add(root);
  registerEntity(label, "house", root, 220);
}

function addAnimal(label, type, x, z, bodyColor, patchColor, scale) {
  x *= game.side / 40; z *= game.side / 40;
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  root.scale.setScalar(scale);
  root.rotation.y = Math.random() * Math.PI * 2;

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.45, 0.85, 0.72),
    new THREE.MeshStandardMaterial({ color: bodyColor })
  );
  body.position.y = 0.78;
  body.castShadow = true;
  root.add(body);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(type === "horse" ? 0.72 : 0.62, type === "horse" ? 0.72 : 0.58, 0.62),
    new THREE.MeshStandardMaterial({ color: bodyColor })
  );
  head.position.set(0.95, 0.93, 0);
  head.castShadow = true;
  root.add(head);

  const patch1 = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.26, 0.25),
    new THREE.MeshStandardMaterial({ color: patchColor })
  );
  patch1.position.set(-0.2, 0.82, 0.24);
  const patch2 = patch1.clone();
  patch2.position.set(0.25, 0.75, -0.28);
  root.add(patch1, patch2);

  if (type === "cat") {
    const earGeo = new THREE.BoxGeometry(0.14, 0.16, 0.1);
    const earMat = new THREE.MeshStandardMaterial({ color: patchColor });
    const ear1 = new THREE.Mesh(earGeo, earMat);
    ear1.position.set(1.08, 1.3, 0.15);
    const ear2 = new THREE.Mesh(earGeo, earMat);
    ear2.position.set(1.08, 1.3, -0.15);
    root.add(ear1, ear2);
  }

  if (type === "chicken") {
    const beak = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.1, 0.1),
      new THREE.MeshStandardMaterial({ color: "#f1c232" })
    );
    beak.position.set(1.27, 0.9, 0);
    root.add(beak);
  }

  if (type === "sheep") {
    const wool = new THREE.Mesh(
      new THREE.BoxGeometry(1.72, 1.02, 0.94),
      new THREE.MeshStandardMaterial({ color: "#ffffff" })
    );
    wool.position.y = 0.82;
    wool.castShadow = true;
    root.add(wool);
  }

  for (let i = 0; i < 4; i += 1) {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.62, 0.2),
      new THREE.MeshStandardMaterial({ color: type === "pig" ? "#d17f97" : "#4f3b2f" })
    );
    leg.position.set(-0.45 + (i % 2) * 0.78, 0.31, i < 2 ? -0.23 : 0.23);
    leg.castShadow = true;
    root.add(leg);
  }

  campaignRoot.add(root);
  registerEntity(label, type, root, 110);
}

function registerEntity(label, type, mesh, maxHealth) {
  const dynamicTypes = new Set(["cat", "horse", "cow", "pig", "chicken", "sheep"]);
  const canRoam = dynamicTypes.has(type);
  const roamCenter = mesh.position.clone();
  const speedMap = {
    cat: 2.8,
    horse: 3.8,
    cow: 2.4,
    pig: 2.1,
    chicken: 1.9,
    sheep: 2.2
  };

  entities.push({
    label,
    type,
    mesh,
    health: maxHealth,
    maxHealth,
    alive: true,
    baseY: mesh.position.y,
    movePhase: Math.random() * Math.PI * 2,
    velocity: new THREE.Vector3(),
    canRoam,
    aggressive: false,
    roamCenter,
    roamTarget: roamCenter.clone(),
    roamWait: 0,
    speed: speedMap[type] || 0,
    attackDamage: type === "horse" ? 18 : type === "cow" ? 14 : type === "pig" ? 10 : type === "sheep" ? 11 : type === "chicken" ? 8 : 12,
    attackRange: type === "horse" ? 2.2 : 1.8,
    attackCooldown: 0,
    aggroRange: 10,
    leashRange: 18
  });
  if (type === "tree") treeObstacles.push(entities[entities.length-1]);
}

function bindEvents() {
  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (event.target.closest("button, a, input, select, textarea") && !["p", "r", "escape"].includes(key)) return;
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) {
      event.preventDefault();
      if (game.phase === "playing") keys.add(key);
    }
    if (event.repeat) return;
    if (key === "p" || key === "escape") togglePause();
    if (key === "r") startGame();
    if (key === " " && game.phase === "playing" && attackState.cooldown <= 0) performAttack();
  });
  window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
  window.addEventListener("resize", resizeRenderer);
  window.addEventListener("blur", () => { if (game.phase === "playing") togglePause(); clearInput(); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && game.phase === "playing") togglePause();
  });
  dom.start.addEventListener("click", () => {
    if (game.phase === "error") window.location.reload();
    else if (game.phase === "paused") resumeGame();
    else if (game.phase === "won") advanceMission();
    else startGame();
  });
  dom.restart.addEventListener("click", startGame);
  dom.pause.addEventListener("click", togglePause);
  document.querySelectorAll("[data-key]").forEach((button) => {
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      if (game.phase !== "playing") return;
      button.setPointerCapture(event.pointerId);
      keys.add(button.dataset.key);
      button.classList.add("pressed");
    });
    const release = () => { keys.delete(button.dataset.key); button.classList.remove("pressed"); };
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
  });
  document.getElementById("touch-attack").addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (game.phase === "playing" && attackState.cooldown <= 0) performAttack();
  });
  document.getElementById("touch-attack").addEventListener("click", (event) => {
    if (event.detail === 0 && game.phase === "playing" && attackState.cooldown <= 0) performAttack();
  });
  renderer.domElement.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    game.phase = "error";
    clearInput();
    showOverlay("RENDERER PAUSED", "3D 화면 연결이 끊겼습니다", "브라우저 탭을 새로고침해서 게임을 다시 시작해 주세요.", "새로고침");
    dom.start.disabled = false;
    dom.restart.disabled = true;
    dom.pause.disabled = true;
  });
  renderer.domElement.addEventListener("webglcontextrestored", () => window.location.reload());
}

function clearInput() {
  keys.clear();
  document.querySelectorAll(".pressed").forEach((button) => button.classList.remove("pressed"));
}

function showOverlay(label, title, description, action) {
  dom.overlayLabel.textContent = label;
  dom.overlayTitle.textContent = title;
  dom.overlayDescription.textContent = description;
  dom.start.textContent = action;
  dom.overlay.querySelector(".overlay-hint").textContent = game.phase === "ready" ? "먼저 캐릭터를 선택해 주세요." : "캐릭터 선택은 새 모험 전에 변경할 수 있습니다.";
  dom.overlay.hidden = false;
  dom.start.focus({ preventScroll: true });
}

function startGame() {
  if (game.phase === "error") return;
  clearInput();
  Object.assign(game, { phase: "playing", remaining: game.duration, collected: 0, elapsed: 0 });
  player.health = player.maxHealth;
  player.hurtCooldown = 0;
  player.isMoving = false;
  player.walkTime = 0;
  player.group.position.copy(safeSpawn);
  player.moveDirection.set(0, 0, 1);
  player.yaw = 0;
  attackState.cooldown = 0;
  attackState.pulseTime = 0;
  entities.forEach((entity) => {
    entity.health = entity.maxHealth;
    entity.alive = true;
    entity.mesh.visible = true;
    entity.mesh.position.copy(entity.roamCenter);
    entity.roamTarget.copy(entity.roamCenter);
    entity.velocity.set(0, 0, 0);
    entity.attackCooldown = 0;
    entity.roamWait = 0;
    entity.mesh.userData.flashUntil = 0;
    entity.aggressive = entity.type === "sentinel";
  });
  crystals.forEach((crystal) => { crystal.collected = false; crystal.mesh.visible = true; });
  dom.overlay.hidden = true;
  dom.pause.disabled = false;
  dom.pause.textContent = "일시정지";
  setCharacterDisabled(true);
  dom.message.textContent = `미션 ${game.stage} 시작! 조각 ${game.crystalTarget}개를 모으고 포털로 귀환하세요. 수호자 ${game.sentinelTarget}마리를 조심하세요.`;
  syncMissionInstances();
  camera.position.copy(player.group.position).add(cameraOffset);
  cameraFocus.copy(player.group.position).add(new THREE.Vector3(0, 1.7, 0));
  clock.getDelta();
  dom.viewport.focus({ preventScroll: true });
  updateHud();
}

function setCharacterDisabled(disabled) {
  Array.from(dom.characterList.children).forEach((button) => { button.disabled = disabled; });
}

function togglePause() {
  if (game.phase === "paused") return resumeGame();
  if (game.phase !== "playing") return;
  game.phase = "paused";
  clearInput();
  dom.pause.textContent = "계속하기";
  showOverlay("TAKE A BREATH", "잠시 쉬어 가세요", "시간과 그림자 수호자가 멈췄습니다. 준비되면 모험을 이어가세요.", "계속 플레이 →");
}

function resumeGame() {
  game.phase = "playing";
  dom.overlay.hidden = true;
  dom.pause.textContent = "일시정지";
  clearInput();
  clock.getDelta();
  dom.viewport.focus({ preventScroll: true });
}

function advanceMission() {
  if (game.phase !== "won") return;
  game.stage += 1;
  game.side *= 1.5;
  game.crystalTarget = Math.ceil(game.crystalTarget * 1.5);
  game.sentinelTarget = Math.ceil(game.sentinelTarget * 1.5);
  // Time grows only 25% while map sides and goals grow 50%, raising the challenge.
  game.duration = Math.ceil(game.duration * 1.25);
  rebuildCampaignMap();
  startGame();
}

function updateMissionCopy() {
  dom.stage.textContent = String(game.stage).padStart(2,"0");
  dom.stageTitle.textContent = `미션 ${game.stage} · 마을 복구 작전`;
  dom.missionGoal.textContent = `빛나는 조각 ${game.crystalTarget}개를 수집`;
  dom.missionSummary.textContent = `${formatSize(game.side)} × ${formatSize(game.side)} MAP · 조각 ${game.crystalTarget}개 · 수호자 ${game.sentinelTarget}마리 · 제한 ${game.duration}초`;
}

function formatSize(side) {
  return Number(side.toFixed(2)).toLocaleString("ko-KR");
}

function finishGame(won) {
  game.phase = won ? "won" : "lost";
  clearInput();
  dom.pause.disabled = true;
  setCharacterDisabled(false);
  const description = won ? `조각 ${game.crystalTarget}개를 되찾아 미션 ${game.stage} 완료! 다음 미션은 MAP 한 변 ${formatSize(game.side*1.5)}, 조각 ${Math.ceil(game.crystalTarget*1.5)}개, 수호자 ${Math.ceil(game.sentinelTarget*1.5)}마리로 확장됩니다. 제한시간은 ${Math.ceil(game.duration*1.25)}초이며 수호자도 더 강해집니다.` : player.health <= 0 ? "체력이 모두 소진되었습니다. 같은 미션에서 파동을 사용하거나 빠르게 이동해 그림자를 따돌려 보세요." : `시간이 끝났습니다. 조각 ${game.collected}/${game.crystalTarget}개를 모았습니다. 같은 미션에 다시 도전하세요.`;
  showOverlay(won ? `MISSION ${game.stage} COMPLETE` : "TRY AGAIN", won ? "더 넓은 세계로 떠나세요!" : "다음 도전을 준비하세요", description, won ? `미션 ${game.stage+1} 시작 →` : `미션 ${game.stage} 다시 도전 →`);
  dom.message.textContent = won ? "미션 성공! 다음 미션은 MAP·조각·수호자가 각각 50% 증가합니다. 다시 시작 버튼은 현재 미션을 재도전합니다." : `미션 ${game.stage} 종료. 같은 MAP에서 다시 도전할 수 있습니다.`;
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (game.phase === "playing") {
    game.elapsed += dt;
    game.remaining = Math.max(0, game.remaining - dt);
    updatePlayer(dt);
    updateEntities(dt);
    updateAttack(dt);
    if (game.phase === "playing") updateMission(dt);
  }
  syncMissionInstances();
  updateCamera(dt);
  updateHud();
  resizeRenderer();
  if (game.phase !== "error") renderer.render(scene, camera);
}

function updatePlayer(dt) {
  const inputX = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
  const inputForward = (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0);
  const move = new THREE.Vector3();

  if (inputX !== 0) {
    move.addScaledVector(cameraRight, inputX);
  }
  if (inputForward !== 0) {
    move.addScaledVector(cameraForward, inputForward);
  }

  if (move.lengthSq() > 0) {
    move.normalize().multiplyScalar(player.speed * dt);
    const previous = player.group.position.clone();
    player.group.position.add(move);
    resolveObstacles(player.group.position, previous);
    player.group.position.x = clamp(player.group.position.x, worldBounds.minX, worldBounds.maxX);
    player.group.position.z = clamp(player.group.position.z, worldBounds.minZ, worldBounds.maxZ);
    player.yaw = Math.atan2(move.x, move.z);
    player.moveDirection.copy(move).normalize();
    player.isMoving = true;
  } else {
    player.isMoving = false;
  }

  player.group.rotation.y = player.yaw;
  if (player.hurtCooldown > 0) {
    player.hurtCooldown = Math.max(0, player.hurtCooldown - dt);
  }
  updatePlayerAnimation(dt);
}

function updateEntities(dt) {
  const now = game.elapsed;
  const playerPos = player.group.position.clone();

  entities.forEach((entity) => {
    if (!entity.mesh.visible) {
      return;
    }

    if (entity.attackCooldown > 0) {
      entity.attackCooldown = Math.max(0, entity.attackCooldown - dt);
    }

    if (entity.alive && (entity.canRoam || entity.type === "sentinel")) {
      updateEntityBehavior(entity, playerPos, dt);

      const bob = Math.sin(now * 2.4 + entity.movePhase) * 0.03;
      entity.mesh.position.y = entity.baseY + bob;
    }

    if (entity.velocity.lengthSq() > 0.00001) {
      entity.mesh.position.addScaledVector(entity.velocity, dt * 60);
      entity.velocity.multiplyScalar(0.82);
      entity.mesh.position.x = clamp(entity.mesh.position.x, worldBounds.minX + 1, worldBounds.maxX - 1);
      entity.mesh.position.z = clamp(entity.mesh.position.z, worldBounds.minZ + 1, worldBounds.maxZ - 1);
    }
  });
}

function updateAttack(dt) {
  if (attackState.cooldown > 0) {
    attackState.cooldown = Math.max(0, attackState.cooldown - dt);
  }

  if (attackState.pulseTime > 0) {
    attackState.pulseTime = Math.max(0, attackState.pulseTime - dt * 2.8);
    const t = attackState.pulseTime;
    attackPulse.material.opacity = t * 0.65;
    const s = 1 + (1 - t) * 1.2;
    attackPulse.scale.setScalar(s);
  } else {
    attackPulse.material.opacity = 0;
  }
}

function updateEntityBehavior(entity, playerPos, dt) {
  const deltaToPlayer = playerPos.clone().sub(entity.mesh.position).setY(0);
  const distanceToPlayer = deltaToPlayer.length();

  if (entity.aggressive) {
    if (entity.type !== "sentinel" && distanceToPlayer > entity.leashRange) {
      entity.aggressive = false;
      entity.roamTarget.copy(entity.roamCenter);
    } else if (distanceToPlayer > entity.attackRange) {
      const chaseStep = deltaToPlayer.normalize().multiplyScalar(entity.speed * dt);
      const previous = entity.mesh.position.clone();
      entity.mesh.position.add(chaseStep);
      resolveObstacles(entity.mesh.position, previous);
      entity.mesh.rotation.y = Math.atan2(chaseStep.x, chaseStep.z);
    } else if (entity.attackCooldown <= 0) {
      entity.mesh.rotation.y = Math.atan2(deltaToPlayer.x, deltaToPlayer.z);
      damagePlayer(entity.attackDamage, entity);
      entity.attackCooldown = 1.05;
      const push = playerPos.clone().sub(entity.mesh.position).setY(0).normalize().multiplyScalar(0.18);
      entity.velocity.add(push);
    }
    entity.mesh.position.x = clamp(entity.mesh.position.x, worldBounds.minX + 1, worldBounds.maxX - 1);
    entity.mesh.position.z = clamp(entity.mesh.position.z, worldBounds.minZ + 1, worldBounds.maxZ - 1);
    return;
  }

  if (entity.roamWait > 0) {
    entity.roamWait = Math.max(0, entity.roamWait - dt);
    return;
  }

  const toTarget = entity.roamTarget.clone().sub(entity.mesh.position).setY(0);
  if (toTarget.length() < 0.6) {
    entity.roamTarget.copy(pickRoamTarget(entity.roamCenter, entity.type));
    entity.roamWait = 0.35 + Math.random() * 1.4;
    return;
  }

  const roamStep = toTarget.normalize().multiplyScalar(entity.speed * dt * 0.65);
  const previous = entity.mesh.position.clone();
  entity.mesh.position.add(roamStep);
  resolveObstacles(entity.mesh.position, previous);
  entity.mesh.rotation.y = Math.atan2(roamStep.x, roamStep.z);
  entity.mesh.position.x = clamp(entity.mesh.position.x, worldBounds.minX + 1, worldBounds.maxX - 1);
  entity.mesh.position.z = clamp(entity.mesh.position.z, worldBounds.minZ + 1, worldBounds.maxZ - 1);
}

function updateCamera(dt) {
  const target = player.group.position.clone().add(cameraOffset);
  const lookAhead = player.isMoving
    ? player.moveDirection.clone().multiplyScalar(2.4)
    : player.moveDirection.clone().multiplyScalar(1.2);
  const desiredFocus = player.group.position.clone().add(new THREE.Vector3(0, 1.7, 0)).add(lookAhead);

  camera.position.lerp(target, Math.min(1, dt * 4.6));
  cameraFocus.lerp(desiredFocus, Math.min(1, dt * 5.4));
  camera.lookAt(cameraFocus);
}

function updatePlayerAnimation(dt) {
  const { leftLeg, rightLeg, leftArm, rightArm, torso, head, hair } = player.parts;
  if (!leftLeg || !rightLeg || !leftArm || !rightArm || !torso || !head || !hair) {
    return;
  }

  if (player.isMoving) {
    player.walkTime += dt * 9.5;
  } else {
    player.walkTime += dt * 4;
  }

  const swing = player.isMoving ? Math.sin(player.walkTime) * 0.75 : 0;
  const bodyBob = player.isMoving ? Math.abs(Math.sin(player.walkTime * 2)) * 0.08 : 0;
  const headTilt = player.isMoving ? Math.sin(player.walkTime) * 0.06 : 0;

  leftLeg.rotation.x = swing;
  rightLeg.rotation.x = -swing;
  leftArm.rotation.x = -swing * 0.6;
  rightArm.rotation.x = swing * 0.6;

  torso.position.y = torso.userData.basePosition.y + bodyBob;
  head.position.y = head.userData.basePosition.y + bodyBob;
  hair.position.y = hair.userData.basePosition.y + bodyBob;
  head.rotation.z = headTilt;
  hair.rotation.z = headTilt;
}

function updateHud() {
  dom.playerPos.textContent = `위치: (${player.group.position.x.toFixed(1)}, ${player.group.position.z.toFixed(1)})`;
  dom.crystals.textContent = `${game.collected} / ${game.crystalTarget}`;
  const remaining = Math.ceil(game.remaining);
  dom.time.textContent = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
  dom.health.textContent = String(Math.ceil(player.health));
  dom.healthBar.value = player.health;
  let nearest = null;
  let nearestDistance = Infinity;
  for (const crystal of crystals) {
    if (crystal.collected) continue;
    const distance = crystal.mesh.position.distanceToSquared(player.group.position);
    if (distance < nearestDistance) { nearest = crystal; nearestDistance = distance; }
  }
  const destination = nearest ? nearest.mesh.position : portalPosition;
  const delta = destination.clone().sub(player.group.position).setY(0);
  const angle = Math.atan2(delta.dot(cameraRight), delta.dot(cameraForward));
  const arrows = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
  const arrow = arrows[(Math.round(angle/(Math.PI/4))+8)%8];
  dom.focusName.textContent = `${nearest ? "가까운 조각" : "귀환 포털"}: ${arrow} ${Math.round(delta.length())}m`;
  dom.attackState.textContent = attackState.cooldown > 0 ? `파동 충전 ${attackState.cooldown.toFixed(1)}초` : "파동 준비됨";
}

function performAttack() {
  if (game.phase !== "playing" || attackState.cooldown > 0) return;
  attackState.cooldown = attackState.cooldownSec;
  attackState.pulseTime = 1;

  const playerPos = player.group.position.clone();
  const forward = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw)).normalize();
  const attackCenter = playerPos.clone().addScaledVector(forward, 1.7);
  attackPulse.position.set(attackCenter.x, 0.12, attackCenter.z);
  attackPulse.lookAt(attackCenter.x + forward.x, 0.12, attackCenter.z + forward.z);
  attackPulse.rotation.x = -Math.PI / 2;

  const hitTargets = entities.filter((entity) => {
    if (entity.type !== "sentinel" || !entity.alive || !entity.mesh.visible) {
      return false;
    }
    const delta = entity.mesh.position.clone().sub(playerPos);
    const horizontal = new THREE.Vector3(delta.x, 0, delta.z);
    if (horizontal.length() > attackState.range) {
      return false;
    }
    if (horizontal.length() < 0.001) {
      return true;
    }
    return horizontal.normalize().dot(forward) >= 0.1;
  });

  hitTargets.forEach((target) => {
    target.health -= attackState.damage;
    target.aggressive = true;
    flashEntity(target.mesh);

    const push = target.mesh.position.clone().sub(playerPos).setY(0);
    if (push.lengthSq() < 0.001) {
      push.set(0.001, 0, 1);
    }
    push.normalize().multiplyScalar(0.24);
    target.velocity.add(push);

    if (target.health <= 0) {
      target.alive = false;
      target.mesh.visible = false;
      dom.message.textContent = "그림자 수호자를 물리쳤습니다. 조각을 계속 찾아보세요.";
    }
  });
}

function flashEntity(root) {
  root.userData.flashUntil = game.elapsed + 0.1;
  root.traverse((node) => {
    if (!node.isMesh || !node.material || !node.material.color) {
      return;
    }
    if (!node.userData.baseColor) {
      node.userData.baseColor = node.material.color.clone();
    }
    node.material.color.set("#ff7777");
    setTimeout(() => {
      if (node.material && node.userData.baseColor) {
        node.material.color.copy(node.userData.baseColor);
      }
    }, 100);
  });
}

function getNearestAliveEntity() {
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  const playerPos = player.group.position;

  entities.forEach((entity) => {
    if (!entity.alive || !entity.mesh.visible) {
      return;
    }
    const distance = entity.mesh.position.distanceTo(playerPos);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entity;
    }
  });

  return best;
}

function damagePlayer(amount, attacker) {
  if (game.phase !== "playing" || player.hurtCooldown > 0) {
    return;
  }

  player.health = Math.max(0, player.health - amount);
  player.hurtCooldown = 0.55;
  flashEntity(player.group);

  const attackerPos = attacker.mesh.position.clone();
  const knockback = player.group.position.clone().sub(attackerPos).setY(0);
  if (knockback.lengthSq() > 0.0001) {
    knockback.normalize().multiplyScalar(0.75);
    player.group.position.add(knockback);
    player.group.position.x = clamp(player.group.position.x, worldBounds.minX, worldBounds.maxX);
    player.group.position.z = clamp(player.group.position.z, worldBounds.minZ, worldBounds.maxZ);
  }

  if (player.health <= 0) finishGame(false);

}

function pickRoamTarget(center, type) {
  const radiusMap = {
    cat: 5,
    horse: 8,
    cow: 6,
    pig: 5.5,
    chicken: 4.5,
    sheep: 5.8
  };
  const radius = radiusMap[type] || 5;
  const angle = Math.random() * Math.PI * 2;
  const distance = 1.5 + Math.random() * radius;

  return new THREE.Vector3(
    clamp(center.x + Math.cos(angle) * distance, worldBounds.minX + 1, worldBounds.maxX - 1),
    center.y,
    clamp(center.z + Math.sin(angle) * distance, worldBounds.minZ + 1, worldBounds.maxZ - 1)
  );
}

function resizeRenderer() {
  const width = Math.floor(dom.viewport.clientWidth);
  const height = Math.floor(dom.viewport.clientHeight);
  if (width < 10 || height < 10) {
    return;
  }
  if (width === lastResizeWidth && height === lastResizeHeight) {
    return;
  }

  lastResizeWidth = width;
  lastResizeHeight = height;
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function getSelectedCharacter() {
  return characters.find((character) => character.id === player.selectedId) || characters[0];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function makeBatch(name, geometry, material, count) {
  const batch = new THREE.InstancedMesh(geometry, material, count);
  // Logical positions are updated every frame, including visibility after hits.
  batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  batch.frustumCulled = false;
  batch.castShadow = ["gems", "bodies", "heads"].includes(name);
  batch.receiveShadow = true;
  campaignRoot.add(batch);
  batches[name] = batch;
  return batch;
}

function isAccessiblePosition(x,z,clearance=1.8) {
  if (Math.abs(x)<4.3 && Math.abs(z)<4) return false;
  if (Math.hypot(x-safeSpawn.x,z-safeSpawn.z)<3.5) return false;
  return !treeObstacles.some(entity => Math.hypot(x-entity.mesh.position.x,z-entity.mesh.position.z)<clearance);
}

function stagePosition(index,count,offset=0) {
  const half = game.side/2-2.5;
  // Low-discrepancy sampling spreads objects across the whole expanding map.
  // Reject solid obstacles and the safe starting portal instead of hiding goals.
  let attempt=0;
  while (true) {
    const sample=index+offset+attempt*count;
    const x=(((sample*0.61803398875+0.13)%1)*2-1)*half;
    const z=(((sample*0.41421356237+0.71)%1)*2-1)*half;
    if (isAccessiblePosition(x,z)) return [x,z];
    attempt++;
  }
}

function setupMission() {
  const firstPositions = [[-15,-13],[-13,9],[-5,15],[8,13],[15,7],[15,-12],[3,-13],[-5,-7]];
  for (let index=0;index<game.crystalTarget;index++) {
    const [x,z]=game.stage===1 ? firstPositions[index] : stagePosition(index,game.crystalTarget);
    const transform=new THREE.Object3D();
    transform.position.set(x,1.2,z);
    crystals.push({mesh:transform,collected:false,phase:index});
  }
  makeBatch("gems",new THREE.OctahedronGeometry(0.55),new THREE.MeshStandardMaterial({color:"#ffe279",emissive:"#ffb22b",emissiveIntensity:0.8,roughness:0.22,metalness:0.35}),game.crystalTarget);
  makeBatch("markers",new THREE.CylinderGeometry(0.72,0.72,0.08,20),new THREE.MeshStandardMaterial({color:"#fde8a4",emissive:"#9f701b",emissiveIntensity:0.3}),game.crystalTarget);
  portal=new THREE.Mesh(new THREE.TorusGeometry(1.5,0.16,12,40),new THREE.MeshStandardMaterial({color:"#55e5cd",emissive:"#2eecd3",emissiveIntensity:0.6}));
  portal.rotation.x=-Math.PI/2;
  portal.position.copy(portalPosition).setY(0.17);
  campaignRoot.add(portal);
  const firstEnemies=[[-14,-2],[12,-4],[4,15]];
  for (let index=0;index<game.sentinelTarget;index++) {
    const [x,z]=game.stage===1 ? firstEnemies[index] : stagePosition(index,game.sentinelTarget,game.crystalTarget+7);
    const transform=new THREE.Object3D();
    transform.position.set(x,0,z);
    registerEntity("그림자 수호자","sentinel",transform,100+(game.stage-1)*8);
    const enemy=entities[entities.length-1];
    enemy.aggressive=true;
    enemy.speed=(2.8+(index%3)*0.2)*(1+(game.stage-1)*0.08);
    enemy.attackDamage=24+(game.stage-1)*2;
    enemy.attackRange=1.6;
    enemy.instanceIndex=index;
  }
  makeBatch("bodies",new THREE.BoxGeometry(1.1,1.25,0.85),new THREE.MeshStandardMaterial({color:"#554484",emissive:"#261041",emissiveIntensity:0.35}),game.sentinelTarget);
  makeBatch("heads",new THREE.BoxGeometry(0.85,0.6,0.8),new THREE.MeshStandardMaterial({color:"#393050"}),game.sentinelTarget);
  makeBatch("eyes",new THREE.BoxGeometry(0.17,0.16,0.07),new THREE.MeshBasicMaterial({color:"#ff6eab"}),game.sentinelTarget*2);
  // Fence posts also use a single shared geometry and draw call.
  const half=game.side/2;
  const intervals=Math.ceil(game.side/2);
  const fence=makeBatch("fence",new THREE.BoxGeometry(0.3,0.8,0.3),new THREE.MeshStandardMaterial({color:"#977350"}),intervals*4);
  let index=0;
  for (let i=0;i<intervals;i++) {
    const n=-half+i*game.side/intervals;
    [[n,-half],[half,n],[-n,half],[-half,-n]].forEach(([x,z]) => {
      instanceTransform.position.set(x,0.4,z);
      instanceTransform.rotation.set(0,0,0);
      instanceTransform.scale.setScalar(1);
      instanceTransform.updateMatrix();
      fence.setMatrixAt(index++,instanceTransform.matrix);
    });
  }
}

function setInstance(batch,index,root,x,y,z) {
  instanceTransform.position.copy(root.position);
  instanceTransform.rotation.copy(root.rotation);
  instanceOffset.set(x,y,z).applyQuaternion(root.quaternion);
  instanceTransform.position.add(instanceOffset);
  instanceTransform.scale.setScalar(root.visible ? 1 : 0);
  instanceTransform.updateMatrix();
  batch.setMatrixAt(index,instanceTransform.matrix);
}

function syncMissionInstances() {
  if (!batches.gems) return;
  crystals.forEach((crystal,index) => {
    setInstance(batches.gems,index,crystal.mesh,0,0,0);
    setInstance(batches.markers,index,crystal.mesh,0,-0.9,0);
  });
  entities.forEach(entity => {
    if (entity.type!=="sentinel") return;
    const index=entity.instanceIndex;
    setInstance(batches.bodies,index,entity.mesh,0,0.9,0);
    setInstance(batches.heads,index,entity.mesh,0,1.8,0);
    setInstance(batches.eyes,index*2,entity.mesh,-0.2,1.8,0.42);
    setInstance(batches.eyes,index*2+1,entity.mesh,0.2,1.8,0.42);
    instanceColor.set(entity.mesh.userData.flashUntil>game.elapsed ? "#ff7777" : "#ffffff");
    batches.bodies.setColorAt(index,instanceColor);
    batches.heads.setColorAt(index,instanceColor);
  });
  ["gems","markers","bodies","heads","eyes"].forEach(name => {batches[name].instanceMatrix.needsUpdate=true;});
  batches.bodies.instanceColor.needsUpdate=true;
  batches.heads.instanceColor.needsUpdate=true;
}

function updateMission() {
  crystals.forEach((crystal) => {
    if (crystal.collected) return;
    crystal.mesh.rotation.y += 0.02;
    crystal.mesh.position.y = 1.2 + Math.sin(game.elapsed*3+crystal.phase)*0.14;
    const distance = new THREE.Vector2(crystal.mesh.position.x-player.group.position.x, crystal.mesh.position.z-player.group.position.z).length();
    if (distance < 1.4) {
      crystal.collected = true;
      crystal.mesh.visible = false;
      game.collected += 1;
      dom.message.textContent = game.collected === game.crystalTarget ? "모든 조각을 찾았습니다! 집 앞 청록색 포털로 돌아오세요." : `에너지 조각 ${game.collected}/${game.crystalTarget} 수집! 체력이 12 회복되었습니다.`;
      player.health = Math.min(player.maxHealth,player.health+12);
    }
  });
  portal.material.emissiveIntensity = game.collected === game.crystalTarget ? 1.5 : 0.4;
  const portalDistance = new THREE.Vector2(player.group.position.x,player.group.position.z-5).length();
  if (player.health <= 0) return finishGame(false);
  if (game.collected === game.crystalTarget && portalDistance < 1.8) return finishGame(true);
  if (game.remaining <= 0) finishGame(false);
}

function resolveObstacles(position, previous) {
  // A solid house and tree trunks keep navigation grounded in the visible world.
  if (Math.abs(position.x) < 3.55 && Math.abs(position.z) < 3.3) {
    if (Math.abs(previous.x) >= 3.55) position.x = Math.sign(previous.x)*3.55;
    else position.z = (Math.sign(previous.z) || 1)*3.3;
  }
  treeObstacles.forEach(entity => {
    const dx = position.x-entity.mesh.position.x;
    const dz = position.z-entity.mesh.position.z;
    const distance = Math.hypot(dx,dz);
    if (distance < 1.1) {
      if (distance < 0.01) { position.copy(previous); return; }
      position.x = entity.mesh.position.x + dx/distance*1.1;
      position.z = entity.mesh.position.z + dz/distance*1.1;
    }
  });
}
