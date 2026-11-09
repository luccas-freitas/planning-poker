-- Quem já votou na rodada atual (só os ids, nunca os valores).
--
-- Antes, o "já votou" ia no Presence do Realtime, mas o Supabase permite só
-- 5 atualizações de Presence por cliente a cada 30 s e derruba o canal de quem
-- passa disso (ClientPresenceRateLimitReached). Agora o front busca esta lista
-- quando alguém avisa por Broadcast que votou.
create function public.round_voters(p_room_id uuid)
returns setof uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  -- plpgsql garante que a checagem de membro roda antes da consulta
  v_round_id uuid := public._require_member(p_room_id);
begin
  return query select v.user_id from public.votes v where v.round_id = v_round_id;
end;
$$;

revoke execute on function public.round_voters(uuid) from public, anon;
grant execute on function public.round_voters(uuid) to authenticated;
