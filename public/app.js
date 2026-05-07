const socketUrl = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;
const socket = new WebSocket(socketUrl);

const elements = {
  menuView: document.querySelector("#menuView"),
  loader: document.querySelector("#loader"),
  tableView: document.querySelector("#tableView"),
  playerName: document.querySelector("#playerName"),
  playBotsButton: document.querySelector("#playBotsButton"),
  playOnlineButton: document.querySelector("#playOnlineButton"),
  roomsButton: document.querySelector("#roomsButton"),
  soundButton: document.querySelector("#soundButton"),
  menuStatus: document.querySelector("#menuStatus"),
  leaveButton: document.querySelector("#leaveButton"),
  myPanel: document.querySelector("#myPanel"),
  myName: document.querySelector("#myName"),
  myAvatar: document.querySelector("#myAvatar"),
  topOpponent: document.querySelector("#topOpponent"),
  leftOpponent: document.querySelector("#leftOpponent"),
  rightOpponent: document.querySelector("#rightOpponent"),
  notice: document.querySelector("#notice"),
  boardDrop: document.querySelector("#boardDrop"),
  board: document.querySelector("#board"),
  hand: document.querySelector("#hand"),
  drawButton: document.querySelector("#drawButton"),
  lobbyPanel: document.querySelector("#lobbyPanel"),
  lobbyText: document.querySelector("#lobbyText"),
  startBotsButton: document.querySelector("#startBotsButton"),
  startPairsButton: document.querySelector("#startPairsButton"),
  myScore: document.querySelector("#myScore"),
  targetScore: document.querySelector("#targetScore")
};

let latestState = null;
let selectedTileId = null;
let pendingMode = null;
let audioContext = null;
let soundEnabled = localStorage.getItem("dominoSound") !== "off";
let previousSignature = "";
let currentBoardLayout = null;

socket.addEventListener("open", () => {
  elements.menuStatus.textContent = "Servidor online.";
  hideLoaderSoon();
});

socket.addEventListener("close", () => {
  elements.menuStatus.textContent = "Servidor desconectado. Tente recarregar.";
  showNotice("Servidor desconectado. Tente recarregar a pagina.");
});

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.type === "state") {
    reactToSoundEvents(message.payload);
    latestState = message.payload;
    render();
  }
  if (message.type === "error") {
    elements.menuStatus.textContent = message.payload.message;
    showNotice(message.payload.message);
  }
});

window.addEventListener("load", () => {
  setTimeout(() => {
    if (socket.readyState === WebSocket.OPEN) {
      hideLoaderSoon();
    }
  }, 450);
});

elements.playBotsButton.addEventListener("click", () => join("bots"));
elements.playOnlineButton.addEventListener("click", () => join("online"));
elements.roomsButton.addEventListener("click", () => {
  playUiSound();
  elements.menuStatus.textContent = "Por enquanto existe uma sala unica de teste.";
});
elements.startBotsButton.addEventListener("click", () => send("startWithBots"));
elements.startPairsButton.addEventListener("click", () => send("startPairsWithBots"));
if (elements.leaveButton) {
  elements.leaveButton.addEventListener("click", () => {
    playUiSound();
    location.reload();
  });
}
elements.drawButton.addEventListener("click", () => send("drawOrPass"));
elements.soundButton.addEventListener("click", () => {
  ensureAudio();
  soundEnabled = !soundEnabled;
  localStorage.setItem("dominoSound", soundEnabled ? "on" : "off");
  updateSoundButton();
  if (soundEnabled) {
    playTone(520, 0.08, "sine", 0.05);
    playTone(720, 0.08, "sine", 0.05, 0.07);
  }
});
updateSoundButton();

elements.boardDrop.addEventListener("dragover", (event) => {
  event.preventDefault();
});

elements.boardDrop.addEventListener("drop", (event) => {
  event.preventDefault();
  const tileId = event.dataTransfer.getData("text/tile-id");
  if (!tileId) {
    return;
  }
  selectedTileId = tileId;
  const side = inferDropSide(event.clientX);
  playSelected(side);
});

function join(mode) {
  ensureAudio();
  playUiSound();
  const name = elements.playerName.value.trim();
  if (!name) {
    elements.menuStatus.textContent = "Digite seu nome antes de entrar.";
    elements.playerName.focus();
    return;
  }

  pendingMode = mode;
  send("join", { name });
}

function send(type, payload = {}) {
  if (socket.readyState === WebSocket.OPEN) {
    if (type === "playTile") {
      playTileSound();
    } else if (type === "drawOrPass" || type === "startWithBots") {
      playUiSound();
    }
    socket.send(JSON.stringify({ type, ...payload }));
  }
}

function render() {
  if (!latestState) {
    return;
  }

  const { room, game, me } = latestState;
  const joined = me.playerIndex >= 0;
  elements.menuView.classList.toggle("hidden", joined);
  elements.tableView.classList.toggle("hidden", !joined);

  if (!joined) {
    return;
  }

  if (pendingMode === "bots" && room.status === "waiting") {
    send("startWithBots");
    pendingMode = null;
  }

  const mePlayer = room.players[me.playerIndex];
  elements.myScore.textContent = mePlayer?.score ?? 0;
  elements.targetScore.textContent = room.targetScore;
  elements.myName.textContent = mePlayer?.name ?? "Jogador";
  elements.myAvatar.textContent = initials(mePlayer?.name ?? "EU") || "EU";
  elements.myPanel.classList.toggle("active", room.status === "playing" && room.currentPlayer === me.playerIndex);
  showNotice(buildMessage(room, me));
  elements.lobbyPanel.classList.toggle("hidden", room.status !== "waiting");
  elements.lobbyText.textContent = buildLobbyText(room);
  elements.startBotsButton.classList.toggle("hidden", room.players.length !== 1);
  elements.startPairsButton.classList.toggle("hidden", room.players.length !== 1);

  renderOpponents(room, me);
  renderHand(game.hand, room, game, me);
  renderActions(room, game, me);
  renderBoard(game.board, room, game, me);
}

function buildMessage(room, me) {
  if (room.status === "waiting") {
    if (room.countdown) {
      return `A sala fecha em ${room.countdown} segundos. Ninguem mais entra depois disso.`;
    }
    return "Aguardando jogadores. Voce tambem pode iniciar com bots.";
  }
  if (room.status === "finished") {
    return room.message;
  }
  if (room.currentPlayer === me.playerIndex) {
    return room.message.includes("Partida iniciada")
      ? "Voce tem a pedra de maior valor, comece a partida arrastando-a para o centro da mesa."
      : "Sua vez. Arraste uma pedra para a mesa ou compre/passe.";
  }
  return room.message;
}

function buildLobbyText(room) {
  if (room.countdown) {
    return `Outro jogador entrou. O jogo comeca em ${room.countdown}s.`;
  }
  return `${room.players.length}/${room.maxPlayers} jogadores na sala.`;
}

function renderOpponents(room, me) {
  const seats = getSeatMap(room, me.playerIndex);
  renderOpponentSlot(elements.topOpponent, seats.partner, "top");
  renderOpponentSlot(elements.leftOpponent, seats.left, "side");
  renderOpponentSlot(elements.rightOpponent, seats.right, "side");
}

function renderOpponentSlot(container, player, mode) {
  container.innerHTML = "";
  if (!player) {
    return;
  }

  const badge = document.createElement("div");
  badge.className = "player-badge";
  if (player.bot) {
    badge.classList.add("robot-avatar");
    badge.setAttribute("aria-label", "Robo");
    badge.innerHTML = '<span class="robot-head"><span class="robot-eye left"></span><span class="robot-eye right"></span><span class="robot-mouth"></span></span>';
  } else {
    badge.textContent = initials(player.name);
  }

  const name = document.createElement("div");
  name.className = "opponent-name";
  name.textContent = player.name;

  const count = document.createElement("div");
  count.className = "count-badge";
  count.textContent = player.handCount;

  const summary = document.createElement("div");
  summary.className = "opponent-summary";
  summary.append(badge, name, count);

  const hand = document.createElement("div");
  hand.className = "opponent-hand";
  const backs = Math.min(player.handCount, 7);
  for (let index = 0; index < backs; index += 1) {
    const back = document.createElement("div");
    back.className = "back-tile";
    hand.append(back);
  }

  if (mode === "top") {
    container.append(hand, summary);
    return;
  }

  container.append(summary, hand);
}

function getSeatMap(room, myIndex) {
  if (room.players.length <= 2) {
    return {
      partner: room.players[(myIndex + 1) % room.players.length],
      left: null,
      right: null
    };
  }

  return {
    partner: room.players[(myIndex + 2) % room.players.length],
    left: room.players[(myIndex + 1) % room.players.length],
    right: room.players[(myIndex + 3) % room.players.length]
  };
}

function renderBoard(board, room, game, me) {
  elements.board.innerHTML = "";

  const selected = game.hand.find((tile) => tile.id === selectedTileId);
  const sides = selected && isMyTurn(room, me) ? getPlayableSides(selected, board) : [];
  const items = buildBoardItems(board, selected, sides);
  elements.board.classList.toggle("has-tiles", items.length > 0);
  currentBoardLayout = { items };

  if (!items.length) {
    return;
  }

  const rows = chunkBoardRows(items);
  elements.board.classList.toggle("wrapped", rows.length > 1);
  rows.forEach((rowData, rowIndex) => {
    const row = document.createElement("div");
    row.className = "board-row";
    row.classList.add(rowIndex % 2 === 0 ? "to-right" : "to-left");
    row.style.width = `${rowData.width}px`;
    if (rowIndex % 2 === 1) {
      row.classList.add("reverse");
    }

    rowData.items.forEach((item, itemIndex) => {
      const isTurn = item.kind === "tile" && rowIndex > 0 && itemIndex === 0;
      const vertical = item.tile.left === item.tile.right || isTurn;
      const tileElement = item.kind === "shadow"
        ? createShadowElement(item.tile, item.side, board, vertical)
        : createTileElement(item.tile, { board: true, vertical });
      row.append(tileElement);
    });

    elements.board.append(row);
  });
}

function renderHand(hand, room, game, me) {
  elements.hand.innerHTML = "";
  hand.forEach((tile) => {
    const playable = isMyTurn(room, me) && getPlayableSides(tile, game.board).length > 0;
    const tileElement = createTileElement(tile, { draggable: playable });
    tileElement.classList.toggle("playable", playable);
    tileElement.classList.toggle("selected", selectedTileId === tile.id);
    tileElement.addEventListener("click", () => {
      playSelectSound();
      selectedTileId = selectedTileId === tile.id ? null : tile.id;
      render();
    });
    tileElement.addEventListener("dragstart", (event) => {
      selectedTileId = tile.id;
      event.dataTransfer.setData("text/tile-id", tile.id);
    });
    elements.hand.append(tileElement);
  });
}

function renderActions(room, game, me) {
  elements.drawButton.disabled = !isMyTurn(room, me);

  if (room.status === "finished") {
    elements.drawButton.textContent = "Reiniciar sala";
    elements.drawButton.disabled = false;
    elements.drawButton.onclick = () => send("resetRoom");
  } else {
    elements.drawButton.textContent = "Comprar / passar";
    elements.drawButton.onclick = () => send("drawOrPass");
  }
}

function createTileElement(tile, options = {}) {
  const tileElement = document.createElement("div");
  tileElement.className = options.board ? "tile board-tile" : "tile";
  if (options.vertical) {
    tileElement.classList.add("vertical");
  }
  tileElement.draggable = Boolean(options.draggable);
  tileElement.dataset.tileId = tile.id;

  const first = document.createElement("div");
  first.className = "tile-half";
  addPips(first, tile.left);

  const divider = document.createElement("div");
  divider.className = "tile-divider";

  const second = document.createElement("div");
  second.className = "tile-half";
  addPips(second, tile.right);

  tileElement.append(first, divider, second);
  return tileElement;
}

function buildBoardItems(board, selected, sides) {
  if (!selected || sides.length === 0) {
    return board.map((tile, index) => ({ kind: "tile", tile, globalIndex: index }));
  }

  if (board.length === 0) {
    return [{ kind: "shadow", side: "left", tile: selected }];
  }

  const items = board.map((tile, index) => ({ kind: "tile", tile, globalIndex: index }));
  if (sides.includes("left")) {
    items.unshift({ kind: "shadow", side: "left", tile: selected });
  }
  if (sides.includes("right")) {
    items.push({ kind: "shadow", side: "right", tile: selected });
  }
  return items;
}

function chunkBoardRows(items) {
  const boardWidth = Math.max(260, elements.board.clientWidth || window.innerWidth || 900);
  const tileWidth = boardWidth < 520 ? 56 : 78;
  const tileHeight = boardWidth < 520 ? 30 : 40;
  const gap = boardWidth < 520 ? 6 : 10;
  const rawCapacity = Math.floor((boardWidth + gap) / (tileWidth + gap));
  const visualLimit = boardWidth < 700 ? 7 : 10;
  const capacity = Math.max(3, Math.min(visualLimit, rawCapacity - 1));
  const rows = [];
  for (let index = 0; index < items.length; index += capacity) {
    const rowItems = items.slice(index, index + capacity);
    const contentWidth = measureBoardRow(rowItems, rows.length, { tileWidth, tileHeight, gap });
    const previousWidth = rows[rows.length - 1]?.width || contentWidth;
    rows.push({
      items: rowItems,
      width: Math.min(boardWidth, Math.max(contentWidth, rows.length > 0 ? previousWidth : contentWidth))
    });
  }
  return rows;
}

function measureBoardRow(rowItems, rowIndex, metrics) {
  if (!rowItems.length) {
    return 0;
  }
  const width = rowItems.reduce((total, item, itemIndex) => {
    const isTurn = item.kind === "tile" && rowIndex > 0 && itemIndex === 0;
    const vertical = item.tile.left === item.tile.right || isTurn;
    return total + (vertical ? metrics.tileHeight : metrics.tileWidth);
  }, 0);
  return width + metrics.gap * (rowItems.length - 1);
}

function createShadowElement(tile, side, board, vertical) {
  const button = document.createElement("button");
  button.className = "play-shadow";
  button.type = "button";
  button.setAttribute("aria-label", side === "left" ? "Jogar na esquerda" : "Jogar na direita");
  if (vertical || tile.left === tile.right) {
    button.classList.add("vertical");
  }
  button.addEventListener("click", () => playSelected(side));

  const oriented = orientPreviewTile(tile, side, board);
  const first = document.createElement("div");
  first.className = "tile-half";
  addPips(first, oriented.left);
  const divider = document.createElement("div");
  divider.className = "tile-divider";
  const second = document.createElement("div");
  second.className = "tile-half";
  addPips(second, oriented.right);
  button.append(first, divider, second);
  return button;
}

function orientPreviewTile(tile, side, board) {
  if (!board.length) {
    return tile;
  }
  const ends = getEnds(board);
  if (side === "left") {
    return tile.right === ends.left ? tile : { ...tile, left: tile.right, right: tile.left };
  }
  return tile.left === ends.right ? tile : { ...tile, left: tile.right, right: tile.left };
}

function addPips(container, value) {
  const maps = {
    0: [],
    1: ["p1"],
    2: ["p2", "p3"],
    3: ["p2", "p1", "p3"],
    4: ["p2", "p4", "p5", "p3"],
    5: ["p2", "p4", "p1", "p5", "p3"],
    6: ["p2", "p4", "p6", "p7", "p5", "p3"]
  };
  maps[value].forEach((position) => {
    const pip = document.createElement("span");
    pip.className = `pip ${position}`;
    container.append(pip);
  });
}

function playSelected(side) {
  if (!selectedTileId) {
    return;
  }
  const selected = latestState?.game?.hand.find((tile) => tile.id === selectedTileId);
  const sides = selected ? getPlayableSides(selected, latestState.game.board) : [];
  if (!selected || !sides.includes(side)) {
    playSelectSound();
    render();
    return;
  }
  send("playTile", { tileId: selectedTileId, side });
  selectedTileId = null;
}

function reactToSoundEvents(nextState) {
  if (!latestState) {
    previousSignature = stateSignature(nextState);
    return;
  }

  const signature = stateSignature(nextState);
  if (signature === previousSignature) {
    return;
  }
  previousSignature = signature;

  if (nextState.room.status === "playing" && latestState.room.status === "waiting") {
    playStartSound();
    return;
  }
  if (nextState.room.status === "finished" && latestState.room.status !== "finished") {
    playWinSound();
    return;
  }
  if (nextState.game.board.length > latestState.game.board.length) {
    playTileSound();
    return;
  }
  if (nextState.game.stockCount < latestState.game.stockCount) {
    playDrawSound();
  }
}

function stateSignature(state) {
  return `${state.room.status}:${state.room.round}:${state.game.board.length}:${state.game.stockCount}:${state.room.message}`;
}

function ensureAudio() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
}

function playTone(frequency, duration = 0.08, type = "sine", volume = 0.04, delay = 0) {
  if (!soundEnabled) {
    return;
  }
  ensureAudio();
  const start = audioContext.currentTime + delay;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function playUiSound() {
  playTone(420, 0.06, "triangle", 0.035);
}

function playSelectSound() {
  playTone(620, 0.05, "sine", 0.03);
}

function playTileSound() {
  playTone(160, 0.045, "square", 0.035);
  playTone(90, 0.055, "triangle", 0.028, 0.035);
}

function playDrawSound() {
  playTone(260, 0.08, "sawtooth", 0.025);
}

function playStartSound() {
  playTone(420, 0.09, "triangle", 0.04);
  playTone(560, 0.09, "triangle", 0.04, 0.09);
  playTone(760, 0.12, "triangle", 0.04, 0.18);
}

function playWinSound() {
  [520, 660, 780, 1040].forEach((note, index) => playTone(note, 0.12, "sine", 0.04, index * 0.1));
}

function updateSoundButton() {
  elements.soundButton.textContent = soundEnabled ? "Som" : "Mudo";
  elements.soundButton.setAttribute("aria-label", soundEnabled ? "Som ligado" : "Som desligado");
}

function hideLoaderSoon() {
  setTimeout(() => {
    elements.loader.classList.add("done");
  }, 650);
}

function inferDropSide(clientX) {
  const rect = elements.boardDrop.getBoundingClientRect();
  if (!latestState?.game?.board.length) {
    return "left";
  }
  return clientX < rect.left + rect.width / 2 ? "left" : "right";
}

function isMyTurn(room, me) {
  return room.status === "playing" && room.currentPlayer === me.playerIndex;
}

function getEnds(board) {
  if (board.length === 0) {
    return null;
  }
  return {
    left: board[0].left,
    right: board[board.length - 1].right
  };
}

function getPlayableSides(tile, board) {
  if (board.length === 0) {
    return ["left"];
  }
  const ends = getEnds(board);
  const sides = [];
  if (tile.left === ends.left || tile.right === ends.left) {
    sides.push("left");
  }
  if (tile.left === ends.right || tile.right === ends.right) {
    sides.push("right");
  }
  return sides;
}

function initials(name) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function showNotice(text) {
  if (!elements.notice) {
    return;
  }
  elements.notice.textContent = text;
}
