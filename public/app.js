const socketUrl = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;
const socket = new WebSocket(socketUrl);

const elements = {
  menuView: document.querySelector("#menuView"),
  tableView: document.querySelector("#tableView"),
  playerName: document.querySelector("#playerName"),
  playBotsButton: document.querySelector("#playBotsButton"),
  playOnlineButton: document.querySelector("#playOnlineButton"),
  roomsButton: document.querySelector("#roomsButton"),
  soundButton: document.querySelector("#soundButton"),
  menuStatus: document.querySelector("#menuStatus"),
  leaveButton: document.querySelector("#leaveButton"),
  topOpponent: document.querySelector("#topOpponent"),
  leftOpponent: document.querySelector("#leftOpponent"),
  rightOpponent: document.querySelector("#rightOpponent"),
  notice: document.querySelector("#notice"),
  boardDrop: document.querySelector("#boardDrop"),
  leftShadow: document.querySelector("#leftShadow"),
  rightShadow: document.querySelector("#rightShadow"),
  board: document.querySelector("#board"),
  hand: document.querySelector("#hand"),
  drawButton: document.querySelector("#drawButton"),
  leftButton: document.querySelector("#leftButton"),
  rightButton: document.querySelector("#rightButton"),
  lobbyPanel: document.querySelector("#lobbyPanel"),
  lobbyText: document.querySelector("#lobbyText"),
  startBotsButton: document.querySelector("#startBotsButton"),
  myScore: document.querySelector("#myScore"),
  targetScore: document.querySelector("#targetScore")
};

let latestState = null;
let selectedTileId = null;
let pendingMode = null;
let audioContext = null;
let soundEnabled = localStorage.getItem("dominoSound") !== "off";
let previousSignature = "";

socket.addEventListener("open", () => {
  elements.menuStatus.textContent = "Servidor online.";
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

elements.playBotsButton.addEventListener("click", () => join("bots"));
elements.playOnlineButton.addEventListener("click", () => join("online"));
elements.roomsButton.addEventListener("click", () => {
  playUiSound();
  elements.menuStatus.textContent = "Por enquanto existe uma sala unica de teste.";
});
elements.startBotsButton.addEventListener("click", () => send("startWithBots"));
elements.leaveButton.addEventListener("click", () => {
  playUiSound();
  location.reload();
});
elements.drawButton.addEventListener("click", () => send("drawOrPass"));
elements.leftButton.addEventListener("click", () => playSelected("left"));
elements.rightButton.addEventListener("click", () => playSelected("right"));
elements.leftShadow.addEventListener("click", () => playSelected("left"));
elements.rightShadow.addEventListener("click", () => playSelected("right"));
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
  elements.notice.textContent = buildMessage(room, me);
  elements.lobbyPanel.classList.toggle("hidden", room.status !== "waiting");
  elements.lobbyText.textContent = buildLobbyText(room);
  elements.startBotsButton.classList.toggle("hidden", room.players.length !== 1);

  renderOpponents(room, me);
  renderBoard(game.board);
  renderHand(game.hand, room, game, me);
  renderActions(room, game, me);
  renderShadows(room, game, me);
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
  const opponents = room.players.filter((_, index) => index !== me.playerIndex);
  renderOpponentSlot(elements.topOpponent, opponents[0], "top");
  renderOpponentSlot(elements.leftOpponent, opponents[1], "side");
  renderOpponentSlot(elements.rightOpponent, opponents[2], "side");
}

function renderOpponentSlot(container, player, mode) {
  container.innerHTML = "";
  if (!player) {
    return;
  }

  const badge = document.createElement("div");
  badge.className = "player-badge";
  badge.textContent = player.bot ? "🤖" : initials(player.name);

  const count = document.createElement("div");
  count.className = "count-badge";
  count.textContent = player.handCount;

  container.append(badge, count);
  const backs = Math.min(player.handCount, 7);
  for (let index = 0; index < backs; index += 1) {
    const back = document.createElement("div");
    back.className = "back-tile";
    container.append(back);
  }

  if (mode === "top") {
    container.prepend(...Array.from(container.querySelectorAll(".back-tile")));
  }
}

function renderBoard(board) {
  elements.board.innerHTML = "";
  const layout = buildBoardLayout(board);
  board.forEach((tile, index) => {
    const position = layout[index];
    const tileElement = createTileElement(tile, { board: true, vertical: position.vertical });
    tileElement.style.left = `${position.x}px`;
    tileElement.style.top = `${position.y}px`;
    elements.board.append(tileElement);
  });
}

function renderHand(hand, room, game, me) {
  elements.hand.innerHTML = "";
  hand.forEach((tile) => {
    const playable = isMyTurn(room, me) && getPlayableSides(tile, game.board).length > 0;
    const tileElement = createTileElement(tile, { draggable: playable });
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
  const selected = game.hand.find((tile) => tile.id === selectedTileId);
  const sides = selected ? getPlayableSides(selected, game.board) : [];
  elements.drawButton.disabled = !isMyTurn(room, me);
  elements.leftButton.disabled = !isMyTurn(room, me) || !selected || !sides.includes("left");
  elements.rightButton.disabled = !isMyTurn(room, me) || !selected || !sides.includes("right");

  if (room.status === "finished") {
    elements.drawButton.textContent = "Reiniciar sala";
    elements.drawButton.disabled = false;
    elements.drawButton.onclick = () => send("resetRoom");
  } else {
    elements.drawButton.textContent = "Comprar / passar";
    elements.drawButton.onclick = () => send("drawOrPass");
  }
}

function renderShadows(room, game, me) {
  const selected = game.hand.find((tile) => tile.id === selectedTileId);
  const sides = selected && isMyTurn(room, me) ? getPlayableSides(selected, game.board) : [];
  elements.leftShadow.classList.toggle("hidden", !sides.includes("left"));
  elements.rightShadow.classList.toggle("hidden", !sides.includes("right") || game.board.length === 0);
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

function buildBoardLayout(board) {
  const width = elements.board.clientWidth || 900;
  const height = elements.board.clientHeight || 360;
  const tileW = width < 520 ? 56 : 78;
  const tileH = width < 520 ? 30 : 40;
  const verticalW = tileH;
  const verticalH = tileW;
  const gap = width < 520 ? 4 : 7;
  const layout = [];
  let x = Math.max(0, width * 0.14);
  let y = Math.max(0, height * 0.42);
  let direction = 1;
  let verticalMode = false;
  let verticalSteps = 0;
  let verticalDirection = 1;

  board.forEach((_, index) => {
    const vertical = verticalMode;
    layout.push({ x, y, vertical });

    if (index === board.length - 1) {
      return;
    }

    if (verticalMode) {
      y += verticalDirection * (verticalH + gap);
      verticalSteps += 1;
      if (verticalSteps >= 2) {
        verticalMode = false;
        verticalSteps = 0;
        x += direction * (verticalW + gap);
      }
      return;
    }

    const nextX = x + direction * (tileW + gap);
    const hitRight = direction > 0 && nextX + tileW > width;
    const hitLeft = direction < 0 && nextX < 0;

    if (hitRight || hitLeft) {
      verticalMode = true;
      verticalDirection = y < height * 0.5 ? 1 : -1;
      y += verticalDirection * (tileH + gap);
      direction *= -1;
      return;
    }

    x = nextX;
  });

  return layout;
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
