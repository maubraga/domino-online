export const ROOMS = [
  {
    id: "solo",
    name: "Sala 1 pessoa",
    subtitle: "Treino livre para testar regras e jogadas.",
    players: ["Voce"],
    humanIndex: 0,
    handSize: 7,
    teams: null
  },
  {
    id: "pairs",
    name: "Sala 4 pessoas",
    subtitle: "Duplas: Voce + Bot 3 contra Bot 1 + Bot 2.",
    players: ["Voce", "Bot 1", "Bot 2", "Bot 3"],
    humanIndex: 0,
    handSize: 7,
    teams: ["Time A", "Time B", "Time B", "Time A"]
  },
  {
    id: "bot",
    name: "Contra o robo",
    subtitle: "Partida rapida de 1 contra 1.",
    players: ["Voce", "Robo"],
    humanIndex: 0,
    handSize: 7,
    teams: null
  }
];

const PIPS = [0, 1, 2, 3, 4, 5, 6];

export function createGame(room) {
  const deck = shuffle(createDeck());
  const hands = room.players.map(() => deck.splice(0, room.handSize));

  return {
    room,
    board: [],
    stock: deck,
    hands,
    currentPlayer: findStartingPlayer(hands),
    message: "Partida iniciada.",
    passes: 0,
    winner: null,
    lastMove: null
  };
}

export function getEnds(board) {
  if (board.length === 0) {
    return null;
  }

  return {
    left: board[0][0],
    right: board[board.length - 1][1]
  };
}

export function getPlayableSides(tile, board) {
  if (board.length === 0) {
    return ["left"];
  }

  const ends = getEnds(board);
  const sides = [];
  if (tile[0] === ends.left || tile[1] === ends.left) {
    sides.push("left");
  }
  if (tile[0] === ends.right || tile[1] === ends.right) {
    sides.push("right");
  }
  return sides;
}

export function playTile(game, playerIndex, tileIndex, side) {
  if (game.winner !== null || playerIndex !== game.currentPlayer) {
    return game;
  }

  const tile = game.hands[playerIndex][tileIndex];
  if (!tile) {
    return game;
  }

  const playableSides = getPlayableSides(tile, game.board);
  const selectedSide = playableSides.includes(side) ? side : playableSides[0];
  if (!selectedSide) {
    return {
      ...game,
      message: "Essa peca nao encaixa nas pontas atuais."
    };
  }

  const hands = cloneHands(game.hands);
  const board = [...game.board];
  const [playedTile] = hands[playerIndex].splice(tileIndex, 1);
  const placedTile = orientTile(playedTile, selectedSide, board);

  if (selectedSide === "left") {
    board.unshift(placedTile);
  } else {
    board.push(placedTile);
  }

  const winner = hands[playerIndex].length === 0 ? playerIndex : null;
  return {
    ...game,
    board,
    hands,
    currentPlayer: winner === null ? nextPlayer(game, playerIndex) : playerIndex,
    message:
      winner === null
        ? `${game.room.players[playerIndex]} jogou ${formatTile(playedTile)}.`
        : `${game.room.players[playerIndex]} venceu a rodada.`,
    passes: 0,
    winner,
    lastMove: {
      player: playerIndex,
      tile: playedTile,
      side: selectedSide
    }
  };
}

export function drawOrPass(game, playerIndex) {
  if (game.winner !== null || playerIndex !== game.currentPlayer) {
    return game;
  }

  const playable = findPlayableTile(game.hands[playerIndex], game.board);
  if (playable) {
    return {
      ...game,
      message: "Voce tem peca para jogar."
    };
  }

  if (game.stock.length > 0) {
    const hands = cloneHands(game.hands);
    const stock = [...game.stock];
    hands[playerIndex].push(stock.shift());
    return {
      ...game,
      hands,
      stock,
      message: `${game.room.players[playerIndex]} comprou uma peca.`
    };
  }

  const passes = game.passes + 1;
  const blocked = passes >= game.room.players.length;
  return {
    ...game,
    currentPlayer: blocked ? playerIndex : nextPlayer(game, playerIndex),
    message: blocked ? "Mesa fechada. Ninguem tem jogada." : `${game.room.players[playerIndex]} passou.`,
    passes,
    winner: blocked ? getLowestHandPlayer(game.hands) : null
  };
}

export function runBotTurn(game) {
  const playerIndex = game.currentPlayer;
  if (playerIndex === game.room.humanIndex || game.winner !== null) {
    return game;
  }

  const playable = findPlayableTile(game.hands[playerIndex], game.board);
  if (playable) {
    return playTile(game, playerIndex, playable.tileIndex, playable.side);
  }

  return drawOrPass(game, playerIndex);
}

export function findPlayableTile(hand, board) {
  for (let tileIndex = 0; tileIndex < hand.length; tileIndex += 1) {
    const sides = getPlayableSides(hand[tileIndex], board);
    if (sides.length > 0) {
      return {
        tileIndex,
        side: sides[0]
      };
    }
  }
  return null;
}

export function formatTile(tile) {
  return `[${tile[0]}|${tile[1]}]`;
}

function createDeck() {
  const deck = [];
  PIPS.forEach((left) => {
    for (let right = left; right <= 6; right += 1) {
      deck.push([left, right]);
    }
  });
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

function findStartingPlayer(hands) {
  let best = {
    player: 0,
    value: -1
  };

  hands.forEach((hand, player) => {
    hand.forEach(([left, right]) => {
      const value = left === right ? left + right + 20 : left + right;
      if (value > best.value) {
        best = { player, value };
      }
    });
  });

  return best.player;
}

function orientTile(tile, side, board) {
  if (board.length === 0) {
    return tile;
  }

  const ends = getEnds(board);
  if (side === "left") {
    return tile[1] === ends.left ? tile : [tile[1], tile[0]];
  }

  return tile[0] === ends.right ? tile : [tile[1], tile[0]];
}

function nextPlayer(game, playerIndex) {
  return (playerIndex + 1) % game.room.players.length;
}

function cloneHands(hands) {
  return hands.map((hand) => hand.map((tile) => [...tile]));
}

function getLowestHandPlayer(hands) {
  let best = {
    player: 0,
    score: Number.POSITIVE_INFINITY
  };

  hands.forEach((hand, player) => {
    const score = hand.reduce((sum, tile) => sum + tile[0] + tile[1], 0);
    if (score < best.score) {
      best = { player, score };
    }
  });

  return best.player;
}
