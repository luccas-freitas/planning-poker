-- =============================================================================
-- Planning Poker - schema inicial
--
-- Modelo de segurança:
--   * Usuários são sessões anônimas do Supabase Auth (role `authenticated`).
--   * Tabelas são SOMENTE LEITURA para clientes (via RLS). Toda escrita passa
--     por funções RPC `security definer`, que validam as regras do jogo.
--   * Votos ficam ocultos até a rodada ser revelada (RLS em `votes`).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tabelas
-- -----------------------------------------------------------------------------

create table public.rooms (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9]{12}$'),
  name             text check (char_length(name) <= 80),
  host_id          uuid not null,
  current_round_id uuid,
  created_at       timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);

create table public.rounds (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms (id) on delete cascade,
  title       text check (char_length(title) <= 200),
  revealed    boolean not null default false,
  revealed_at timestamptz,
  created_at  timestamptz not null default now()
);

create index rounds_room_id_idx on public.rounds (room_id);

alter table public.rooms
  add constraint rooms_current_round_fk
  foreign key (current_round_id) references public.rounds (id) on delete set null;

create table public.participants (
  room_id      uuid not null references public.rooms (id) on delete cascade,
  user_id      uuid not null,
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_url   text check (
                 char_length(avatar_url) <= 500
                 and (avatar_url ~ '^https?://' or avatar_url ~ '^dicebear:[a-z-]+:[A-Za-z0-9_-]{1,64}$')
               ),
  role         text not null default 'player' check (role in ('player', 'spectator')),
  joined_at    timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index participants_user_id_idx on public.participants (user_id);

create table public.votes (
  round_id   uuid not null references public.rounds (id) on delete cascade,
  user_id    uuid not null,
  value      text not null check (value in ('0', '1', '2', '3', '5', '8', '13', '21', '?', '☕')),
  updated_at timestamptz not null default now(),
  primary key (round_id, user_id)
);

-- -----------------------------------------------------------------------------
-- Helpers (security definer para evitar recursão de RLS)
-- -----------------------------------------------------------------------------

create function public.is_room_member(p_room_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.participants
    where room_id = p_room_id and user_id = auth.uid()
  );
$$;

create function public.can_see_vote(p_round_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.rounds r
    join public.participants p on p.room_id = r.room_id and p.user_id = auth.uid()
    where r.id = p_round_id and r.revealed
  );
$$;

-- Garante sessão + participação; devolve a rodada atual da sala.
create function public._require_member(p_room_id uuid)
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_round_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not public.is_room_member(p_room_id) then
    raise exception 'not a member of this room' using errcode = '42501';
  end if;
  select current_round_id into v_round_id from public.rooms where id = p_room_id;
  return v_round_id;
end;
$$;

create function public._touch_room(p_room_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.rooms set last_activity_at = now() where id = p_room_id;
$$;

-- -----------------------------------------------------------------------------
-- RLS: leitura apenas; escrita somente via RPC
-- -----------------------------------------------------------------------------

alter table public.rooms        enable row level security;
alter table public.rounds       enable row level security;
alter table public.participants enable row level security;
alter table public.votes        enable row level security;

revoke all on public.rooms, public.rounds, public.participants, public.votes from anon, authenticated;
grant select on public.rooms, public.rounds, public.participants, public.votes to authenticated;

create policy "members read room" on public.rooms
  for select to authenticated using (public.is_room_member(id));

create policy "members read rounds" on public.rounds
  for select to authenticated using (public.is_room_member(room_id));

create policy "members read participants" on public.participants
  for select to authenticated using (public.is_room_member(room_id));

create policy "own vote or revealed round" on public.votes
  for select to authenticated
  using (user_id = auth.uid() or public.can_see_vote(round_id));

-- -----------------------------------------------------------------------------
-- RPCs
-- -----------------------------------------------------------------------------

-- Cria sala + primeira rodada + criador como participante. Retorna o slug.
create function public.create_room(
  p_display_name text,
  p_avatar_url   text default null,
  p_name         text default null
)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_room_id  uuid;
  v_round_id uuid;
  v_slug     text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  loop
    v_slug := left(replace(gen_random_uuid()::text, '-', ''), 12);
    begin
      insert into public.rooms (slug, name, host_id)
      values (v_slug, nullif(trim(p_name), ''), auth.uid())
      returning id into v_room_id;
      exit;
    exception when unique_violation then
      -- colisão de slug: tenta de novo
    end;
  end loop;

  insert into public.rounds (room_id) values (v_room_id) returning id into v_round_id;
  update public.rooms set current_round_id = v_round_id where id = v_room_id;

  insert into public.participants (room_id, user_id, display_name, avatar_url)
  values (v_room_id, auth.uid(), trim(p_display_name), p_avatar_url);

  return v_slug;
end;
$$;

-- Entra na sala (ou atualiza nome/avatar se já participa). Retorna o room_id.
create function public.join_room(
  p_slug         text,
  p_display_name text,
  p_avatar_url   text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_room_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select id into v_room_id from public.rooms where slug = p_slug;
  if v_room_id is null then
    raise exception 'room not found' using errcode = 'P0002';
  end if;

  insert into public.participants (room_id, user_id, display_name, avatar_url)
  values (v_room_id, auth.uid(), trim(p_display_name), p_avatar_url)
  on conflict (room_id, user_id) do update
    set display_name = excluded.display_name,
        avatar_url   = excluded.avatar_url;

  perform public._touch_room(v_room_id);
  return v_room_id;
end;
$$;

create function public.leave_room(p_room_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_round_id uuid := public._require_member(p_room_id);
begin
  delete from public.votes v
  using public.rounds r
  where v.round_id = r.id and r.id = v_round_id and not r.revealed and v.user_id = auth.uid();

  delete from public.participants where room_id = p_room_id and user_id = auth.uid();
end;
$$;

-- Troca entre jogador/espectador. Virar espectador remove o voto da rodada aberta.
create function public.set_role(p_room_id uuid, p_role text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_round_id uuid := public._require_member(p_room_id);
begin
  update public.participants set role = p_role
  where room_id = p_room_id and user_id = auth.uid();

  if p_role = 'spectator' then
    delete from public.votes v
    using public.rounds r
    where v.round_id = r.id and r.id = v_round_id and not r.revealed and v.user_id = auth.uid();
  end if;

  perform public._touch_room(p_room_id);
end;
$$;

-- Vota (ou troca o voto) na rodada atual. p_value = null remove o voto.
create function public.cast_vote(p_room_id uuid, p_value text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_round_id uuid := public._require_member(p_room_id);
  v_role     text;
  v_revealed boolean;
begin
  select role into v_role from public.participants
  where room_id = p_room_id and user_id = auth.uid();
  if v_role <> 'player' then
    raise exception 'spectators cannot vote' using errcode = '42501';
  end if;

  select revealed into v_revealed from public.rounds where id = v_round_id for update;
  if v_revealed then
    raise exception 'round already revealed' using errcode = '55000';
  end if;

  if p_value is null then
    delete from public.votes where round_id = v_round_id and user_id = auth.uid();
  else
    insert into public.votes (round_id, user_id, value)
    values (v_round_id, auth.uid(), p_value)
    on conflict (round_id, user_id) do update
      set value = excluded.value, updated_at = now();
  end if;

  perform public._touch_room(p_room_id);
end;
$$;

-- Revela a rodada atual (qualquer participante pode).
create function public.reveal_round(p_room_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_round_id uuid := public._require_member(p_room_id);
begin
  update public.rounds set revealed = true, revealed_at = now()
  where id = v_round_id and not revealed;
  perform public._touch_room(p_room_id);
end;
$$;

-- Inicia uma nova rodada (qualquer participante pode).
create function public.new_round(p_room_id uuid, p_title text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_round_id uuid;
begin
  perform public._require_member(p_room_id);

  insert into public.rounds (room_id, title)
  values (p_room_id, nullif(trim(p_title), ''))
  returning id into v_round_id;

  update public.rooms set current_round_id = v_round_id, last_activity_at = now()
  where id = p_room_id;

  return v_round_id;
end;
$$;

-- Edita o título da rodada atual.
create function public.set_round_title(p_room_id uuid, p_title text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_round_id uuid := public._require_member(p_room_id);
begin
  update public.rounds set title = nullif(trim(p_title), '') where id = v_round_id;
  perform public._touch_room(p_room_id);
end;
$$;

-- Permissões das funções: só usuários com sessão (inclui anônimos).
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.create_room(text, text, text),
  public.join_room(text, text, text),
  public.leave_room(uuid),
  public.set_role(uuid, text),
  public.cast_vote(uuid, text),
  public.reveal_round(uuid),
  public.new_round(uuid, text),
  public.set_round_title(uuid, text)
to authenticated;
-- usadas dentro das policies de RLS
grant execute on function public.is_room_member(uuid), public.can_see_vote(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Realtime: mudanças em salas, rodadas e participantes (respeitam RLS).
-- Votos NÃO são publicados; "já votou" vai por Presence e os valores são
-- buscados após o reveal.
-- -----------------------------------------------------------------------------

alter publication supabase_realtime add table public.rooms, public.rounds, public.participants;

-- -----------------------------------------------------------------------------
-- Storage: bucket público de avatares, cada usuário escreve só na própria pasta
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

-- leitura pública é via URL do bucket público; esta policy é exigida pelo upsert
create policy "avatar select own folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatar upload own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatar update own folder" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatar delete own folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- -----------------------------------------------------------------------------
-- Limpeza: salas sem atividade há 7 dias (diariamente às 03:00 UTC)
-- -----------------------------------------------------------------------------

create function public.cleanup_inactive_rooms()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.rooms where last_activity_at < now() - interval '7 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.cleanup_inactive_rooms() from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule('cleanup-inactive-rooms', '0 3 * * *', 'select public.cleanup_inactive_rooms()');
