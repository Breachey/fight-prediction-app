alter table public.users
add column if not exists avatar_config jsonb not null
default '{"color":"persian-blue","shape":"classic","pattern":"solid","eyes":"oval"}'::jsonb;

alter table public.users
drop constraint if exists users_avatar_config_check;

alter table public.users
add constraint users_avatar_config_check check (
  jsonb_typeof(avatar_config) = 'object'
  and avatar_config ?& array['color', 'shape', 'pattern', 'eyes']
  and avatar_config - array['color', 'shape', 'pattern', 'eyes']::text[] = '{}'::jsonb
  and avatar_config ->> 'color' in ('persian-blue', 'burnt-tangerine', 'cotton-candy', 'white', 'black')
  and avatar_config ->> 'shape' in ('classic', 'tall', 'wide', 'diamond')
  and avatar_config ->> 'pattern' in ('solid', 'spots', 'stripes', 'split')
  and avatar_config ->> 'eyes' in ('oval', 'round', 'sleepy', 'focus')
);
