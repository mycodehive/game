const CONFIG = Object.freeze({
  START_MONEY: 1500,
  SALARY: 200,
  TAX_AMOUNT: 100,
  BOARD_SIZE: 32,
  BOARD_ROWS: 9,
  BOARD_COLS: 9,
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 4,
  MAX_LOGS: 400,
  MOVE_STEP_DELAY_MS: 220,
  TOAST_DURATION_MS: 2200,
  MAX_TOASTS: 4,
  HOUSE_COST: 120,
  BUILDING_COST: 200,
  HOTEL_COST: 300
});

const BUILD_RULES = Object.freeze({
  house: { label: "집", cost: CONFIG.HOUSE_COST, rentBonusRate: 0.5 },
  building: { label: "빌딩", cost: CONFIG.BUILDING_COST, rentBonusRate: 1.0 },
  hotel: { label: "호텔", cost: CONFIG.HOTEL_COST, rentBonusRate: 1.5 }
});

let tiles = [];
let selectedTileId = null;
let players = [];
let deck = [];

const BASE_DECK = [
  { id: "E3", text: "앞으로 3칸 이동", effect: { type: "move", value: 3 } },
  { id: "E4", text: "뒤로 3칸 이동", effect: { type: "move", value: -3 } },
  { id: "E5", text: "보유 도시 임대료 합의 50%를 은행에 납부", effect: { type: "pay_half_total_rent", value: 50 } },
  { id: "E6", text: "상대방의 가장 고가 도시 1개 강탈", effect: { type: "seize_highest_city", value: 1 } }
];

let gameState = {
  currentPlayerIndex: 0,
  phase: "setup",
  lastRoll: null,
  logs: [],
  winnerId: null,
  isAnimating: false
};

const dom = {};
const TOKEN_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b"];
let openedOwnedCitiesPlayerId = null;
let cityArrivalModal = {
  playerId: null,
  tileId: null
};

document.addEventListener("DOMContentLoaded", () => {
  cacheDom();
  bindEvents();
  renderNameInputs();
  tiles = createTiles();
  render();
});

function cacheDom() {
  dom.board = document.getElementById("board");
  dom.playerCount = document.getElementById("player-count");
  dom.playerNameInputs = document.getElementById("player-name-inputs");
  dom.turnInfo = document.getElementById("turn-info");
  dom.lastRoll = document.getElementById("last-roll");
  dom.playersList = document.getElementById("players-list");
  dom.logList = document.getElementById("log-list");
  dom.toastContainer = document.getElementById("toast-container");
  dom.ownedCitiesModal = document.getElementById("owned-cities-modal");
  dom.ownedCitiesTitle = document.getElementById("owned-cities-title");
  dom.ownedCitiesBody = document.getElementById("owned-cities-body");
  dom.ownedCitiesClose = document.getElementById("owned-cities-close");
  dom.cityArrivalModal = document.getElementById("city-arrival-modal");
  dom.cityArrivalTitle = document.getElementById("city-arrival-title");
  dom.cityArrivalBody = document.getElementById("city-arrival-body");
  dom.cityArrivalClose = document.getElementById("city-arrival-close");
  dom.cityBuyBtn = document.getElementById("city-buy-btn");
  dom.cityPassBtn = document.getElementById("city-pass-btn");
  dom.cityEndBtn = document.getElementById("city-end-btn");
  dom.cityBuildHouseBtn = document.getElementById("city-build-house-btn");
  dom.cityBuildBuildingBtn = document.getElementById("city-build-building-btn");
  dom.cityBuildHotelBtn = document.getElementById("city-build-hotel-btn");

  dom.startBtn = document.getElementById("start-btn");
  dom.rollBtn = document.getElementById("roll-btn");
  dom.buyBtn = document.getElementById("buy-btn");
  dom.passBtn = document.getElementById("pass-btn");
  dom.endTurnBtn = document.getElementById("end-turn-btn");
}

function bindEvents() {
  dom.board.addEventListener("click", (event) => {
    const cell = event.target.closest("[data-tile-id]");
    if (cell) inspectTile(Number(cell.dataset.tileId));
  });
  dom.board.addEventListener("keydown", (event) => {
    const cell = event.target.closest("[data-tile-id]");
    if (cell && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      inspectTile(Number(cell.dataset.tileId));
    }
  });
  document.getElementById("inspect-action").addEventListener("click", () => {
    const current = getCurrentPlayer();
    if (current && current.position === selectedTileId && !gameState.isAnimating) openCityArrivalModal(current.id, selectedTileId);
  });
  document.addEventListener("keydown", (event) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || /INPUT|SELECT|TEXTAREA|BUTTON/.test(event.target.tagName) || !dom.cityArrivalModal.hidden || !dom.ownedCitiesModal.hidden) return;
    if (event.code === "Space" && !dom.rollBtn.disabled) { event.preventDefault(); dom.rollBtn.click(); }
    if (event.key === "Enter" && !dom.endTurnBtn.disabled) { event.preventDefault(); dom.endTurnBtn.click(); }
  });
  dom.playerCount.addEventListener("change", renderNameInputs);
  dom.playersList.addEventListener("click", (event) => {
    const trigger = event.target.closest(".player-owned-btn");
    if (!trigger) {
      return;
    }
    openOwnedCitiesModal(trigger.dataset.playerId);
  });

  dom.ownedCitiesClose.addEventListener("click", closeOwnedCitiesModal);
  dom.ownedCitiesModal.addEventListener("click", (event) => {
    if (event.target === dom.ownedCitiesModal) {
      closeOwnedCitiesModal();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !dom.ownedCitiesModal.hidden) {
      closeOwnedCitiesModal();
    }
    if (event.key === "Escape" && !dom.cityArrivalModal.hidden) {
      closeCityArrivalModal();
    }
  });

  dom.startBtn.addEventListener("click", initGame);
  dom.rollBtn.addEventListener("click", async () => {
    await rollDice();
    render();
  });
  dom.buyBtn.addEventListener("click", () => {
    const player = getCurrentPlayer();
    if (player) {
      buyCurrentCity(player);
      render();
    }
  });
  dom.passBtn.addEventListener("click", () => {
    passCurrentCity();
    render();
  });
  dom.endTurnBtn.addEventListener("click", () => {
    endTurn();
    render();
  });

  dom.cityArrivalClose.addEventListener("click", closeCityArrivalModal);
  dom.cityArrivalModal.addEventListener("click", (event) => {
    if (event.target === dom.cityArrivalModal) {
      closeCityArrivalModal();
    }
  });
  dom.cityBuyBtn.addEventListener("click", () => {
    const player = getCurrentPlayer();
    if (player) {
      buyCurrentCity(player);
      closeCityArrivalModal();
      render();
    }
  });
  dom.cityPassBtn.addEventListener("click", () => {
    passCurrentCity();
    closeCityArrivalModal();
    render();
  });
  dom.cityEndBtn.addEventListener("click", () => {
    endTurn();
    closeCityArrivalModal();
    render();
  });
  dom.cityBuildHouseBtn.addEventListener("click", () => {
    buildCurrentCity("house");
  });
  dom.cityBuildBuildingBtn.addEventListener("click", () => {
    buildCurrentCity("building");
  });
  dom.cityBuildHotelBtn.addEventListener("click", () => {
    buildCurrentCity("hotel");
  });
}

function renderNameInputs() {
  const count = Number(dom.playerCount.value);
  const oldValues = Array.from(dom.playerNameInputs.querySelectorAll("input")).map((el) => el.value.trim());
  dom.playerNameInputs.innerHTML = "";

  for (let i = 0; i < count; i += 1) {
    const input = document.createElement("input");
    input.type = "text";
    input.id = `player-name-${i}`;
    input.maxLength = 12;
    input.placeholder = `플레이어 ${i + 1} 이름`;
    input.setAttribute("aria-label", `플레이어 ${i + 1} 이름`);
    input.value = oldValues[i] || `플레이어${i + 1}`;
    dom.playerNameInputs.appendChild(input);
  }
}

function initGame() {
  if (gameState.isAnimating) return;
  selectedTileId = null;
  const selectedCount = Number(dom.playerCount.value);
  const count = Math.min(CONFIG.MAX_PLAYERS, Math.max(CONFIG.MIN_PLAYERS, selectedCount));

  players = Array.from({ length: count }, (_, i) => {
    const input = document.getElementById(`player-name-${i}`);
    const rawName = input ? input.value.trim() : "";
    return {
      id: `P${i + 1}`,
      name: rawName || `플레이어${i + 1}`,
      money: CONFIG.START_MONEY,
      position: 0,
      isBankrupt: false,
      skipTurns: 0,
      cards: []
    };
  });

  tiles = createTiles();
  deck = shuffle([...BASE_DECK]);

  gameState = {
    currentPlayerIndex: 0,
    phase: "await_roll",
    lastRoll: null,
    logs: [],
    winnerId: null,
    isAnimating: false
  };
  closeOwnedCitiesModal();
  closeCityArrivalModal();
  clearToasts();

  logAction(`게임 시작: ${players.map((p) => p.name).join(", ")} / 시작 자금 ${CONFIG.START_MONEY}`);
  logAction(`현재 턴: ${players[0].name}`);

  render();
}

function createTiles() {
  const result = [];
  const colorPalette = ["#f59e0b", "#3b82f6", "#10b981", "#ef4444", "#0ea5e9"];
  const cityNames = [
    "서울", "부산", "인천", "대구", "광주", "대전", "울산", "수원", "제주", "춘천",
    "강릉", "전주", "여수", "창원", "청주", "천안", "포항", "목포", "군산", "구미",
    "안동", "원주", "평창", "속초", "김해", "진주", "이천", "양양", "거제", "통영"
  ];

  const specials = {
    0: { name: "START", type: "START" },
    2: { name: "이벤트", type: "EVENT" },
    5: { name: "세금", type: "TAX" },
    7: { name: "무인도", type: "ISLAND" },
    10: { name: "이벤트", type: "EVENT" },
    13: { name: "세금", type: "TAX" },
    15: { name: "무인도", type: "ISLAND" },
    18: { name: "이벤트", type: "EVENT" },
    21: { name: "세금", type: "TAX" },
    24: { name: "이벤트", type: "EVENT" },
    27: { name: "무인도", type: "ISLAND" },
    30: { name: "이벤트", type: "EVENT" }
  };

  let cityCursor = 0;
  for (let i = 0; i < CONFIG.BOARD_SIZE; i += 1) {
    if (specials[i]) {
      result.push({
        id: i,
        name: specials[i].name,
        type: specials[i].type
      });
      continue;
    }

    const price = 120 + (cityCursor % 5) * 60 + Math.floor(cityCursor / 5) * 20;
    const rent = Math.round(price * 0.35);
    result.push({
      id: i,
      name: cityNames[cityCursor % cityNames.length],
      type: "CITY",
      price,
      rent,
      ownerId: null,
      buildings: {
        house: false,
        building: false,
        hotel: false
      },
      color: colorPalette[cityCursor % colorPalette.length]
    });
    cityCursor += 1;
  }

  return result;
}

function render() {
  renderBoard();
  renderPlayersPanel();
  renderLog();
  renderOwnedCitiesModal();
  renderCityArrivalModal();
  updateActionButtons();
  renderTileInspector();
  window.dispatchEvent(new CustomEvent("bluemarble:state", { detail: getSceneSnapshot() }));
}

function renderBoard() {
  dom.board.style.setProperty("--rows", String(CONFIG.BOARD_ROWS));
  dom.board.style.setProperty("--cols", String(CONFIG.BOARD_COLS));

  const coordList = getPerimeterCoords(CONFIG.BOARD_ROWS, CONFIG.BOARD_COLS);
  const coordToTile = new Map();
  for (let i = 0; i < coordList.length && i < tiles.length; i += 1) {
    const key = `${coordList[i].r}-${coordList[i].c}`;
    coordToTile.set(key, i);
  }

  dom.board.innerHTML = "";

  for (let r = 0; r < CONFIG.BOARD_ROWS; r += 1) {
    for (let c = 0; c < CONFIG.BOARD_COLS; c += 1) {
      const cell = document.createElement("div");
      cell.className = "board-cell";
      const tileIndex = coordToTile.get(`${r}-${c}`);

      if (tileIndex === undefined) {
        cell.classList.add("board-empty");
        if (r === Math.floor(CONFIG.BOARD_ROWS / 2) && c === Math.floor(CONFIG.BOARD_COLS / 2)) {
          cell.classList.add("board-center");
          cell.textContent = "BLUE MARBLE";
        }
        dom.board.appendChild(cell);
        continue;
      }

      const tile = tiles[tileIndex];
      cell.classList.add(`type-${tile.type.toLowerCase()}`);
      cell.dataset.tileId = tile.id;
      cell.tabIndex = 0;
      cell.setAttribute("role", "button");
      cell.setAttribute("aria-label", `${tile.name}${tile.type === "CITY" ? ` · 가격 ${tile.price} · 임대 ${getCurrentRent(tile)}` : ""} 정보`);

      const nameEl = document.createElement("div");
      nameEl.className = "tile-name";
      nameEl.textContent = tile.name;
      cell.appendChild(nameEl);

      const metaEl = document.createElement("div");
      metaEl.className = "tile-meta";
      metaEl.textContent = tile.type;
      cell.appendChild(metaEl);

      if (tile.type === "CITY") {
        const econEl = document.createElement("div");
        econEl.className = "tile-econ";
        econEl.textContent = `가격 ${tile.price} / 임대 ${getCurrentRent(tile)}`;
        cell.appendChild(econEl);

        const ownerEl = document.createElement("div");
        ownerEl.className = "tile-owner";
        const owner = findPlayerById(tile.ownerId);
        ownerEl.textContent = owner
          ? `소유: ${owner.name} / ${formatBuildings(tile)}`
          : "소유: 은행";
        cell.appendChild(ownerEl);

        cell.style.boxShadow = `inset 0 0 0 2px ${tile.color}`;
      }

      const playersOnTile = players.filter((p) => !p.isBankrupt && p.position === tileIndex);
      if (playersOnTile.length > 0) {
        const tokenWrap = document.createElement("div");
        tokenWrap.className = "tokens";
        playersOnTile.forEach((p) => {
          const badge = document.createElement("span");
          badge.className = "token";
          badge.style.background = TOKEN_COLORS[playerOrder(p.id) % TOKEN_COLORS.length];
          badge.textContent = p.name.slice(0, 1);
          tokenWrap.appendChild(badge);
        });
        cell.appendChild(tokenWrap);
      }

      dom.board.appendChild(cell);
    }
  }
}

function getPerimeterCoords(rows, cols) {
  const coords = [];

  for (let c = 0; c < cols; c += 1) {
    coords.push({ r: rows - 1, c });
  }
  for (let r = rows - 2; r >= 0; r -= 1) {
    coords.push({ r, c: cols - 1 });
  }
  for (let c = cols - 2; c >= 0; c -= 1) {
    coords.push({ r: 0, c });
  }
  for (let r = 1; r <= rows - 2; r += 1) {
    coords.push({ r, c: 0 });
  }

  return coords;
}

function renderPlayersPanel() {
  const current = getCurrentPlayer();
  const winner = gameState.winnerId ? findPlayerById(gameState.winnerId) : null;

  if (gameState.phase === "setup") {
    dom.turnInfo.textContent = "설정 후 게임 시작";
  } else if (gameState.phase === "game_over" && winner) {
    dom.turnInfo.textContent = `게임 종료 - 승자: ${winner.name}`;
  } else if (current) {
    dom.turnInfo.textContent = `${current.name} 차례 (${phaseLabel(gameState.phase)})`;
  } else {
    dom.turnInfo.textContent = "대기";
  }

  if (gameState.lastRoll) {
    dom.lastRoll.textContent = `최근 주사위: ${gameState.lastRoll.d1} + ${gameState.lastRoll.d2} = ${gameState.lastRoll.sum}`;
  } else {
    dom.lastRoll.textContent = "최근 주사위: -";
  }

  dom.playersList.innerHTML = "";

  players.forEach((p) => {
    const li = document.createElement("li");
    li.className = "player-item";
    if (current && current.id === p.id && gameState.phase !== "game_over") {
      li.classList.add("active");
    }
    if (p.isBankrupt) {
      li.classList.add("bankrupt");
    }

    const head = document.createElement("div");
    head.className = "player-head";
    const name = document.createElement("span");
    name.textContent = p.name;
    const money = document.createElement("span");
    money.textContent = `₩ ${p.money.toLocaleString("ko-KR")}`;
    name.style.color = TOKEN_COLORS[playerOrder(p.id) % TOKEN_COLORS.length];
    head.appendChild(name);
    head.appendChild(money);

    const lines = document.createElement("div");
    lines.className = "player-lines";
    const posName = tiles[p.position] ? tiles[p.position].name : "-";
    const cityCount = countOwnedCities(p.id);
    const taxCard = getCardCount(p, "tax_exempt");
    const islandCard = getCardCount(p, "island_immunity");
    const stateText = [
      p.isBankrupt ? "파산" : "생존",
      p.skipTurns > 0 ? `스킵 ${p.skipTurns}` : "스킵 없음",
      `세금면제 ${taxCard}`,
      `무인도회피 ${islandCard}`
    ].join(" / ");

    lines.textContent = `위치 ${p.position}(${posName}) | 상태 ${stateText}`;

    const ownedBtn = document.createElement("button");
    ownedBtn.type = "button";
    ownedBtn.className = "player-owned-btn";
    ownedBtn.dataset.playerId = p.id;
    ownedBtn.textContent = `보유도시 ${cityCount}`;

    li.appendChild(head);
    li.appendChild(lines);
    li.appendChild(ownedBtn);
    dom.playersList.appendChild(li);
  });
}

function openOwnedCitiesModal(playerId) {
  if (!findPlayerById(playerId)) {
    return;
  }
  openedOwnedCitiesPlayerId = playerId;
  dom.ownedCitiesModal.hidden = false;
  renderOwnedCitiesModal();
}

function closeOwnedCitiesModal() {
  openedOwnedCitiesPlayerId = null;
  dom.ownedCitiesModal.hidden = true;
}

function renderOwnedCitiesModal() {
  if (!openedOwnedCitiesPlayerId) {
    return;
  }

  const player = findPlayerById(openedOwnedCitiesPlayerId);
  if (!player) {
    closeOwnedCitiesModal();
    return;
  }

  const ownedCities = getOwnedCities(player.id);
  dom.ownedCitiesTitle.textContent = `${player.name}의 보유 도시 (${ownedCities.length})`;
  dom.ownedCitiesBody.innerHTML = "";

  if (ownedCities.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "보유한 도시가 없습니다.";
    dom.ownedCitiesBody.appendChild(empty);
    return;
  }

  const list = document.createElement("ul");
  list.className = "owned-list";

  ownedCities.forEach((tile) => {
    const item = document.createElement("li");
    item.textContent = `${tile.name} (칸 ${tile.id}) / 가격 ${tile.price} / 임대료 ${getCurrentRent(tile)} / ${formatBuildings(tile)}`;
    list.appendChild(item);
  });

  dom.ownedCitiesBody.appendChild(list);
}

function openCityArrivalModal(playerId, tileId) {
  cityArrivalModal = { playerId, tileId };
  dom.cityArrivalModal.hidden = false;
  renderCityArrivalModal();
}

function closeCityArrivalModal() {
  cityArrivalModal = { playerId: null, tileId: null };
  dom.cityArrivalModal.hidden = true;
}

function renderCityArrivalModal() {
  if (!cityArrivalModal.playerId || cityArrivalModal.tileId === null) {
    dom.cityArrivalModal.hidden = true;
    return;
  }

  const player = findPlayerById(cityArrivalModal.playerId);
  const tile = tiles[cityArrivalModal.tileId];
  if (!player || !tile) {
    closeCityArrivalModal();
    return;
  }

  dom.cityArrivalModal.hidden = false;
  dom.cityArrivalTitle.textContent = `${player.name} 도착: ${tile.name}`;

  const info = document.createElement("div");
  info.className = "city-info-lines";

  const lineType = document.createElement("div");
  lineType.className = "city-info-line";
  lineType.textContent = `타입: ${tile.type} / 칸 번호: ${tile.id}`;
  info.appendChild(lineType);

  if (tile.type === "CITY") {
    const owner = findPlayerById(tile.ownerId);
    const lineCity = document.createElement("div");
    lineCity.className = "city-info-line";
    lineCity.textContent = `가격 ${tile.price} / 기본임대 ${tile.rent} / 현재임대 ${getCurrentRent(tile)} / 소유자 ${owner ? owner.name : "은행"}`;
    info.appendChild(lineCity);

    const lineBuild = document.createElement("div");
    lineBuild.className = "city-info-line";
    lineBuild.textContent = `건설 상태: ${formatBuildings(tile)} | 비용(집 ${CONFIG.HOUSE_COST}, 빌딩 ${CONFIG.BUILDING_COST}, 호텔 ${CONFIG.HOTEL_COST})`;
    info.appendChild(lineBuild);
  } else {
    const lineEtc = document.createElement("div");
    lineEtc.className = "city-info-line";
    lineEtc.textContent = "도시 칸이 아니므로 구매/패스는 비활성입니다.";
    info.appendChild(lineEtc);
  }

  dom.cityArrivalBody.innerHTML = "";
  dom.cityArrivalBody.appendChild(info);

  const canBuy =
    gameState.phase === "await_buy_decision" &&
    tile.type === "CITY" &&
    !tile.ownerId &&
    !gameState.isAnimating &&
    !player.isBankrupt;

  const canPass = canBuy;
  const canEnd = gameState.phase === "await_end_turn" && !gameState.isAnimating;
  const canBuildBase =
    tile.type === "CITY" &&
    tile.ownerId === player.id &&
    gameState.phase === "await_end_turn" &&
    !gameState.isAnimating &&
    !player.isBankrupt;
  const buildings = getCityBuildings(tile);
  const canBuildHouse = canBuildBase && !buildings.house && player.money >= CONFIG.HOUSE_COST;
  const canBuildBuilding = canBuildBase && !buildings.building && player.money >= CONFIG.BUILDING_COST;
  const canBuildHotel = canBuildBase && !buildings.hotel && player.money >= CONFIG.HOTEL_COST;

  dom.cityBuyBtn.disabled = !canBuy;
  dom.cityPassBtn.disabled = !canPass;
  dom.cityEndBtn.disabled = !canEnd;
  dom.cityBuildHouseBtn.disabled = !canBuildHouse;
  dom.cityBuildBuildingBtn.disabled = !canBuildBuilding;
  dom.cityBuildHotelBtn.disabled = !canBuildHotel;
}

function renderLog() {
  dom.logList.innerHTML = "";
  gameState.logs.forEach((line) => {
    const div = document.createElement("div");
    div.className = "log-line";
    div.textContent = line;
    dom.logList.appendChild(div);
  });
  dom.logList.scrollTop = dom.logList.scrollHeight;
}

function updateActionButtons() {
  const phase = gameState.phase;
  const busy = gameState.isAnimating;
  dom.startBtn.disabled = busy;
  dom.startBtn.textContent = phase === "setup" ? "게임 시작 →" : "새 게임 시작";
  const hints = { setup: "이름을 정하고 게임을 시작하세요.", await_roll: "주사위를 굴려 다음 도시로 이동하세요.", await_buy_decision: "도시를 구매하거나 패스하세요.", await_end_turn: "현재 도시에 건설하거나 턴을 종료하세요.", game_over: "게임 종료! 새 게임으로 다시 도전하세요." };
  document.getElementById("action-hint").textContent = busy ? "도시로 이동 중입니다…" : hints[phase] || "";
  dom.rollBtn.disabled = busy || phase !== "await_roll";
  dom.buyBtn.disabled = busy || phase !== "await_buy_decision";
  dom.passBtn.disabled = busy || phase !== "await_buy_decision";
  dom.endTurnBtn.disabled = busy || phase !== "await_end_turn";
}

async function rollDice() {
  if (gameState.phase !== "await_roll") {
    return null;
  }
  closeCityArrivalModal();

  const player = getCurrentPlayer();
  if (!player || player.isBankrupt) {
    return null;
  }

  const d1 = Math.floor(Math.random() * 6) + 1;
  const d2 = Math.floor(Math.random() * 6) + 1;
  const sum = d1 + d2;
  gameState.lastRoll = { d1, d2, sum };

  logAction(`${player.name}: 주사위 ${d1}+${d2}=${sum}`);
  gameState.isAnimating = true;
  render();
  await movePlayer(player, sum);
  gameState.isAnimating = false;

  if (player.isBankrupt) {
    if (!checkWinCondition()) {
      gameState.phase = "await_end_turn";
    }
    return { d1, d2, sum };
  }

  await resolveTile(player);
  return { d1, d2, sum };
}

async function movePlayer(player, steps) {
  if (!player || player.isBankrupt || steps === 0) {
    return;
  }

  const before = player.position;

  if (steps > 0) {
    let salaryPaid = false;
    for (let i = 0; i < steps; i += 1) {
      await sleep(CONFIG.MOVE_STEP_DELAY_MS);
      player.position = (player.position + 1) % CONFIG.BOARD_SIZE;
      if (player.position === 0 && !salaryPaid) {
        adjustMoney(player, CONFIG.SALARY, "START 통과/도착 월급");
        notifyMessage(`${player.name}: START를 지나거나 도착해 ${CONFIG.SALARY}을(를) 은행에서 받았습니다.`);
        salaryPaid = true;
      }
      render();
    }
  } else {
    for (let i = 0; i < Math.abs(steps); i += 1) {
      await sleep(CONFIG.MOVE_STEP_DELAY_MS);
      player.position = (player.position - 1 + CONFIG.BOARD_SIZE) % CONFIG.BOARD_SIZE;
      render();
    }
  }

  logAction(`${player.name}: ${before} -> ${player.position} (${steps > 0 ? "+" : ""}${steps}칸)`);
}

async function resolveTile(player) {
  if (!player || player.isBankrupt) {
    return;
  }

  const tile = tiles[player.position];
  if (!tile) {
    gameState.phase = "await_end_turn";
    return;
  }

  logAction(`${player.name}: ${tile.name} 도착 [${tile.type}]`);

  switch (tile.type) {
    case "START":
      gameState.phase = "await_end_turn";
      break;

    case "CITY":
      if (!tile.ownerId) {
        if (player.money >= tile.price) {
          gameState.phase = "await_buy_decision";
          logAction(`${player.name}: ${tile.name} 구매 여부 선택`);
        } else {
          gameState.phase = "await_end_turn";
          logAction(`${player.name}: ${tile.name} 구매 불가(자금 부족)`);
        }
      } else if (tile.ownerId === player.id) {
        gameState.phase = "await_end_turn";
        logAction(`${player.name}: 본인 소유 도시`);
      } else {
        const owner = findPlayerById(tile.ownerId);
        if (owner && !owner.isBankrupt) {
          const currentRent = getCurrentRent(tile);
          notifyMessage(`${player.name}: ${owner.name} 소유 지역에 도착! 임대료 ${currentRent} 지불`);
          payRent(player, owner, currentRent);
        } else {
          tile.ownerId = null;
          if (player.money >= tile.price) {
            gameState.phase = "await_buy_decision";
            logAction(`${tile.name}: 소유자 정보 정리(은행 반환), 구매 여부 선택`);
          } else {
            gameState.phase = "await_end_turn";
            logAction(`${tile.name}: 소유자 정보 정리(은행 반환)`);
          }
        }
      }
      openCityArrivalModal(player.id, tile.id);
      break;

    case "EVENT":
      await drawEventCard(player);
      return;

    case "TAX":
      if (consumeCard(player, "tax_exempt")) {
        logAction(`${player.name}: 세금 면제 카드 사용`);
      } else {
        adjustMoney(player, -CONFIG.TAX_AMOUNT, `세금 납부 ${CONFIG.TAX_AMOUNT}`);
      }
      if (gameState.phase !== "game_over") {
        gameState.phase = "await_end_turn";
      }
      break;

    case "ISLAND":
      if (consumeCard(player, "island_immunity")) {
        logAction(`${player.name}: 무인도 회피 카드 사용`);
      } else {
        player.skipTurns += 1;
        logAction(`${player.name}: 무인도 - 다음 턴 스킵`);
      }
      if (gameState.phase !== "game_over") {
        gameState.phase = "await_end_turn";
      }
      break;

    default:
      gameState.phase = "await_end_turn";
      break;
  }

  checkWinCondition();
}

function buyCurrentCity(player) {
  if (gameState.phase !== "await_buy_decision") {
    return;
  }

  const tile = tiles[player.position];
  if (!tile || tile.type !== "CITY" || tile.ownerId) {
    return;
  }

  if (player.money < tile.price) {
    logAction(`${player.name}: ${tile.name} 구매 실패(자금 부족)`);
    gameState.phase = "await_end_turn";
    return;
  }

  tile.ownerId = player.id;
  adjustMoney(player, -tile.price, `${tile.name} 구매(${tile.price})`);
  if (gameState.phase !== "game_over") {
    gameState.phase = "await_end_turn";
  }
}

function buildCurrentCity(structureType) {
  const rule = BUILD_RULES[structureType];
  if (!rule) {
    return;
  }

  const player = getCurrentPlayer();
  if (!player || player.isBankrupt || gameState.phase !== "await_end_turn") {
    return;
  }

  const tile = tiles[player.position];
  if (!tile || tile.type !== "CITY" || tile.ownerId !== player.id) {
    return;
  }

  const buildings = getCityBuildings(tile);
  if (buildings[structureType]) {
    notifyMessage(`${tile.name}: ${rule.label}은(는) 이미 건설되어 있습니다.`);
    return;
  }

  if (player.money < rule.cost) {
    notifyMessage(`${player.name}: ${rule.label} 건설 비용(${rule.cost})이 부족합니다.`);
    return;
  }

  buildings[structureType] = true;
  adjustMoney(player, -rule.cost, `${tile.name} ${rule.label} 건설(${rule.cost})`);
  logAction(`${player.name}: ${tile.name}에 ${rule.label} 건설, 현재 임대료 ${getCurrentRent(tile)}`);
  notifyMessage(`${player.name}: ${tile.name}에 ${rule.label}을(를) 건설했습니다. 현재 임대료 ${getCurrentRent(tile)}`);
  render();
}

function payRent(player, owner, rent) {
  adjustMoney(player, -rent, `${owner.name}에게 임대료 지불(${rent})`);
  if (!owner.isBankrupt) {
    adjustMoney(owner, rent, `${player.name}에게서 임대료 수령(${rent})`);
  }

  if (gameState.phase !== "game_over") {
    gameState.phase = "await_end_turn";
  }

  checkWinCondition();
}

async function drawEventCard(player) {
  if (deck.length === 0) {
    deck = shuffle([...BASE_DECK]);
    logAction("이벤트 덱 소진 -> 재셔플");
  }

  const card = deck.pop();
  logAction(`${player.name}: 이벤트 카드 '${card.text}'`);
  notifyMessage(`${player.name}: 이벤트 발생 - ${card.text}`);

  const chained = await applyEventEffect(player, card);
  if (chained) {
    return;
  }

  if (!checkWinCondition() && gameState.phase !== "game_over") {
    gameState.phase = "await_end_turn";
  }
}

async function applyEventEffect(player, card) {
  const effect = card.effect;

  switch (effect.type) {
    case "move":
      gameState.isAnimating = true;
      render();
      await movePlayer(player, effect.value);
      gameState.isAnimating = false;
      if (!player.isBankrupt) {
        await resolveTile(player);
      }
      return true;

    case "pay_half_total_rent":
      payHalfOwnedRentToBank(player);
      return false;

    case "seize_highest_city":
      seizeHighestOpponentCity(player);
      return false;

    default:
      logAction(`미지원 이벤트 효과: ${effect.type}`);
      return false;
  }
}

function passCurrentCity() {
  if (gameState.phase !== "await_buy_decision") {
    return;
  }

  const player = getCurrentPlayer();
  if (!player) {
    return;
  }

  const tile = tiles[player.position];
  if (tile && tile.type === "CITY" && !tile.ownerId) {
    logAction(`${player.name}: ${tile.name} 구매 패스`);
  }

  gameState.phase = "await_end_turn";
}

function endTurn() {
  if (gameState.phase !== "await_end_turn") {
    return;
  }
  closeCityArrivalModal();

  if (checkWinCondition()) {
    return;
  }

  const moved = moveToNextActivePlayer();
  if (!moved) {
    checkWinCondition();
  }
}

function moveToNextActivePlayer() {
  if (players.length === 0) {
    return false;
  }

  let idx = gameState.currentPlayerIndex;
  let attempts = 0;

  while (attempts < players.length * 2) {
    idx = (idx + 1) % players.length;
    attempts += 1;

    const candidate = players[idx];
    if (candidate.isBankrupt) {
      continue;
    }

    if (candidate.skipTurns > 0) {
      candidate.skipTurns -= 1;
      logAction(`${candidate.name}: 스킵 턴 처리 (남은 스킵 ${candidate.skipTurns})`);
      continue;
    }

    gameState.currentPlayerIndex = idx;
    gameState.phase = "await_roll";
    gameState.lastRoll = null;
    logAction(`현재 턴: ${candidate.name}`);
    return true;
  }

  return false;
}

function checkWinCondition() {
  if (gameState.phase === "game_over") {
    return true;
  }

  const alive = players.filter((p) => !p.isBankrupt);
  if (alive.length === 1 && players.length > 1) {
    gameState.phase = "game_over";
    gameState.winnerId = alive[0].id;
    closeCityArrivalModal();
    logAction(`승리: ${alive[0].name} (마지막 생존)`);
    return true;
  }

  return false;
}

function adjustMoney(player, amount, reason) {
  if (!player || player.isBankrupt) {
    return;
  }

  player.money += amount;
  const sign = amount > 0 ? "+" : "";
  logAction(`${player.name}: ${reason} (${sign}${amount}) -> 잔액 ${player.money}`);

  if (player.money < 0) {
    handleBankruptcy(player);
  }
}

function handleBankruptcy(player) {
  if (!player || player.isBankrupt) {
    return;
  }

  player.isBankrupt = true;
  player.skipTurns = 0;
  player.cards = [];
  releaseOwnedCities(player.id);
  logAction(`${player.name}: 파산 처리, 보유 도시 은행 반환`);
}

function releaseOwnedCities(ownerId) {
  tiles.forEach((tile) => {
    if (tile.type === "CITY" && tile.ownerId === ownerId) {
      tile.ownerId = null;
      tile.buildings = {
        house: false,
        building: false,
        hotel: false
      };
    }
  });
}

function getCurrentPlayer() {
  return players[gameState.currentPlayerIndex] || null;
}

function findPlayerById(id) {
  return players.find((p) => p.id === id) || null;
}

function countOwnedCities(playerId) {
  return tiles.filter((tile) => tile.type === "CITY" && tile.ownerId === playerId).length;
}

function getCityBuildings(tile) {
  if (!tile.buildings) {
    tile.buildings = {
      house: false,
      building: false,
      hotel: false
    };
  }
  return tile.buildings;
}

function getCurrentRent(tile) {
  if (!tile || tile.type !== "CITY") {
    return 0;
  }
  const buildings = getCityBuildings(tile);
  let multiplier = 1;
  multiplier += buildings.house ? BUILD_RULES.house.rentBonusRate : 0;
  multiplier += buildings.building ? BUILD_RULES.building.rentBonusRate : 0;
  multiplier += buildings.hotel ? BUILD_RULES.hotel.rentBonusRate : 0;
  return Math.round(tile.rent * multiplier);
}

function formatBuildings(tile) {
  const buildings = getCityBuildings(tile);
  const names = [];
  if (buildings.house) {
    names.push("집");
  }
  if (buildings.building) {
    names.push("빌딩");
  }
  if (buildings.hotel) {
    names.push("호텔");
  }
  return names.length > 0 ? names.join(", ") : "건설없음";
}

function getOwnedCities(playerId) {
  return tiles.filter((tile) => tile.type === "CITY" && tile.ownerId === playerId);
}

function payHalfOwnedRentToBank(player) {
  const owned = getOwnedCities(player.id);
  const totalRent = owned.reduce((sum, tile) => sum + getCurrentRent(tile), 0);
  const payment = Math.floor(totalRent * 0.5);

  if (payment <= 0) {
    logAction(`${player.name}: 보유 도시가 없어 임대료 50% 납부 이벤트 면제`);
    notifyMessage(`${player.name}: 보유 도시가 없어 납부할 금액이 없습니다.`);
    return;
  }

  adjustMoney(player, -payment, `이벤트: 보유 도시 임대료 50% 은행 납부(${payment})`);
  notifyMessage(`${player.name}: 보유 도시 임대료 합의 50%(${payment})를 은행에 납부했습니다.`);
}

function seizeHighestOpponentCity(player) {
  const targetCities = tiles.filter((tile) => {
    if (tile.type !== "CITY" || !tile.ownerId || tile.ownerId === player.id) {
      return false;
    }
    const owner = findPlayerById(tile.ownerId);
    return Boolean(owner && !owner.isBankrupt);
  });

  if (targetCities.length === 0) {
    logAction(`${player.name}: 강탈 가능한 상대 도시 없음`);
    notifyMessage(`${player.name}: 강탈 가능한 상대 도시가 없습니다.`);
    return;
  }

  targetCities.sort((a, b) => b.price - a.price);
  const stolen = targetCities[0];
  const prevOwner = findPlayerById(stolen.ownerId);
  stolen.ownerId = player.id;
  logAction(`${player.name}: 이벤트로 ${prevOwner ? prevOwner.name : "상대"}의 ${stolen.name} 강탈`);
  notifyMessage(`${player.name}: ${prevOwner ? prevOwner.name : "상대"}의 최고가 도시 '${stolen.name}'를 강탈했습니다.`);
}

function addCard(player, cardType) {
  player.cards.push({ type: cardType });
}

function consumeCard(player, cardType) {
  const idx = player.cards.findIndex((card) => card.type === cardType);
  if (idx >= 0) {
    player.cards.splice(idx, 1);
    return true;
  }
  return false;
}

function getCardCount(player, cardType) {
  return player.cards.filter((card) => card.type === cardType).length;
}

function logAction(message) {
  const index = gameState.logs.length + 1;
  const line = `${String(index).padStart(3, "0")} | ${message}`;
  gameState.logs.push(line);
  if (gameState.logs.length > CONFIG.MAX_LOGS) {
    gameState.logs.shift();
  }
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function notifyMessage(message) {
  showToast(message);
}

function showToast(message) {
  if (!dom.toastContainer) {
    return;
  }

  while (dom.toastContainer.children.length >= CONFIG.MAX_TOASTS) {
    dom.toastContainer.removeChild(dom.toastContainer.firstElementChild);
  }

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  dom.toastContainer.appendChild(toast);

  const timerId = setTimeout(() => {
    dismissToast(toast);
  }, CONFIG.TOAST_DURATION_MS);

  toast.addEventListener("click", () => {
    clearTimeout(timerId);
    dismissToast(toast);
  });
}

function dismissToast(toast) {
  if (!toast || !toast.parentElement) {
    return;
  }
  toast.classList.add("closing");
  setTimeout(() => {
    if (toast.parentElement) {
      toast.parentElement.removeChild(toast);
    }
  }, 180);
}

function clearToasts() {
  if (!dom.toastContainer) {
    return;
  }
  dom.toastContainer.innerHTML = "";
}

function playerOrder(playerId) {
  const n = Number(playerId.replace("P", ""));
  return Number.isFinite(n) ? n - 1 : 0;
}

function phaseLabel(phase) {
  switch (phase) {
    case "setup":
      return "준비";
    case "await_roll":
      return "주사위 대기";
    case "await_buy_decision":
      return "구매 선택";
    case "await_end_turn":
      return "턴 종료 대기";
    case "game_over":
      return "게임 종료";
    default:
      return phase;
  }
}

// Read-only scene bridge: the rule engine remains the only owner of game state.
function getSceneSnapshot() {
  return {
    tiles: tiles.map((tile) => ({ ...tile, buildings: tile.buildings ? { ...tile.buildings } : null, currentRent: getCurrentRent(tile) })),
    players: players.map((player) => ({ ...player, cards: player.cards.map(card => ({ ...card })), color: TOKEN_COLORS[playerOrder(player.id) % TOKEN_COLORS.length] })),
    currentPlayerId: getCurrentPlayer()?.id || null,
    phase: gameState.phase,
    isAnimating: gameState.isAnimating,
    lastRoll: gameState.lastRoll ? { ...gameState.lastRoll } : null
  };
}
function inspectTile(id) {
  if (!tiles[id]) return;
  selectedTileId = id;
  renderTileInspector();
}
function renderTileInspector() {
  if (selectedTileId === null) {
    document.getElementById("tile-inspector-title").textContent = "도시를 선택하세요";
    document.getElementById("tile-inspector-info").textContent = "3D 보드 또는 2D 지도에서 도시를 클릭하면 정보를 확인할 수 있어요.";
    document.getElementById("inspect-action").hidden = true;
    return;
  }
  const tile = tiles[selectedTileId];
  if (!tile) return;
  const owner = findPlayerById(tile.ownerId);
  const labels = { START: "출발 · 통과 시 200 지급", EVENT: "이벤트 · 카드 효과가 적용됩니다", TAX: "세금 · 100 납부", ISLAND: "무인도 · 다음 턴 한 번 쉬기" };
  document.getElementById("tile-inspector-title").textContent = tile.name;
  document.getElementById("tile-inspector-info").textContent = tile.type === "CITY" ? `가격 ${tile.price.toLocaleString("ko-KR")} · 임대 ${getCurrentRent(tile)} · ${owner ? owner.name : "은행"} 소유 · ${formatBuildings(tile)}` : labels[tile.type];
  const current = getCurrentPlayer();
  const action = document.getElementById("inspect-action");
  action.hidden = !current || current.position !== selectedTileId || tile.type !== "CITY" || gameState.isAnimating || !["await_buy_decision", "await_end_turn"].includes(gameState.phase);
}
window.BlueMarbleGame = Object.freeze({ getSnapshot: getSceneSnapshot, inspectTile });
