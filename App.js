import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || "wss://domino-online-server.onrender.com";

export default function App() {
  const socketRef = useRef(null);
  const [name, setName] = useState("");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [state, setState] = useState(null);

  const room = state?.room;
  const game = state?.game;
  const me = state?.me;
  const myTurn = room?.status === "playing" && me?.playerIndex === room.currentPlayer;
  const joined = (me?.playerIndex ?? -1) >= 0;

  useEffect(() => {
    const socket = new WebSocket(SERVER_URL);
    socketRef.current = socket;

    socket.onopen = () => {
      setConnected(true);
      setError("");
    };
    socket.onclose = () => {
      setConnected(false);
      setError("Servidor desconectado.");
    };
    socket.onerror = () => {
      setError("Nao foi possivel conectar no servidor.");
    };
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "state") {
        setState(message.payload);
      }
      if (message.type === "error") {
        setError(message.payload.message);
      }
    };

    return () => socket.close();
  }, []);

  function send(type, payload = {}) {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type, ...payload }));
    }
  }

  function joinRoom() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Digite seu nome.");
      return;
    }
    send("join", { name: trimmedName });
  }

  const handHint = useMemo(() => {
    if (!room || !game) {
      return "";
    }
    if (room.status === "waiting") {
      return room.countdown ? `Comeca em ${room.countdown}s.` : "Aguardando jogadores.";
    }
    if (room.status === "finished") {
      return "Partida encerrada.";
    }
    if (!myTurn) {
      return "Aguarde sua vez.";
    }
    return findPlayableTile(game.hand, game.board) ? "Escolha uma pedra para jogar." : "Compre se houver monte, ou passe.";
  }, [game, myTurn, room]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>Domino Online</Text>
          <Text style={styles.subtitle}>Sala unica de teste com bots, contagem e placar ate 100</Text>
        </View>

        {!joined ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Entrar na sala</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Seu nome"
              placeholderTextColor="#8b867d"
              style={styles.input}
              maxLength={18}
            />
            <Pressable disabled={!connected} style={[styles.primaryButton, !connected && styles.buttonDisabled]} onPress={joinRoom}>
              <Text style={styles.primaryButtonText}>{connected ? "Entrar" : "Conectando..."}</Text>
            </Pressable>
            {!!error && <Text style={styles.errorText}>{error}</Text>}
          </View>
        ) : (
          <>
            <View style={styles.statusPanel}>
              <View>
                <Text style={styles.label}>Sala online</Text>
                <Text style={styles.statusTitle}>{statusText(room)}</Text>
              </View>
              {room.status === "waiting" && room.players.length === 1 && (
                <Pressable style={styles.secondaryButton} onPress={() => send("startWithBots")}>
                  <Text style={styles.secondaryButtonText}>Iniciar com bots</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.playersPanel}>
              {room.players.map((player, index) => (
                <View key={player.id} style={[styles.playerPill, index === room.currentPlayer && room.status === "playing" && styles.playerPillActive]}>
                  <Text style={styles.playerName}>{player.name}{player.bot ? " (Bot)" : ""}</Text>
                  <Text style={styles.playerMeta}>{player.handCount} pecas | {player.score} pts</Text>
                </View>
              ))}
              {Array.from({ length: room.maxPlayers - room.players.length }).map((_, index) => (
                <View key={`empty-${index}`} style={styles.emptySeat}>
                  <Text style={styles.emptySeatText}>Lugar livre</Text>
                </View>
              ))}
            </View>

            <View style={styles.table}>
              <View style={styles.tableTop}>
                <Text style={styles.label}>Mesa</Text>
                <Text style={styles.tableInfo}>{game.ends ? `Pontas ${game.ends.left} e ${game.ends.right}` : "Mesa vazia"}</Text>
              </View>
              <ScrollView horizontal contentContainerStyle={styles.board}>
                {game.board.length === 0 ? (
                  <Text style={styles.emptyBoard}>Aguardando primeira pedra</Text>
                ) : (
                  game.board.map((tile, index) => <Tile key={`${tile.id}-${index}`} tile={tile} />)
                )}
              </ScrollView>
            </View>

            <View style={styles.messagePanel}>
              <Text style={styles.turnText}>{turnText(room)}</Text>
              <Text style={styles.message}>{room.message}</Text>
              <Text style={styles.stockText}>Monte: {game.stockCount} pecas | Rodada: {room.round || 0}</Text>
              <Text style={styles.handHint}>{handHint}</Text>
              {!!error && <Text style={styles.errorText}>{error}</Text>}
            </View>

            <View style={styles.handPanel}>
              <View style={styles.handHeader}>
                <View>
                  <Text style={styles.label}>Sua mao</Text>
                  <Text style={styles.handCount}>{game.hand.length} pecas</Text>
                </View>
                <Pressable disabled={!myTurn} style={[styles.primaryButton, !myTurn && styles.buttonDisabled]} onPress={() => send("drawOrPass")}>
                  <Text style={styles.primaryButtonText}>Comprar / passar</Text>
                </Pressable>
              </View>

              <View style={styles.handGrid}>
                {game.hand.map((tile) => {
                  const playableSides = getPlayableSides(tile, game.board);
                  const isPlayable = myTurn && playableSides.length > 0;
                  return (
                    <View key={tile.id} style={styles.handTileWrap}>
                      <Tile tile={tile} compact={false} />
                      <View style={styles.tileActions}>
                        <Pressable
                          disabled={!isPlayable}
                          onPress={() => send("playTile", { tileId: tile.id, side: "left" })}
                          style={[styles.tileButton, !isPlayable && styles.tileButtonDisabled]}
                        >
                          <Text style={styles.tileButtonText}>Esq.</Text>
                        </Pressable>
                        <Pressable
                          disabled={!isPlayable}
                          onPress={() => send("playTile", { tileId: tile.id, side: "right" })}
                          style={[styles.tileButton, !isPlayable && styles.tileButtonDisabled]}
                        >
                          <Text style={styles.tileButtonText}>Dir.</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Tile({ tile, compact = true }) {
  return (
    <View style={[styles.tile, compact && styles.tileCompact]}>
      <Text style={styles.tilePip}>{tile.left}</Text>
      <View style={styles.tileDivider} />
      <Text style={styles.tilePip}>{tile.right}</Text>
    </View>
  );
}

function statusText(room) {
  if (!room) {
    return "Conectando";
  }
  if (room.status === "waiting") {
    return room.countdown ? `Fechando sala em ${room.countdown}s` : `${room.players.length}/${room.maxPlayers} jogadores`;
  }
  if (room.status === "finished") {
    return "Partida encerrada";
  }
  return `Jogando ate ${room.targetScore} pontos`;
}

function turnText(room) {
  if (room.status === "waiting") {
    return "Lobby";
  }
  if (room.status === "finished") {
    return `Vencedor: ${room.players[room.matchWinner]?.name}`;
  }
  return `Vez de ${room.players[room.currentPlayer]?.name}`;
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

function findPlayableTile(hand, board) {
  return hand.find((tile) => getPlayableSides(tile, board).length > 0);
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f6f2ea"
  },
  screen: {
    padding: 18,
    gap: 14
  },
  header: {
    paddingTop: 12
  },
  title: {
    color: "#212121",
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: 0
  },
  subtitle: {
    color: "#67645f",
    fontSize: 14,
    marginTop: 4
  },
  panel: {
    backgroundColor: "#ffffff",
    borderColor: "#dfd9cf",
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 14
  },
  panelTitle: {
    color: "#202020",
    fontSize: 20,
    fontWeight: "900"
  },
  input: {
    backgroundColor: "#fbfaf7",
    borderColor: "#cfc8bc",
    borderRadius: 8,
    borderWidth: 1,
    color: "#202020",
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  statusPanel: {
    alignItems: "center",
    backgroundColor: "#1f2d2a",
    borderRadius: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 14
  },
  label: {
    color: "#77746e",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  statusTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 2
  },
  primaryButton: {
    backgroundColor: "#c65735",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center"
  },
  secondaryButton: {
    backgroundColor: "#f7c95f",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  secondaryButtonText: {
    color: "#24211b",
    fontSize: 13,
    fontWeight: "900"
  },
  buttonDisabled: {
    backgroundColor: "#c9c4bb"
  },
  playersPanel: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  playerPill: {
    backgroundColor: "#ffffff",
    borderColor: "#dfd9cf",
    borderRadius: 8,
    borderWidth: 1,
    minWidth: "47%",
    padding: 10
  },
  playerPillActive: {
    borderColor: "#c65735",
    borderWidth: 2
  },
  playerName: {
    color: "#222222",
    fontSize: 14,
    fontWeight: "900"
  },
  playerMeta: {
    color: "#6b6861",
    fontSize: 12,
    marginTop: 2
  },
  emptySeat: {
    backgroundColor: "#eee8dd",
    borderColor: "#d7d0c4",
    borderRadius: 8,
    borderStyle: "dashed",
    borderWidth: 1,
    minWidth: "47%",
    padding: 12
  },
  emptySeatText: {
    color: "#817b70",
    fontSize: 13,
    fontWeight: "800"
  },
  table: {
    backgroundColor: "#2c7a61",
    borderRadius: 8,
    minHeight: 170,
    padding: 14
  },
  tableTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  tableInfo: {
    color: "#edf7f2",
    fontSize: 13,
    fontWeight: "800"
  },
  board: {
    alignItems: "center",
    gap: 8,
    minHeight: 115,
    paddingVertical: 12
  },
  emptyBoard: {
    color: "#edf7f2",
    fontSize: 15,
    fontWeight: "800"
  },
  tile: {
    alignItems: "center",
    backgroundColor: "#fbfaf7",
    borderColor: "#292521",
    borderRadius: 8,
    borderWidth: 2,
    flexDirection: "row",
    height: 54,
    justifyContent: "center",
    width: 92
  },
  tileCompact: {
    height: 48,
    width: 82
  },
  tilePip: {
    color: "#191715",
    fontSize: 20,
    fontWeight: "900",
    minWidth: 28,
    textAlign: "center"
  },
  tileDivider: {
    backgroundColor: "#292521",
    height: "70%",
    width: 2
  },
  messagePanel: {
    backgroundColor: "#ffffff",
    borderColor: "#dfd9cf",
    borderRadius: 8,
    borderWidth: 1,
    padding: 14
  },
  turnText: {
    color: "#202020",
    fontSize: 18,
    fontWeight: "900"
  },
  message: {
    color: "#57534d",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4
  },
  stockText: {
    color: "#8c5c1f",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 8
  },
  handHint: {
    color: "#58544f",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8
  },
  handPanel: {
    backgroundColor: "#ffffff",
    borderColor: "#dfd9cf",
    borderRadius: 8,
    borderWidth: 1,
    padding: 14
  },
  handHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  handCount: {
    color: "#58544f",
    fontSize: 14,
    marginTop: 3
  },
  handGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14
  },
  handTileWrap: {
    alignItems: "center",
    gap: 6,
    width: 92
  },
  tileActions: {
    flexDirection: "row",
    gap: 5
  },
  tileButton: {
    backgroundColor: "#1f2d2a",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6
  },
  tileButtonDisabled: {
    backgroundColor: "#c9c4bb"
  },
  tileButtonText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900"
  },
  errorText: {
    color: "#b43b24",
    fontSize: 13,
    fontWeight: "800"
  }
});
