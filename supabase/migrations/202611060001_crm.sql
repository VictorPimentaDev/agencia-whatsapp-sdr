create table public.leads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 100),
  phone text not null check (phone ~ '^[0-9]{10,15}$'),
  company text not null default '', service text not null default '',
  budget numeric check (budget >= 0 and budget <= 1000000000), timeline text not null default '',
  stage text not null default 'new' check (stage in ('new','qualifying','qualified','booked','closed')),
  consent boolean not null default false, opted_out boolean not null default false,
  human boolean not null default false, call_at timestamptz, last_inbound_at timestamptz,
  messages jsonb not null default '[]' check (jsonb_typeof(messages) = 'array' and jsonb_array_length(messages) <= 200),
  revision integer not null default 0 check (revision >= 0), updated_at timestamptz not null default now(),
  unique(owner_id, phone),
  check (not opted_out or (not consent and human)),
  check (stage <> 'booked' or call_at is not null)
);
create table public.webhook_events (
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('cloud','evolution')),
  event_id text not null,
  lead_id uuid references public.leads(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(owner_id, provider, event_id)
);
alter table public.leads enable row level security;
alter table public.webhook_events enable row level security;
create policy owner_select on public.leads for select to authenticated using (owner_id = (select auth.uid()));
create policy owner_update on public.leads for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
-- Inserts only come through verified webhook ingestion; erasure is a transactional RPC.
revoke all on public.leads, public.webhook_events from anon, authenticated;
grant select, update on public.leads to authenticated;
grant all on public.leads, public.webhook_events to service_role;

create function public.ingest_message(p_owner uuid, p_provider text, p_event text, p_phone text, p_name text, p_text text, p_at timestamptz)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare l public.leads; stop_requested boolean; human_requested boolean; normalized text;
begin
  if length(p_text) not between 1 and 4000 or length(p_event) not between 1 and 200 or p_at > now() + interval '1 minute' then
    raise exception 'Invalid inbound message';
  end if;
  -- Keep content-free event IDs after erasure so a delayed replay cannot resurrect a lead.
  if exists(select 1 from public.webhook_events where owner_id=p_owner and provider=p_provider and event_id=p_event) then return; end if;
  insert into public.leads(owner_id, phone, name) values(p_owner, p_phone, p_name)
    on conflict(owner_id, phone) do nothing;
  select * into strict l from public.leads where owner_id=p_owner and phone=p_phone for update;
  insert into public.webhook_events(owner_id, provider, event_id, lead_id) values(p_owner,p_provider,p_event,l.id)
    on conflict do nothing;
  if not found then return; end if;
  normalized := lower(trim(p_text));
  stop_requested := normalized ~ '(^|[^a-z])(stop|sair|parar|cancelar)([^a-z]|$)' or normalized like '%não quero%' or normalized like '%nao quero%';
  human_requested := normalized ~ '(^|[^a-z])(humano|atendente|pessoa)([^a-z]|$)';
  update public.leads set
    messages = (select coalesce(jsonb_agg(value order by ord), '[]') from (select value,ord from jsonb_array_elements(l.messages || jsonb_build_array(jsonb_build_object('id',p_provider||':'||p_event,'role','lead','text',p_text,'at',to_char(p_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'status','received'))) with ordinality a(value,ord) order by (value->>'status' in ('sending','uncertain')) desc, ord desc limit 200) retained),
    last_inbound_at = greatest(last_inbound_at,p_at),
    consent = case when stop_requested then false else consent end,
    opted_out = opted_out or stop_requested,
    human = human or stop_requested or human_requested,
    stage = case when stage='new' then 'qualifying' else stage end,
    revision=revision+1, updated_at=now()
    where id=l.id;
end; $$;
revoke all on function public.ingest_message(uuid,text,text,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.ingest_message(uuid,text,text,text,text,text,timestamptz) to service_role;

create function public.finish_send(p_id uuid, p_message text, p_status text)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if p_status not in ('sent','uncertain') then raise exception 'Invalid send result'; end if;
  update public.leads set messages=(select jsonb_agg(case when value->>'id'=p_message and value->>'status'='sending' then jsonb_set(value,'{status}',to_jsonb(p_status)) else value end order by ord) from jsonb_array_elements(messages) with ordinality a(value,ord)), revision=revision+1, updated_at=now()
    where id=p_id and owner_id=auth.uid();
  if not found then raise exception 'Lead not found'; end if;
end; $$;
revoke all on function public.finish_send(uuid,text,text) from public, anon;
grant execute on function public.finish_send(uuid,text,text) to authenticated;

create function public.forget_lead(p_id uuid, p_revision integer)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.leads where id=p_id and owner_id=auth.uid() and revision=p_revision;
  if not found then raise exception 'Lead changed or unavailable'; end if;
end; $$;
revoke all on function public.forget_lead(uuid,integer) from public, anon;
grant execute on function public.forget_lead(uuid,integer) to authenticated;
