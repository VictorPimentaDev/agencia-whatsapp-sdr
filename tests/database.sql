begin;
insert into auth.users(id) values('00000000-0000-4000-8000-000000000200');
select public.ingest_message('00000000-0000-4000-8000-000000000100','cloud','m1','5511999999999','Test lead','Olá',now()-interval '1 hour');
select public.ingest_message('00000000-0000-4000-8000-000000000100','cloud','m1','5511999999999','Test lead','Duplicated',now());
select public.ingest_message('00000000-0000-4000-8000-000000000100','cloud','m2','5511999999999','Test lead','Quero falar com um humano',now()-interval '30 minutes');
select public.ingest_message('00000000-0000-4000-8000-000000000100','cloud','m3','5511999999999','Test lead','STOP!',now()-interval '2 hours');
select public.ingest_message('00000000-0000-4000-8000-000000000200','evolution','peer1','5511888888888','Other owner','Oi',now());
do $$ declare l public.leads; begin
  select * into strict l from public.leads where phone='5511999999999';
  assert jsonb_array_length(l.messages)=3, 'Duplicate message appended';
  assert l.revision=3, 'Duplicate advanced revision';
  assert l.opted_out and l.human and not l.consent, 'Opt-out was not persisted';
  assert l.last_inbound_at > now()-interval '31 minutes', 'Old message regressed window';
end $$;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000100';
do $$ begin
  assert (select count(*) from public.leads)=2, 'RLS exposed another owner';
  update public.leads set company='Illicit edit' where owner_id='00000000-0000-4000-8000-000000000200';
  assert not found, 'Cross-owner update succeeded';
  begin
    perform public.ingest_message('00000000-0000-4000-8000-000000000100','cloud','forged','5511777777777','Attacker','Hi',now());
    raise exception 'Authenticated role invoked ingest';
  exception when insufficient_privilege then null; end;
  begin
    update public.leads set owner_id='00000000-0000-4000-8000-000000000200' where phone='5511999999999';
    raise exception 'Ownership transfer succeeded';
  exception when insufficient_privilege then null; end;
end $$;
update public.leads set messages=messages||'[{"id":"out1","role":"operator","text":"Hi","at":"2026-11-06T18:00:00Z","status":"sending"}]'::jsonb where phone='5511999999999';
select public.finish_send((select id from public.leads where phone='5511999999999'),'out1','sent');
do $$ begin assert (select messages->-1->>'status' from public.leads where phone='5511999999999')='sent', 'Completion did not persist'; end $$;
select public.forget_lead((select id from public.leads where phone='5511999999999'),(select revision from public.leads where phone='5511999999999'));
reset role;
do $$ begin assert exists(select 1 from public.webhook_events where event_id='m1' and lead_id is null), 'Erasure must retain only an unlinked event ID'; end $$;
select public.ingest_message('00000000-0000-4000-8000-000000000100','cloud','m1','5511999999999','Deleted lead','Replay',now());
do $$ begin assert not exists(select 1 from public.leads where phone='5511999999999'), 'Replay resurrected erased contact'; end $$;
-- Pending delivery records survive the bounded history window.
update public.leads set messages='[{"id":"unresolved","role":"operator","text":"Pending","at":"2026-11-06T18:00:00Z","status":"uncertain"}]'::jsonb where phone='550000000000';
do $$ begin
  for i in 1..205 loop perform public.ingest_message('00000000-0000-4000-8000-000000000100','cloud','long-'||i,'550000000000','Demo','Hello',now()); end loop;
  assert (select jsonb_array_length(messages) from public.leads where phone='550000000000')=200, 'History grew unbounded';
  assert (select messages->0->>'id' from public.leads where phone='550000000000')='unresolved', 'Pending send was evicted';
end $$;
set local role anon;
do $$ begin
  begin perform count(*) from public.leads; raise exception 'Anon read CRM'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: migrations, seed, dedupe, opt-out, causal timestamps, RLS, send completion, erasure' as result;
