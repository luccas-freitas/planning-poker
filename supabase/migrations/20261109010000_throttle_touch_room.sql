-- _touch_room atualizava rooms.last_activity_at a cada voto, gerando um evento
-- Realtime (UPDATE em rooms) para todos os participantes a cada clique.
-- A expiração é de 7 dias, então precisão de 1 minuto é suficiente.
create or replace function public._touch_room(p_room_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.rooms set last_activity_at = now()
  where id = p_room_id and last_activity_at < now() - interval '1 minute';
$$;
