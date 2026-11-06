-- Local-only fictitious operator. Never deploy this credential or seed to production.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
values ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000100','authenticated','authenticated','operator@example.test',crypt('local-demo-only',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','') on conflict(id) do nothing;
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000100','{"sub":"00000000-0000-4000-8000-000000000100","email":"operator@example.test"}','email',now(),now(),now()) on conflict(provider_id,provider) do nothing;
insert into public.leads(id,owner_id,name,phone,company,service,budget,timeline,stage,consent,last_inbound_at,messages)
values('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000100','Marina Costa','550000000000','Estúdio Aurora','Conteúdo mensal',6500,'','qualifying',true,now(),jsonb_build_array(jsonb_build_object('id','seed-1','role','lead','text','Tenho um estúdio de design e quero conteúdo mensal. Posso responder às perguntas, sim.','at',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'status','received')))
on conflict(id) do nothing;
