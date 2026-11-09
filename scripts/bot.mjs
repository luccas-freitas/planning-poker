// Bot de teste: entra numa sala como outro usuário e fica online.
// Uso: node scripts/bot.mjs <slug> [nome] [segundos]
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=")).map((l) => l.split("=")),
);
const [slug, name = "Bot", seconds = "120"] = process.argv.slice(2);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false },
});
const { data: auth } = await sb.auth.signInAnonymously();
const userId = auth.user.id;
const { data: roomId, error } = await sb.rpc("join_room", {
  p_slug: slug, p_display_name: name, p_avatar_url: `dicebear:bottts:${name}`,
});
if (error) throw error;
const ch = sb.channel(`room:${roomId}`, { config: { presence: { key: userId } } });
ch.subscribe(async (s) => {
  if (s !== "SUBSCRIBED") return;
  await ch.track({ userId, name, avatar: `dicebear:bottts:${name}`, role: "player",
    hasVoted: false, onlineAt: new Date().toISOString() });
  console.log(`${name} online em ${slug}`);
});
setTimeout(async () => { await sb.removeAllChannels(); process.exit(0); }, Number(seconds) * 1000);
