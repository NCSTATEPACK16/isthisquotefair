-- RLS assertions. Each block raises on failure; psql runs with ON_ERROR_STOP.
\set ON_ERROR_STOP on

-- fixtures (as superuser)
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b');
insert into public.price_benchmarks (key, county_fips, low, typical, high, source_urls)
  values ('auto.brakes.front_pads_rotors', '37183', 300, 450, 600, '[{"url":"https://example.com"}]');
insert into public.contributed_items (key, county_fips, zip5, service_month, unit_price, line_total)
  values ('auto.brakes.front_pads_rotors', '37183', '27603', '2026-09-01', 450, 450);
insert into public.check_events (model, outcome) values ('claude-haiku-5-5', 'success');
insert into public.check_tokens (token_hash, stripe_session_id, credits_remaining, expires_at)
  values (sha256('tok'), 'cs_test_1', 1, now() + interval '1 year');
insert into public.subscribers values ('00000000-0000-0000-0000-00000000000a', 'cus_a', 'active', now(), now()),
                                      ('00000000-0000-0000-0000-00000000000b', 'cus_b', 'active', now(), now());
insert into public.saved_checks (user_id, result) values ('00000000-0000-0000-0000-00000000000a', '{"flag":"within"}'),
                                                         ('00000000-0000-0000-0000-00000000000b', '{"flag":"above"}');

-- every public table has RLS enabled
do $$
declare t text;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity loop
    raise exception 'RLS disabled on public.%', t;
  end loop;
end $$;

-- anon: may read taxonomy, nothing else
set role anon;
do $$
declare n int; t text;
begin
  select count(*) into n from public.taxonomy_keys;
  if n < 60 then raise exception 'anon should read taxonomy_keys (got %)', n; end if;
  foreach t in array array['price_benchmarks','contributed_items','check_events','check_tokens','subscribers','saved_checks'] loop
    begin
      execute format('select count(*) from public.%I', t) into n;
      if n > 0 then raise exception 'anon can read %', t; end if;
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin
    insert into public.contributed_items (key, county_fips, service_month, unit_price, line_total)
      values ('auto.brakes.front_pads_rotors', '37183', '2026-09-01', 1, 1);
    raise exception 'anon inserted into contributed_items';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.consume_check_credit(sha256('tok'));
    raise exception 'anon could call consume_check_credit';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- authenticated user A: sees only own subscriber + saved_checks; can delete own, not B's
set role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false); end $$;
do $$
declare n int;
begin
  select count(*) into n from public.subscribers;      if n <> 1 then raise exception 'A sees % subscriber rows', n; end if;
  select count(*) into n from public.saved_checks;     if n <> 1 then raise exception 'A sees % saved_checks', n; end if;
  delete from public.saved_checks where user_id = '00000000-0000-0000-0000-00000000000b';
  begin
    insert into public.saved_checks (user_id, result) values ('00000000-0000-0000-0000-00000000000a', '{}');
    raise exception 'authenticated inserted into saved_checks';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.subscribers set status = 'canceled';
    raise exception 'authenticated updated subscribers';
  exception when insufficient_privilege then null;
  end;
  begin
    select count(*) into n from public.contributed_items;
    raise exception 'authenticated read contributed_items';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.saved_checks) <> 2 then raise exception 'A deleted B''s saved check'; end if;
end $$;

-- service role: credit is spent exactly once
set role service_role;
do $$ begin
  if not public.consume_check_credit(sha256('tok')) then raise exception 'first spend should succeed'; end if;
  if public.consume_check_credit(sha256('tok')) then raise exception 'second spend should fail'; end if;
  if public.consume_check_credit(sha256('nope')) then raise exception 'unknown token should fail'; end if;
end $$;
reset role;

-- constraints that encode privacy rules
do $$ begin
  begin
    insert into public.contributed_items (key, county_fips, service_month, unit_price, line_total)
      values ('auto.brakes.front_pads_rotors', '37183', '2026-09-14', 1, 1);
    raise exception 'exact service date accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.price_benchmarks (key, county_fips, low, typical, high, source_urls)
      values ('auto.brakes.front_pads_rotors', '37183', 1, 2, 3, '[]');
    raise exception 'benchmark without sources accepted';
  exception when check_violation then null;
  end;
end $$;

\echo 'RLS tests passed'
