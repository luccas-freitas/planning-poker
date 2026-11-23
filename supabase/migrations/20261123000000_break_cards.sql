-- Cartas de pausa: ☕ café, 🍛 almoço, 🚬 cigarro. A carta "?" saiu do deck,
-- mas continua aceita aqui para não quebrar quem ainda está com a página
-- antiga aberta durante o deploy.
alter table public.votes drop constraint votes_value_check;
alter table public.votes add constraint votes_value_check
  check (value in ('0', '1', '2', '3', '5', '8', '13', '21', '?', '☕', '🍛', '🚬'));
