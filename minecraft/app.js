import * as THREE from "./libs/three.module.js";

const dom = {
  viewport: document.getElementById("viewport"),
  characterList: document.getElementById("character-list"),
  selectedName: document.getElementById("selected-name"),
  selectedDescription: document.getElementById("selected-description"),
  playerPos: document.getElementById("player-pos"),
  focusName: document.getElementById("focus-name"),
  attackState: document.getElementById("attack-state")
};

const characters = [
  {
    id: "explorer",
    name: "탐험가",
    role: "기본 캐릭터",
    description: "주황색 상의와 파란 바지의 균형형 캐릭터입니다.",
    colors: { hair: "#4d2d18", skin: "#f2c39b", shirt: "#e67e22", pants: "#2f5fa7" }
  },
  {
    id: "farmer",
    name: "농부",
    role: "마을 주민",
    description: "밀짚모자 톤의 머리색과 녹색 상의를 사용합니다.",
    colors: { hair: "#d3a24f", skin: "#f0c89d", shirt: "#7eb356", pants: "#6d4c41" }
  },
  {
    id: "knight",
    name: "기사",
    role: "모험형 캐릭터",
    description: "은색 상의와 진한 붉은 바지로 공격적인 분위기를 냅니다.",
    colors: { hair: "#6f7684", skin: "#edc19d", shirt: "#a8b6c9", pants: "#7e2635" }
  }
];

const scene = new THREE.Scene();
scene.background = new THREE.Color("#8fd8ff");
scene.fog = new THREE.Fog("#93d9ff", 22, 75);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 180);
camera.position.set(0, 7, 10);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
dom.viewport.appendChild(renderer.domElement);

const clock = new THREE.Clock();
const keys = new Set();
const worldBounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };
const entities = [];

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
  setupGround();
  setupWorldObjects();
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

  const sun = new THREE.DirectionalLight("#fff6d6", 1.22);
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

function setupGround() {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshStandardMaterial({ color: "#77b654" })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(120, 60, "#6da252", "#70ab57");
  grid.position.y = 0.01;
  scene.add(grid);

  for (let i = 0; i < 80; i += 1) {
    const size = 0.18 + Math.random() * 0.22;
    const grass = new THREE.Mesh(
      new THREE.BoxGeometry(size, 0.16 + Math.random() * 0.2, size),
      new THREE.MeshStandardMaterial({ color: i % 2 === 0 ? "#70b84d" : "#66a948" })
    );
    grass.position.set((Math.random() - 0.5) * 45, grass.geometry.parameters.height * 0.5, (Math.random() - 0.5) * 45);
    grass.receiveShadow = true;
    scene.add(grass);
  }
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
  player.group.position.set(-1.8, 0, 2);
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
  player.selectedId = characterId;
  const selected = getSelectedCharacter();
  dom.selectedName.textContent = selected.name;
  dom.selectedDescription.textContent = selected.description;
  rebuildPlayerModel(selected);
  Array.from(dom.characterList.children).forEach((button) => {
    button.classList.toggle("active", button.dataset.characterId === characterId);
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

  scene.add(root);
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

  scene.add(root);
  registerEntity(label, "house", root, 220);
}

function addAnimal(label, type, x, z, bodyColor, patchColor, scale) {
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

  scene.add(root);
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
}

function bindEvents() {
  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key) || event.key === " ") {
      event.preventDefault();
    }
    keys.add(key);
    if (key === " " && attackState.cooldown <= 0) {
      performAttack();
    }
  });

  window.addEventListener("keyup", (event) => {
    keys.delete(event.key.toLowerCase());
  });

  window.addEventListener("resize", resizeRenderer);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.04);

  updatePlayer(dt);
  updateEntities(dt);
  updateAttack(dt);
  updateCamera(dt);
  updateHud();
  resizeRenderer();

  renderer.render(scene, camera);
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
    player.group.position.add(move);
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
  const now = performance.now() * 0.001;
  const playerPos = player.group.position.clone();

  entities.forEach((entity) => {
    if (!entity.mesh.visible) {
      return;
    }

    if (entity.attackCooldown > 0) {
      entity.attackCooldown = Math.max(0, entity.attackCooldown - dt);
    }

    if (entity.alive && entity.canRoam) {
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
    if (distanceToPlayer > entity.leashRange) {
      entity.aggressive = false;
      entity.roamTarget.copy(entity.roamCenter);
    } else if (distanceToPlayer > entity.attackRange) {
      const chaseStep = deltaToPlayer.normalize().multiplyScalar(entity.speed * dt);
      entity.mesh.position.add(chaseStep);
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
  entity.mesh.position.add(roamStep);
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
  const px = player.group.position.x.toFixed(1);
  const pz = player.group.position.z.toFixed(1);
  dom.playerPos.textContent = `위치: (${px}, ${pz})`;

  const target = getNearestAliveEntity();
  if (target) {
    dom.focusName.textContent = `타겟: ${target.label} (${Math.max(0, Math.round(target.health))}/${target.maxHealth})`;
  } else {
    dom.focusName.textContent = "타겟: 없음";
  }

  if (attackState.cooldown > 0) {
    dom.attackState.textContent = `HP ${Math.max(0, Math.round(player.health))}/${player.maxHealth} | 공격 재사용: ${attackState.cooldown.toFixed(2)}초`;
  } else {
    dom.attackState.textContent = `HP ${Math.max(0, Math.round(player.health))}/${player.maxHealth} | 공격 준비됨`;
  }
}

function performAttack() {
  attackState.cooldown = attackState.cooldownSec;
  attackState.pulseTime = 1;

  const playerPos = player.group.position.clone();
  const forward = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw)).normalize();
  const attackCenter = playerPos.clone().addScaledVector(forward, 1.7);
  attackPulse.position.set(attackCenter.x, 0.12, attackCenter.z);
  attackPulse.lookAt(attackCenter.x + forward.x, 0.12, attackCenter.z + forward.z);
  attackPulse.rotation.x = -Math.PI / 2;

  const hitTargets = entities.filter((entity) => {
    if (!entity.alive || !entity.mesh.visible) {
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
    if (target.canRoam) {
      target.aggressive = true;
    }
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
    }
  });
}

function flashEntity(root) {
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
  if (player.hurtCooldown > 0) {
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

  if (player.health <= 0) {
    player.health = player.maxHealth;
    player.group.position.set(-1.8, 0, 2);
    player.moveDirection.set(0, 0, 1);
    entities.forEach((entity) => {
      entity.aggressive = false;
    });
  }
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
