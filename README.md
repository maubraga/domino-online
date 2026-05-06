# App de jogos - Domino Online

Prototipo em Expo/React Native para Android com servidor WebSocket pronto para rodar localmente ou em hospedagem publica.

Nesta versao:

- O jogador entra informando o nome.
- A sala aceita ate 4 jogadores.
- Se houver so um jogador, aparece o botao `Iniciar com bots`.
- Quando entra uma segunda pessoa, inicia uma contagem de 5 segundos.
- Ao final da contagem, a sala fecha para novos jogadores, completa os lugares vazios com bots e comeca a partida.
- Vence quem fizer 100 pontos primeiro.
- Os pontos da rodada sao a soma das pedras restantes dos oponentes.

## Rodar em desenvolvimento

```bash
npm.cmd install
npm.cmd run dev
```

Tambem da para rodar separado:

```bash
npm.cmd run server
npm.cmd start
```

Por padrao o app conecta em `wss://domino-online-server.onrender.com`.

## Rodar online

Para ser online de verdade, hospede o servidor em uma plataforma publica. O servidor esta em `server/server.cjs`, usa a variavel `PORT` da hospedagem e expõe:

- WebSocket na URL publica do servico.
- `GET /health` para checagem de saude.

Depois de publicar o servidor, configure o app com a URL publica:

```bash
set EXPO_PUBLIC_SERVER_URL=wss://seu-servidor-publico.com
npm.cmd start
```

Para APK, gere o build ja com essa variavel configurada. Em producao use `wss://`, nao `ws://`, porque a conexao precisa ser segura.

### Publicar no Render

1. Crie um repositorio no GitHub.
2. Envie este projeto para o repositorio.
3. No Render, clique em `New +` e depois `Blueprint`.
4. Conecte o repositorio do GitHub.
5. O Render vai ler o arquivo `render.yaml` e criar o servico `domino-online-server`.
6. Depois do deploy, teste:

```txt
https://NOME-DO-SERVICO.onrender.com/health
```

7. A URL do app sera a mesma, trocando `https` por `wss`:

```txt
wss://NOME-DO-SERVICO.onrender.com
```

## Gerar APK de teste

O projeto ja tem o perfil `preview` configurado para APK:

```bash
npm.cmd run apk
```

Esse comando usa EAS Build. Na primeira execucao, o Expo pode pedir login e configuracao do projeto.

## Proximos passos naturais

- Criar varias salas em paralelo.
- Persistir usuarios e partidas em banco de dados.
- Criar cadastro/login e carteira de partidas.
- Melhorar regras de bloqueio, duplas e ranking.
