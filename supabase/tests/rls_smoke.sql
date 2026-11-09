-- Teste de fumaça das regras de segurança. Roda numa transação e desfaz tudo.
-- Uso: npm run db:test
\o /dev/null
begin;

create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated;

-- helper: "loga" como um usuário
create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

\set alice '11111111-1111-1111-1111-111111111111'
\set bob   '22222222-2222-2222-2222-222222222222'
\set eve   '33333333-3333-3333-3333-333333333333'

set local role authenticated;

-- Alice cria a sala
select pg_temp.as_user(:'alice');
insert into ctx values ('slug', public.create_room('Alice', 'dicebear:adventurer:alice', 'Sprint 42'));
insert into ctx select 'room', id from public.rooms where slug = (select v from ctx where k = 'slug');

-- Bob entra pelo slug e vota
select pg_temp.as_user(:'bob');
select public.join_room((select v from ctx where k = 'slug'), 'Bob', null);
select public.cast_vote((select v::uuid from ctx where k = 'room'), '8');
select public.cast_vote((select v::uuid from ctx where k = 'room'), '5'); -- troca o voto

-- Alice vota
select pg_temp.as_user(:'alice');
select public.cast_vote((select v::uuid from ctx where k = 'room'), '3');

do $$
declare n int;
begin
  -- 1. Antes do reveal, Alice só vê o próprio voto
  select count(*) into n from public.votes;
  assert n = 1, format('antes do reveal Alice deveria ver 1 voto, viu %s', n);

  -- 2. Escrita direta na tabela é bloqueada
  begin
    insert into public.votes (round_id, user_id, value)
    select current_round_id, auth.uid(), '1' from public.rooms;
    assert false, 'insert direto em votes deveria falhar';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 3. Eve (fora da sala) não vê nada nem consegue votar
select pg_temp.as_user(:'eve');
do $$
declare n int;
begin
  select count(*) into n from public.rooms;
  assert n = 0, 'Eve não deveria ver salas';
  begin
    perform public.cast_vote((select v::uuid from ctx where k = 'room'), '1');
    assert false, 'Eve não deveria conseguir votar';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 4. Espectador não vota e perde o voto ao virar espectador
select pg_temp.as_user(:'bob');
select public.set_role((select v::uuid from ctx where k = 'room'), 'spectator');
do $$
declare n int;
begin
  select count(*) into n from public.votes;
  assert n = 0, 'voto do Bob deveria ter sido removido ao virar espectador';
  begin
    perform public.cast_vote((select v::uuid from ctx where k = 'room'), '1');
    assert false, 'espectador não deveria votar';
  exception when insufficient_privilege then null;
  end;
end $$;
select public.set_role((select v::uuid from ctx where k = 'room'), 'player');
select public.cast_vote((select v::uuid from ctx where k = 'room'), '13');

-- 5. Reveal: todos os membros veem todos os votos; ninguém mais vota
select public.reveal_round((select v::uuid from ctx where k = 'room'));
do $$
declare n int;
begin
  select count(*) into n from public.votes;
  assert n = 2, format('após reveal Bob deveria ver 2 votos, viu %s', n);
  begin
    perform public.cast_vote((select v::uuid from ctx where k = 'room'), '1');
    assert false, 'voto após reveal deveria falhar';
  exception when object_not_in_prerequisite_state then null;
  end;
end $$;

-- 6. Nova rodada: votos anteriores não aparecem como voto atual
select public.new_round((select v::uuid from ctx where k = 'room'), 'PROJ-123 Login');
do $$
declare n int;
begin
  select count(*) into n
  from public.votes v join public.rooms r on r.current_round_id = v.round_id;
  assert n = 0, 'nova rodada deveria começar sem votos';
  select count(*) into n from public.rounds;
  assert n = 2, 'deveria haver 2 rodadas';
end $$;

-- 7. Valor fora do deck é rejeitado
do $$
begin
  perform public.cast_vote((select v::uuid from ctx where k = 'room'), '4');
  assert false, 'valor 4 não está no deck';
exception when check_violation then null;
end $$;

-- 8. Eve continua sem ver votos revelados de outra sala
select pg_temp.as_user(:'eve');
do $$
declare n int;
begin
  select count(*) into n from public.votes;
  assert n = 0, 'Eve não deveria ver votos';
end $$;

reset role;

-- 9. Limpeza remove salas inativas
update public.rooms set last_activity_at = now() - interval '8 days';
do $$
begin
  assert public.cleanup_inactive_rooms() = 1, 'cleanup deveria remover 1 sala';
end $$;

\echo '✅ Todos os testes de RLS passaram'
rollback;
