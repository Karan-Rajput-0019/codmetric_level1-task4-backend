-- create posts table (Supabase DB)
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid,
  author_display_name text,
  title text not null,
  story text not null,
  location text,
  image_url text,
  created_at timestamptz default now()
);

-- optional: grant public select on posts if you want unauthenticated reads
-- grant select on posts to anon;