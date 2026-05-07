const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT || 3001);
const MAX_PLAYERS = 4;
const TARGET_SCORE = 100;
const COUNTDOWN_SECONDS = 5;
const HAND_SIZE = 7;
const BOT_NAMES = ["Bot Lula", "Bot Bolsonaro", "Bot Marina", "Bot Ciro", "Bot Dilma", "Bot Temer"];
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml"
};

const room = createRoom();
const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  if (requestUrl.pathname === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, players: room.players.length, status: room.status }));
    return;
  }

  serveStaticFile(requestUrl.pathname, response);
});
const wss = new WebSocketServer({ server });

server.listen(PORT, () => {
  console.log(`Domino server running on port ${PORT}`);
});

wss.on("connection", (socket) => {
  socket.id = createId();

  socket.on("message", (raw) => {
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      send(socket, "error", { message: "Mensagem invalida." });
      return;
    }
    handleMessage(socket, payload);
  });

  socket.on("close", () => removePlayer(socket.id));
  send(socket, "state", publicStateFor(socket.id));
});

function handleMessage(socket, payload) {
  if (payload.type === "join") {
    const name = String(payload.name || "").trim().slice(0, 18);
    if (!name) {
      send(socket, "error", { message: "Digite seu nome para entrar." });
      return;
    }
    if (room.status !== "waiting" && !hasConnectedHumanPlayers()) {
      resetRoom(false);
    }
    if (room.status !== "waiting") {
      send(socket, "error", { message: "Partida em andamento. Aguarde a proxima." });
      return;
    }
    if (room.players.length >= MAX_PLAYERS || room.locked) {
      send(socket, "error", { message: "Sala fechada para novos jogadores." });
      return;
    }

    const existing = room.players.find((player) => player.id === socket.id);
    if (existing) {
      existing.name = name;
    } else {
      room.players.push({ id: socket.id, name, bot: false });
    }

    if (room.players.filter((player) => !player.bot).length >= 2) {
      startCountdown();
    }
    broadcast();
    return;
  }

  const playerIndex = room.players.findIndex((player) => player.id === socket.id);
  if (playerIndex === -1) {
    send(socket, "error", { message: "Entre na sala antes de jogar." });
    return;
  }

  if (payload.type === "startWithBots") {
    if (room.status === "waiting") {
      lockAndStart(2);
    }
    return;
  }

  if (payload.type === "startPairsWithBots") {
    if (room.status === "waiting") {
      lockAndStart(4);
    }
    return;
  }

  if (payload.type === "playTile") {
    playTile(playerIndex, payload.tileId, payload.side);
    return;
  }

  if (payload.type === "drawOrPass") {
    drawOrPass(playerIndex);
    return;
  }

  if (payload.type === "resetRoom" && room.status === "finished") {
    resetRoom();
  }
}

function createRoom() {
  return {
    status: "waiting",
    locked: false,
    players: [],
    countdown: null,
    timer: null,
    scores: [],
    board: [],
    originTileId: null,
    leftValue: null,
    rightValue: null,
    stock: [],
    hands: [],
    currentPlayer: 0,
    passes: 0,
    round: 0,
    message: "Entre com seu nome para acessar a sala.",
    matchWinner: null
  };
}

function startCountdown() {
  if (room.countdown !== null || room.status !== "waiting") {
    return;
  }

  room.countdown = COUNTDOWN_SECONDS;
  room.message = "Outro jogador entrou. Partida iniciando em 5 segundos.";
  room.timer = setInterval(() => {
    room.countdown -= 1;
    if (room.countdown <= 0) {
      clearInterval(room.timer);
      room.timer = null;
      lockAndStart(4);
      return;
    }
    broadcast();
  }, 1000);
}

function lockAndStart(targetPlayers = MAX_PLAYERS) {
  if (room.timer) {
    clearInterval(room.timer);
    room.timer = null;
  }
  room.locked = true;
  room.countdown = null;

  while (room.players.length < targetPlayers) {
    const botNumber = room.players.filter((player) => player.bot).length + 1;
    room.players.push({ id: `bot-${botNumber}`, name: BOT_NAMES[botNumber - 1] || `Bot ${botNumber}`, bot: true });
  }

  room.scores = room.players.map(() => 0);
  room.matchWinner = null;
  startRound("Partida iniciada. Vence quem fizer 100 pontos primeiro.");
}

function startRound(message) {
  const deck = shuffle(createDeck());
  room.status = "playing";
  room.round += 1;
  room.board = [];
  room.originTileId = null;
  room.leftValue = null;
  room.rightValue = null;
  room.hands = room.players.map(() => deck.splice(0, HAND_SIZE));
  room.stock = deck;
  room.currentPlayer = findStartingPlayer(room.hands);
  room.passes = 0;
  room.message = message;
  broadcast();
  scheduleBots();
}

function playTile(playerIndex, tileId, side) {
  if (room.status !== "playing" || playerIndex !== room.currentPlayer || room.matchWinner !== null) {
    return;
  }

  const tileIndex = room.hands[playerIndex].findIndex((tile) => tile.id === tileId);
  const tile = room.hands[playerIndex][tileIndex];
  if (!tile) {
    return;
  }

  const sides = getPlayableSides(tile, room.board);
  const selectedSide = sides.includes(side) ? side : null;
  if (!selectedSide) {
    room.message = "Essa peca nao encaixa nas pontas atuais.";
    broadcast();
    return;
  }

  const [playedTile] = room.hands[playerIndex].splice(tileIndex, 1);
  if (room.board.length === 0) {
    room.originTileId = playedTile.id;
  }
  const placedTile = orientTile(playedTile, selectedSide, room.board);
  if (selectedSide === "left") {
    room.board.unshift(placedTile);
  } else {
    room.board.push(placedTile);
  }
  updateBoardEnds();

  room.passes = 0;
  room.message = `${room.players[playerIndex].name} jogou ${formatTile(playedTile)}.`;

  if (room.hands[playerIndex].length === 0) {
    finishRound(playerIndex, "bateu");
    return;
  }

  room.currentPlayer = nextPlayer(playerIndex);
  broadcast();
  scheduleBots();
}

function drawOrPass(playerIndex) {
  if (room.status !== "playing" || playerIndex !== room.currentPlayer || room.matchWinner !== null) {
    return;
  }

  if (findPlayableTile(room.hands[playerIndex], room.board)) {
    room.message = "Voce tem peca para jogar.";
    broadcast();
    return;
  }

  if (room.stock.length > 0) {
    const tile = room.stock.shift();
    room.hands[playerIndex].push(tile);
    room.message = `${room.players[playerIndex].name} comprou uma peca.`;
    broadcast();
    scheduleBots();
    return;
  }

  room.passes += 1;
  if (room.passes >= room.players.length) {
    finishRound(getLowestHandPlayer(), "fechou a mesa");
    return;
  }

  room.message = `${room.players[playerIndex].name} passou.`;
  room.currentPlayer = nextPlayer(playerIndex);
  broadcast();
  scheduleBots();
}

function finishRound(winnerIndex, reason) {
  const roundPoints = room.hands.reduce((total, hand, index) => {
    if (index === winnerIndex) {
      return total;
    }
    return total + scoreHand(hand);
  }, 0);

  room.scores[winnerIndex] += roundPoints;
  const winnerScore = room.scores[winnerIndex];
  room.message = `${room.players[winnerIndex].name} ${reason} e ganhou ${roundPoints} pontos.`;

  if (winnerScore >= TARGET_SCORE) {
    room.status = "finished";
    room.matchWinner = winnerIndex;
    room.message = `${room.players[winnerIndex].name} venceu a partida com ${winnerScore} pontos.`;
    broadcast();
    return;
  }

  broadcast();
  setTimeout(() => {
    startRound(`Nova rodada. Placar: ${formatScoreboard()}.`);
  }, 3500);
}

function scheduleBots() {
  if (room.status !== "playing") {
    return;
  }

  const player = room.players[room.currentPlayer];
  if (!player || !player.bot) {
    return;
  }

  setTimeout(() => {
    if (room.status !== "playing" || !room.players[room.currentPlayer]?.bot) {
      return;
    }
    const playable = findPlayableTile(room.hands[room.currentPlayer], room.board);
    if (playable) {
      playTile(room.currentPlayer, playable.tile.id, playable.side);
    } else {
      drawOrPass(room.currentPlayer);
    }
  }, 900);
}

function publicStateFor(socketId) {
  const playerIndex = room.players.findIndex((player) => player.id === socketId);
  return {
    room: {
      status: room.status,
      locked: room.locked,
      countdown: room.countdown,
      players: room.players.map((player, index) => ({
        id: player.id,
        name: player.name,
        bot: player.bot,
        handCount: room.hands[index]?.length ?? 0,
        score: room.scores[index] ?? 0
      })),
      maxPlayers: MAX_PLAYERS,
      targetScore: TARGET_SCORE,
      round: room.round,
      message: room.message,
      currentPlayer: room.currentPlayer,
      matchWinner: room.matchWinner
    },
    game: {
      board: room.board,
      originTileId: room.originTileId,
      leftValue: room.leftValue,
      rightValue: room.rightValue,
      stockCount: room.stock.length,
      ends: getEnds(room.board),
      hand: playerIndex >= 0 && !room.players[playerIndex]?.bot ? room.hands[playerIndex] ?? [] : []
    },
    me: {
      id: socketId,
      playerIndex
    }
  };
}

function broadcast() {
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      send(client, "state", publicStateFor(client.id));
    }
  }
}

function send(socket, type, payload) {
  socket.send(JSON.stringify({ type, payload }));
}

function removePlayer(socketId) {
  const index = room.players.findIndex((player) => player.id === socketId);
  if (index === -1) {
    return;
  }

  if (room.status !== "waiting") {
    if (!hasConnectedHumanPlayers(socketId)) {
      resetRoom();
    }
    return;
  }

  room.players.splice(index, 1);
  if (room.players.filter((player) => !player.bot).length < 2 && room.timer) {
    clearInterval(room.timer);
    room.timer = null;
    room.countdown = null;
    room.message = "Aguardando jogadores.";
  }
  broadcast();
}

function hasConnectedHumanPlayers(exceptSocketId = null) {
  const connectedIds = new Set(
    [...wss.clients]
      .filter((client) => client.readyState === 1 && client.id !== exceptSocketId)
      .map((client) => client.id)
  );
  return room.players.some((player) => !player.bot && connectedIds.has(player.id));
}

function resetRoom(shouldBroadcast = true) {
  if (room.timer) {
    clearInterval(room.timer);
  }
  Object.assign(room, createRoom());
  if (shouldBroadcast) {
    broadcast();
  }
}

function serveStaticFile(urlPath, response) {
  const requestedPath = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const contentType = MIME_TYPES[path.extname(filePath)] || "application/octet-stream";
    response.writeHead(200, { "content-type": contentType, "cache-control": "no-cache" });
    response.end(data);
  });
}

function createDeck() {
  const deck = [];
  let id = 1;
  for (let left = 0; left <= 6; left += 1) {
    for (let right = left; right <= 6; right += 1) {
      deck.push({ id: String(id), left, right });
      id += 1;
    }
  }
  return deck;
}

function shuffle(items) {
  const deck = [...items];
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
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

function updateBoardEnds() {
  const ends = getEnds(room.board);
  room.leftValue = ends?.left ?? null;
  room.rightValue = ends?.right ?? null;
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

function orientTile(tile, side, board) {
  if (board.length === 0) {
    return tile;
  }
  const ends = getEnds(board);
  if (side === "left") {
    return tile.right === ends.left ? tile : { ...tile, left: tile.right, right: tile.left };
  }
  return tile.left === ends.right ? tile : { ...tile, left: tile.right, right: tile.left };
}

function findPlayableTile(hand, board) {
  for (const tile of hand) {
    const sides = getPlayableSides(tile, board);
    if (sides.length > 0) {
      return { tile, side: sides[0] };
    }
  }
  return null;
}

function findStartingPlayer(hands) {
  let best = { player: 0, value: -1 };
  hands.forEach((hand, player) => {
    hand.forEach((tile) => {
      const value = tile.left === tile.right ? tile.left + tile.right + 20 : tile.left + tile.right;
      if (value > best.value) {
        best = { player, value };
      }
    });
  });
  return best.player;
}

function getLowestHandPlayer() {
  let best = { player: 0, score: Number.POSITIVE_INFINITY };
  room.hands.forEach((hand, player) => {
    const score = scoreHand(hand);
    if (score < best.score) {
      best = { player, score };
    }
  });
  return best.player;
}

function scoreHand(hand) {
  return hand.reduce((total, tile) => total + tile.left + tile.right, 0);
}

function nextPlayer(playerIndex) {
  return (playerIndex + 1) % room.players.length;
}

function formatTile(tile) {
  return `[${tile.left}|${tile.right}]`;
}

function formatScoreboard() {
  return room.players.map((player, index) => `${player.name} ${room.scores[index]}`).join(", ");
}

function createId() {
  return Math.random().toString(36).slice(2, 10);
}
