-- Emojis personalizados (como no Slack): compartilhados por todo mundo que usa
-- o app, não por sala (salas expiram em 7 dias; os emojis ficam).
--
-- Fluxo: o front envia a imagem para `emojis/<user_id>/<nome>-<aleatório>.<ext>`
-- e depois chama `add_custom_emoji`, que confere o arquivo e registra o nome.
-- Nas reações só trafega o nome (`:borat:`); a URL é montada por quem recebe a
-- partir desta tabela, nunca a partir da mensagem.

create table public.custom_emojis (
  name       text primary key check (name ~ '^[a-z0-9_-]{2,32}$'),
  path       text not null unique
             check (path ~ '^[0-9a-f-]{36}/[a-z0-9_-]{2,32}-[a-z0-9]{6,16}\.(webp|png|gif)$'),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

-- limite diário por pessoa e "apagar só o que é meu"
create index custom_emojis_created_by_idx
  on public.custom_emojis (created_by, created_at);

alter table public.custom_emojis enable row level security;

create policy "custom emojis are visible to signed-in users"
  on public.custom_emojis for select to authenticated using (true);

revoke insert, update, delete on public.custom_emojis from anon, authenticated;

-- -----------------------------------------------------------------------------
create function public.add_custom_emoji(p_name text, p_path text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_path not like v_uid::text || '/%' then
    raise exception 'path must be in your own folder' using errcode = '42501';
  end if;
  if not exists (
    select 1 from storage.objects o where o.bucket_id = 'emojis' and o.name = p_path
  ) then
    raise exception 'image not uploaded' using errcode = 'P0002';
  end if;
  if (select count(*) from public.custom_emojis) >= 500 then
    raise exception 'too many custom emojis' using errcode = '54000';
  end if;
  if (
    select count(*) from public.custom_emojis
    where created_by = v_uid and created_at > now() - interval '1 day'
  ) >= 20 then
    raise exception 'daily custom emoji limit reached' using errcode = '54000';
  end if;

  insert into public.custom_emojis (name, path, created_by)
  values (p_name, p_path, v_uid);
  -- nome repetido: unique_violation (23505) sobe para o front
end;
$$;

-- Apaga um emoji que eu criei e devolve o caminho da imagem, para o front
-- removê-la do Storage (SQL não pode apagar storage.objects).
create function public.delete_custom_emoji(p_name text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_path text;
begin
  delete from public.custom_emojis
  where name = p_name and created_by = auth.uid()
  returning path into v_path;
  if v_path is null then
    raise exception 'emoji not found or not yours' using errcode = '42501';
  end if;
  return v_path;
end;
$$;

revoke execute on function public.add_custom_emoji(text, text) from public, anon;
revoke execute on function public.delete_custom_emoji(text) from public, anon;
grant execute on function public.add_custom_emoji(text, text) to authenticated;
grant execute on function public.delete_custom_emoji(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Storage: imagens de até 256 kB (já chegam reduzidas a 128 px; GIF animado
-- vai como está). Público para leitura; cada um só mexe na própria pasta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('emojis', 'emojis', true, 262144, array['image/webp', 'image/png', 'image/gif'])
on conflict (id) do nothing;

create policy "emoji select own folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'emojis' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "emoji upload own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'emojis' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "emoji delete own folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'emojis' and (storage.foldername(name))[1] = auth.uid()::text);
