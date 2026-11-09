// Teste ponta a ponta contra o Supabase local: auth anônimo, RPCs, RLS,
// Realtime (changes, presence, broadcast) e Storage.
// Uso: npm run test:e2e   (requer `npm run db:start`)
// Contra outro projeto: NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... npm run test:e2e
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => l.split("=")),
);
const URL_ =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const mk = () => createClient(URL_, KEY, { auth: { persistSession: false } });
const ok = (cond, msg) => {
  if (!cond) throw new Error("❌ " + msg);
  console.log("✓", msg);
};
const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};
const waitFor = (pred, label, ms = 5000) =>
  new Promise((res, rej) => {
    const t0 = Date.now();
    const i = setInterval(() => {
      if (pred()) {
        clearInterval(i);
        res();
      } else if (Date.now() - t0 > ms) {
        clearInterval(i);
        rej(new Error("❌ timeout: " + label));
      }
    }, 50);
  });

const alice = mk(),
  bob = mk();
const aliceId = must(await alice.auth.signInAnonymously()).user.id;
must(await bob.auth.signInAnonymously());
ok(aliceId, "login anônimo");

const slug = must(
  await alice.rpc("create_room", {
    p_display_name: "Alice",
    p_name: "Sprint 42",
  }),
);
ok(/^[a-z0-9]{12}$/.test(slug), `sala criada (${slug})`);
const roomId = must(
  await bob.rpc("join_room", { p_slug: slug, p_display_name: "Bob" }),
);

// Alice escuta mudanças de rodada, presença e reações
const roundEvents = [],
  reactions = [],
  system = [];
let presence = {};
const ch = alice
  .channel(`room:${roomId}`, { config: { presence: { key: aliceId } } })
  .on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "rounds",
      filter: `room_id=eq.${roomId}`,
    },
    (p) => roundEvents.push(p),
  )
  .on("presence", { event: "sync" }, () => {
    presence = ch.presenceState();
  })
  .on("broadcast", { event: "reaction" }, ({ payload }) =>
    reactions.push(payload),
  )
  .on("system", {}, (p) => system.push(p));
await new Promise((res, rej) =>
  ch.subscribe((s) =>
    s === "SUBSCRIBED" ? res() : s.endsWith("ERROR") && rej(s),
  ),
);
// postgres_changes fica pronto só após a mensagem de sistema do servidor
await waitFor(
  () => system.some((m) => m.extension === "postgres_changes"),
  "postgres_changes pronto",
  10000,
);

const bobCh = bob.channel(`room:${roomId}`, {
  config: { presence: { key: "bob" } },
});
await new Promise((res) => bobCh.subscribe((s) => s === "SUBSCRIBED" && res()));
await bobCh.track({ name: "Bob", hasVoted: true });
await waitFor(() => presence.bob?.[0]?.hasVoted === true, "presence");
ok(true, "presence: Alice vê que Bob votou");

await bobCh.send({
  type: "broadcast",
  event: "reaction",
  payload: { emoji: "🎉" },
});
await waitFor(() => reactions.length === 1, "broadcast");
ok(reactions[0].emoji === "🎉", "broadcast: reação recebida");

must(await bob.rpc("cast_vote", { p_room_id: roomId, p_value: "8" }));
must(await alice.rpc("cast_vote", { p_room_id: roomId, p_value: "5" }));
ok(
  must(await alice.from("votes").select()).length === 1,
  "antes do reveal Alice só vê o próprio voto",
);

must(await bob.rpc("reveal_round", { p_room_id: roomId }));
await waitFor(
  () => roundEvents.some((e) => e.new?.revealed),
  "realtime reveal",
);
ok(true, "realtime: Alice recebeu o reveal");
ok(
  must(await alice.from("votes").select()).length === 2,
  "após reveal Alice vê os 2 votos",
);

const outsider = mk();
must(await outsider.auth.signInAnonymously());
ok(
  must(await outsider.from("rooms").select()).length === 0,
  "estranho não lista salas",
);

const img = new Blob([new Uint8Array([0x52, 0x49, 0x46, 0x46])], {
  type: "image/webp",
});
const up = await alice.storage
  .from("avatars")
  .upload(`${aliceId}/avatar.webp`, img, { upsert: true });
ok(!up.error, "upload de avatar na própria pasta");
const bad = await bob.storage
  .from("avatars")
  .upload(`${aliceId}/hack.webp`, img);
ok(!!bad.error, "upload na pasta de outro usuário é bloqueado");

await alice.removeAllChannels();
await bob.removeAllChannels();
console.log("\n✅ E2E ok");
process.exit(0);
