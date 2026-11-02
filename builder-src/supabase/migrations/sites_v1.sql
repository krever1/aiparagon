-- AI Paragon Sites: the website builder's pages (drafts and live copies), the contacts their
-- chatbots take, and the chat limits. Team members reach it through the site-session function,
-- which marks their sign-in with app_metadata.team; nobody else sees a row.
-- Applied Nov 2 as migration sites_v1.

create or replace function public.is_team() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'team')::boolean, false)
$$;

create table public.pages (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,47}$'),
  draft jsonb not null check (jsonb_typeof(draft) = 'object'),
  live jsonb check (live is null or jsonb_typeof(live) = 'object'),
  -- the page's address on the shared link, set when it goes live
  live_slug text unique check (live_slug is null or (live_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(live_slug) <= 60 and live_slug not in ('api', 'site'))),
  domain text check (domain is null or (length(domain) <= 253 and domain ~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*[a-z0-9]$')),
  domain_state jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  created_by text,
  updated_by text,
  check ((live is null) = (live_slug is null))
);
-- one page per domain, whether it is saved with www or without
create unique index pages_domain_bare on public.pages (regexp_replace(domain, '^www\.', '')) where domain is not null;

-- Timestamps, authors and the version are the server's: a save based on an old version finds
-- no row (the builder filters on version), so two people never overwrite each other unseen
create or replace function public.pages_touch() returns trigger
language plpgsql set search_path = '' as $$
declare who text := (select auth.jwt()) ->> 'email';
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
    new.version := 1;
    new.created_by := who;
    new.updated_by := who;
    new.published_at := case when new.live is null then null else now() end;
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    if new.draft is distinct from old.draft or new.live is distinct from old.live or new.live_slug is distinct from old.live_slug then
      new.version := old.version + 1;
      new.updated_at := now();
      new.updated_by := who;
    else
      new.version := old.version;
      new.updated_at := old.updated_at;
      new.updated_by := old.updated_by;
    end if;
    if new.live is null then
      new.published_at := null;
    elsif new.live is distinct from old.live or new.live_slug is distinct from old.live_slug then
      new.published_at := now();
    else
      new.published_at := old.published_at;
    end if;
  end if;
  return new;
end $$;
create trigger pages_touch before insert or update on public.pages for each row execute function public.pages_touch();

alter table public.pages enable row level security;
create policy pages_team on public.pages for all to authenticated using ((select public.is_team())) with check ((select public.is_team()));

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  page_id text not null references public.pages(id) on delete cascade,
  name text check (length(name) <= 100),
  email text check (length(email) <= 200),
  phone text check (length(phone) <= 40),
  note text check (length(note) <= 1000),
  created_at timestamptz not null default now()
);
create index leads_page_idx on public.leads (page_id, created_at desc);
alter table public.leads enable row level security;
-- the visitor chat workflow saves contacts (service role); the team reads and clears them
create policy leads_team_read on public.leads for select to authenticated using ((select public.is_team()));
create policy leads_team_delete on public.leads for delete to authenticated using ((select public.is_team()));

create table public.chat_hits (
  id bigint generated always as identity primary key,
  page_id text not null,
  who text not null,
  kind text not null check (kind in ('reply', 'lead')),
  at timestamptz not null default now()
);
create index chat_hits_who_idx on public.chat_hits (who, kind, at);
create index chat_hits_page_idx on public.chat_hits (page_id, kind, at);
create index chat_hits_at_idx on public.chat_hits (kind, at);
alter table public.chat_hits enable row level security; -- no policies: the service role only

-- Explicit grants: the team's sign-in reads and writes pages and reads and clears contacts
revoke all on public.pages, public.leads, public.chat_hits from anon, authenticated;
grant select, insert, update, delete on public.pages to authenticated;
grant select, delete on public.leads to authenticated;

-- What a live page shows: by its address on the shared link or by its own domain. Public on
-- purpose (the server render calls it with the publishable key); never the draft, and never the
-- chatbot's notes or rules, which only the visitor chat workflow reads.
create or replace function public.site_page(p_slug text default null, p_host text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  r public.pages;
  h text;
  bare text;
begin
  if p_host is not null and p_host <> '' then
    h := lower(regexp_replace(trim(p_host), '\.$', ''));
    bare := regexp_replace(h, '^www\.', '');
    select * into r from public.pages p
      where p.live is not null and p.domain is not null and regexp_replace(p.domain, '^www\.', '') = bare
      limit 1;
  elsif p_slug is not null and p_slug <> '' then
    select * into r from public.pages p where p.live is not null and p.live_slug = lower(p_slug) limit 1;
  end if;
  if r.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'id', r.id,
    'slug', r.live_slug,
    'domain', r.domain,
    'published_at', r.published_at,
    'live', r.live #- '{root,props,chatbot,knows}' #- '{root,props,chatbot,rules}'
  );
end $$;
revoke all on function public.site_page(text, text) from public, anon, authenticated;
grant execute on function public.site_page(text, text) to anon, authenticated;

-- The visitor chat's limits, checked and counted in one step (service role only): 30 replies an
-- hour per visitor, 500 a day per page, 3,000 a day in all, and 5 contact forms an hour per visitor
create or replace function public.chat_allow(p_page text, p_who text, p_kind text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if p_kind not in ('reply', 'lead') or coalesce(p_page, '') = '' or coalesce(p_who, '') = '' then
    return jsonb_build_object('ok', false, 'why', 'bad');
  end if;
  if p_kind = 'lead' then
    select count(*) into n from public.chat_hits where who = p_who and kind = 'lead' and at > now() - interval '1 hour';
    if n >= 5 then return jsonb_build_object('ok', false, 'why', 'visitor'); end if;
  else
    select count(*) into n from public.chat_hits where who = p_who and kind = 'reply' and at > now() - interval '1 hour';
    if n >= 30 then return jsonb_build_object('ok', false, 'why', 'visitor'); end if;
    select count(*) into n from public.chat_hits where page_id = p_page and kind = 'reply' and at > now() - interval '1 day';
    if n >= 500 then return jsonb_build_object('ok', false, 'why', 'page'); end if;
    select count(*) into n from public.chat_hits where kind = 'reply' and at > now() - interval '1 day';
    if n >= 3000 then return jsonb_build_object('ok', false, 'why', 'all'); end if;
  end if;
  insert into public.chat_hits (page_id, who, kind) values (p_page, p_who, p_kind);
  if random() < 0.02 then
    delete from public.chat_hits where at < now() - interval '2 days';
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.chat_allow(text, text, text) from public, anon, authenticated;
grant execute on function public.chat_allow(text, text, text) to service_role;

revoke all on function public.pages_touch() from public, anon, authenticated;
revoke all on function public.is_team() from public, anon;
grant execute on function public.is_team() to authenticated;

-- Applied Nov 2 as migration sites_v1_chat_start.
-- The live page's words as its chatbot reads them, written by the builder when it publishes
alter table public.pages add column if not exists live_text text check (live_text is null or length(live_text) <= 12000);

-- The visitor chat's first step (service role only): is there a live page with its chatbot on, and
-- is this visitor within the limits (chat_allow counts them). Nothing is counted for a page with no
-- chatbot. Gives the chatbot's settings, the page's name and brand, and its words.
create or replace function public.chat_start(p_page text, p_who text, p_kind text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.pages;
  allowed jsonb;
  bot jsonb;
  brand text;
begin
  select * into r from public.pages p where p.id = p_page and p.live is not null;
  if r.id is null then
    return jsonb_build_object('ok', false, 'why', 'off');
  end if;
  bot := r.live #> '{root,props,chatbot}';
  if bot is null or jsonb_typeof(bot) <> 'object' or (bot -> 'on') is distinct from 'true'::jsonb then
    return jsonb_build_object('ok', false, 'why', 'off');
  end if;
  allowed := public.chat_allow(p_page, p_who, p_kind);
  if (allowed -> 'ok') is distinct from 'true'::jsonb then
    return jsonb_build_object('ok', false, 'why', coalesce(allowed ->> 'why', 'visitor'));
  end if;
  select e #>> '{props,brand}' into brand
    from jsonb_array_elements(case when jsonb_typeof(r.live -> 'content') = 'array' then r.live -> 'content' else '[]'::jsonb end) with ordinality as t(e, n)
    where e ->> 'type' in ('Navbar', 'Footer') and coalesce(trim(e #>> '{props,brand}'), '') <> ''
    order by (e ->> 'type') = 'Footer', n
    limit 1;
  return jsonb_build_object('ok', true, 'page', jsonb_build_object(
    'id', r.id,
    'slug', r.live_slug,
    'domain', r.domain,
    'chatbot', bot,
    'title', coalesce(r.live #>> '{root,props,title}', ''),
    'brand', coalesce(brand, ''),
    'text', coalesce(r.live_text, '')
  ));
end $$;
revoke all on function public.chat_start(text, text, text) from public, anon, authenticated;
grant execute on function public.chat_start(text, text, text) to service_role;
