# Planning Poker

Planning poker em tempo real para o time. Next.js + Tailwind + Supabase. Veja o [PLAN.md](./PLAN.md).

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
| `node scripts/bot.mjs <código> [nome] [segundos] [voto]` | Coloca um participante falso na sala (e vota a cada rodada) |

## Banco de dados

- Migrations em `supabase/migrations/`
- Tabelas são somente leitura para o cliente; toda escrita é via RPC (`create_room`,
  `join_room`, `cast_vote`, `reveal_round`, `new_round`, `set_role`, `set_round_title`, `leave_room`)
- Votos ficam ocultos (RLS) até a rodada ser revelada
