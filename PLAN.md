# Planning Poker — Plano do Projeto

App de planning poker em tempo real para o time de desenvolvimento.
Sem login, sem integrações, sem dados sensíveis. **100% gratuito.**

## 1. Escopo do MVP

### Entra
- Tela de perfil: nome + avatar (avatares prontos ou upload de foto), salvo no navegador
- Criar sala e compartilhar link (`/r/abc123`)
- Entrar pelo link (se não tiver perfil, mostra a tela de perfil antes)
- Papel **jogador** ou **espectador** (alternável a qualquer momento)
- Cartas Fibonacci: `0, 1, 2, 3, 5, 8, 13, 21, ?, ☕`
- Votar e trocar o voto enquanto a rodada está aberta
- Indicador de quem já votou (sem mostrar o valor)
- **Revelar**: cartas viram + gráfico de distribuição, média, mediana e indicador de consenso
- Nova rodada (limpa os votos)
- Reações com emoji flutuando na tela
- Lista de participantes online

### Fica fora (por enquanto)
- Login, Jira/integrações, histórico entre sessões, decks customizados, timer, chat

## 2. Identidade sem login

Não haverá tela de login. Usaremos o **Anonymous Sign-in do Supabase**, invisível
para o usuário: na primeira visita uma sessão anônima é criada e salva no navegador.

Motivos:
- Permite regras de segurança (RLS) que **escondem os votos até o reveal**
- Impede que um usuário altere/apague o voto de outro

Dados guardados: apenas nome, avatar e votos.

## 3. Arquitetura

Tudo no **Supabase** (o banco do Supabase *é* um Postgres gerenciado — não há
banco separado).

```
Navegador (Next.js)
  ├─ Supabase Auth (anônimo)     → identidade invisível
  ├─ Supabase Database + RLS     → salas, participantes, rodadas, votos
  ├─ Supabase Realtime Presence  → quem está online / quem já votou
  ├─ Supabase Realtime Broadcast → reações com emoji (efêmeras, não persistem)
  ├─ Supabase Realtime Changes   → mudanças de rodada (revelou / nova rodada)
  ├─ Supabase Storage            → fotos enviadas (bucket `avatars`)
  └─ Supabase pg_cron            → limpeza de salas inativas
```

A Presence só publica *se* a pessoa votou, nunca o valor. No reveal, cada cliente
busca os votos no banco, e a RLS passa a liberá-los.

## 4. Modelo de dados

```sql
rooms        (id uuid pk, slug text unique, name text, host_id uuid,
              current_round_id uuid, created_at, last_activity_at)
participants (room_id, user_id, display_name, avatar_url,
              role 'player' | 'spectator', joined_at)
              pk (room_id, user_id)
rounds       (id uuid pk, room_id, title text null, revealed bool,
              revealed_at, created_at)
votes        (round_id, user_id, value text, updated_at)
              pk (round_id, user_id)
```

### Regras (RLS / RPC)

| Regra | Implementação |
|---|---|
| Votos ocultos | `select` em `votes` só se `user_id = auth.uid()` **ou** rodada `revealed` |
| Só jogador vota, só com rodada aberta | `insert/update` em `votes` exige `role = 'player'` e `revealed = false` |
| Revelar / nova rodada | RPCs `reveal_round(room_id)` e `new_round(room_id, title)` |
| Upload de avatar | Bucket `avatars`, cada usuário só escreve em `avatars/<auth.uid()>/*`, máx. 2 MB |
| Limpeza | `pg_cron` diário apaga salas sem atividade há 7 dias e avatares órfãos |

## 5. Telas

### `/` — Início
- Card de perfil: nome, grade com ~12 avatares (DiceBear, gerados localmente),
  botão de upload (recorte/redimensiona no navegador → 256px WebP)
- Botão **Criar sala** (nome opcional)
- Campo "Entrar com código/link"

### `/r/[slug]` — Sala
- Mesa central com participantes ao redor (avatar, nome, carta virada/desvirada)
- Barra de cartas na parte de baixo (oculta para espectadores)
- Botões **Revelar** / **Nova rodada**, toggle Jogador/Espectador
- Botão "Copiar link" e barra de reações
- Pós-reveal: gráfico de barras (Recharts) com distribuição, média, mediana e
  "🎉 Consenso!" quando todos votarem igual

## 6. Ferramentas (todas gratuitas)

### Desenvolvimento
| Ferramenta | Uso |
|---|---|
| Node.js 24 + npm | Runtime e gerenciador de pacotes (já instalados) |
| Next.js (App Router) + TypeScript | Framework do frontend |
| Tailwind CSS | Estilos |
| shadcn/ui | Componentes base (botão, dialog, toast) — código copiado pro projeto, sem dependência paga |
| `@supabase/supabase-js` | Cliente do Supabase |
| Supabase CLI + Docker | Supabase local para desenvolvimento e migrations versionadas |
| Recharts | Gráfico de resultados |
| framer-motion | Animação de virar carta e emojis flutuando |
| `@dicebear/core` + `@dicebear/collection` | Avatares prontos gerados localmente (sem API externa) |
| ESLint + Prettier | Qualidade de código |
| Git + GitHub | Versionamento e gatilho de deploy |

### Hospedagem
| Serviço | Plano | Limites relevantes |
|---|---|---|
| **Supabase** | Free | 500 MB de banco, 1 GB de storage, 200 conexões realtime simultâneas, 2 projetos. **Pausa após 7 dias sem uso** (reativa no painel) |
| **Vercel** | Hobby (free) | Deploy automático por push, preview por PR. **Atenção:** os termos do Hobby restringem uso comercial — para ferramenta interna de empresa, considerar Cloudflare Pages/Workers ou Netlify (planos free) |

Para o tamanho de um time, os limites gratuitos sobram.

## 7. Estrutura de pastas

```
app/
  page.tsx                 # início / perfil / criar sala
  r/[slug]/page.tsx        # sala
components/
  ProfileForm, AvatarPicker, Table, PlayerSeat,
  CardDeck, ResultsChart, ReactionBar
hooks/
  useProfile, useRoom, usePresence, useReactions
lib/
  supabase.ts, deck.ts, stats.ts
supabase/
  migrations/              # schema, RLS, RPCs, cron
  config.toml
```

## 8. Etapas

1. **Setup** — Next.js + Tailwind + shadcn, Supabase CLI local, migrations com schema e RLS
2. **Perfil** — auth anônimo, avatares prontos, upload
3. **Salas** — criar, entrar por link, lista de participantes, Presence
4. **Votação** — cartas, editar voto, indicador "já votou", revelar, nova rodada
5. **Resultados** — gráfico e estatísticas
6. **Extras** — reações, espectador, animações, responsividade mobile
7. **Deploy** — projeto Supabase cloud, hospedagem do front, cron de limpeza

Cada etapa é validada rodando localmente com duas janelas na mesma sala.

## 9. Decisões (confirmadas)

1. Quem pode revelar / iniciar nova rodada? → **Qualquer participante**
2. Rodadas com título da história? → **Sim, opcional, texto livre**
3. Pode trocar voto após o reveal? → **Não; só até revelar**
4. Idioma da interface? → **Português**
5. Expiração de salas inativas? → **7 dias**
6. Hospedagem do front? → **Vercel** (ou Cloudflare/Netlify por causa da restrição comercial) — decidir na etapa 7

## 10. Progresso

- [x] **Etapa 1 — Setup** (2026-11-09)
  - Next.js 16 + Tailwind 4 + shadcn/ui; Supabase local via CLI
  - Migration `supabase/migrations/20261109000000_init.sql`: tabelas, RLS, RPCs,
    Realtime, bucket `avatars`, limpeza via pg_cron
  - Escrita só por RPC (`security definer`); tabelas somente leitura via RLS
  - Slug da sala gerado no banco (12 chars hex) — `nanoid` não é mais necessário
  - Testes: `npm run db:test` (SQL) e `npm run test:e2e` (API real)
- [ ] Etapa 2 — Perfil
- [ ] Etapa 3 — Salas
- [ ] Etapa 4 — Votação
- [ ] Etapa 5 — Resultados
- [ ] Etapa 6 — Extras
- [ ] Etapa 7 — Deploy

### Aprendizados / pendências
- **Realtime:** `postgres_changes` só fica ativo após a mensagem `system`
  (`extension: "postgres_changes", status: "ok"`), que chega depois do `SUBSCRIBED`.
  O front deve esperar essa mensagem e refazer o fetch do estado ao recebê-la.
- **Storage:** `upsert` exige policy de `SELECT` além de `INSERT`/`UPDATE`.
- **Avatares órfãos:** Supabase não permite apagar `storage.objects` via SQL;
  limpeza de avatares fica para a etapa 7 (Storage API).
- **Produção:** habilitar "Anonymous sign-ins" no dashboard e considerar CAPTCHA
  (Turnstile, gratuito) para evitar abuso na criação de sessões.
