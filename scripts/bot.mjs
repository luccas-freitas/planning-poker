// Bot de teste: entra numa sala como outro usuário, fica online e (opcional) vota.
// Uso: node scripts/bot.mjs <slug> [nome] [segundos] [voto]
// Com [voto], vota ao entrar e de novo a cada nova rodada.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=")).map((l) => l.split("=")),
);
const [slug, name = "Bot", seconds = "120", vote] = process.argv.slice(2);
const avatar = `dicebear:bottts:${name}`;
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false },
});
const { data: auth } = await sb.auth.signInAnonymously();
const userId = auth.user.id;
const { data: roomId, error } = await sb.rpc("join_room", {
  p_slug: slug, p_display_name: name, p_avatar_url: avatar,
});
if (error) throw error;

const onlineAt = new Date().toISOString();
const ch = sb.channel(`room:${roomId}`, { config: { presence: { key: userId } } });
const track = (hasVoted) =>
  ch.track({ userId, name, avatar, role: "player", hasVoted, onlineAt });

async function castVote() {
  if (!vote) return;
  await new Promise((r) => setTimeout(r, 800 + Math.random() * 1500));
  const { error } = await sb.rpc("cast_vote", { p_room_id: roomId, p_value: vote });
  if (error) return console.log(`${name}: erro ao votar`, error.message);
  await track(true);
  console.log(`${name} votou ${vote}`);
}

let currentRound = (await sb.from("rooms").select("current_round_id").eq("id", roomId).single())
  .data?.current_round_id;

ch.on("postgres_changes",
  { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
  async ({ new: room }) => {
    if (room.current_round_id === currentRound) return; // só nova rodada
    currentRound = room.current_round_id;
    await track(false);
    void castVote();
  },
).subscribe(async (s) => {
  if (s !== "SUBSCRIBED") return;
  await track(false);
  console.log(`${name} online em ${slug}`);
  void castVote();
});
setTimeout(async () => { await sb.removeAllChannels(); process.exit(0); }, Number(seconds) * 1000);
