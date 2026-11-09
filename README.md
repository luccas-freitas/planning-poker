# Planning Poker

Planning poker em tempo real para times de desenvolvimento. Sem cadastro: escolha
um nome e uma foto, crie uma sala e compartilhe o link.

Feito com Next.js, Tailwind e Supabase, tudo em planos gratuitos. Decisões e
arquitetura no [PLAN.md](./PLAN.md).

## Funcionalidades

- Salas por link, sem login (sessão anônima invisível do Supabase)
- Cartas Fibonacci (`0 1 2 3 5 8 13 21 ? ☕`), troca de voto até revelar
- Resultado com gráfico, média, mediana, sugestão de estimativa, aviso de
  consenso e de votos muito diferentes
- Reações com emoji, inclusive arremessadas em outra pessoa
- Avatar pronto (DiceBear) ou foto enviada
- Modo espectador
- Tema claro/escuro seguindo o sistema

## Privacidade

Nenhum dado sensível é guardado: só o nome e o avatar escolhidos, os votos e as
salas. Salas sem atividade há 7 dias são apagadas automaticamente.

## Pré-requisitos

- Node.js 20+
- Docker (para o Supabase local)

## Rodando localmente

```bash
npm install
npm run db:start          # sobe o Supabase local (1ª vez baixa as imagens Docker)
cp .env.example .env.local
# preencha NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY com o "Publishable key" de `npx supabase status`
npm run dev               # http://localhost:3000
```

Supabase Studio local: http://127.0.0.1:54323

## Scripts

| Script | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run lint` / `typecheck` / `format` | Qualidade de código |
| `npm run db:start` / `db:stop` | Sobe/derruba o Supabase local |
| `npm run db:reset` | Recria o banco aplicando as migrations |
| `npm run db:types` | Regenera `lib/database.types.ts` a partir do banco |
| `npm run db:test` | Testes de RLS/RPC em SQL (`supabase/tests/rls_smoke.sql`) |
| `npm run test:e2e` | Teste ponta a ponta: auth anônimo, Realtime e Storage |
| `node scripts/bot.mjs <código> [nome] [segundos] [voto]` | Coloca um participante falso na sala (e vota a cada rodada). `BOT_REACT=2` faz ele reagir a cada 2s |

## Banco de dados

- Migrations em `supabase/migrations/`
- Tabelas são somente leitura para o cliente; toda escrita é via RPC (`create_room`,
  `join_room`, `cast_vote`, `reveal_round`, `new_round`, `set_role`, `set_round_title`, `leave_room`)
- Votos ficam ocultos (RLS) até a rodada ser revelada

## Licença

[MIT](./LICENSE)
