# Domino Online Web

Prototipo web online de Domino com servidor WebSocket. O Render serve a pagina web e o jogo online no mesmo dominio.

Nesta versao:

- O jogador entra informando o nome.
- A sala aceita ate 4 jogadores.
- Se houver so um jogador, aparece o botao `Iniciar com bots`.
- Quando entra uma segunda pessoa, inicia uma contagem de 5 segundos.
- Ao final da contagem, a sala fecha para novos jogadores, completa os lugares vazios com bots e comeca a partida.
- Vence quem fizer 100 pontos primeiro.
- Os pontos da rodada sao a soma das pedras restantes dos oponentes.

## Rodar em desenvolvimento web

```bash
npm.cmd install
npm.cmd run server
```

Abra `http://localhost:3001` no navegador.

## Rodar online

Para ser online de verdade, hospede o servidor em uma plataforma publica. O servidor esta em `server/server.cjs`, usa a variavel `PORT` da hospedagem e expõe:

- WebSocket na URL publica do servico.
- `GET /health` para checagem de saude.

Depois de publicar, abra a URL do Render no navegador.

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

7. A URL publica abre o jogo web diretamente.

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
