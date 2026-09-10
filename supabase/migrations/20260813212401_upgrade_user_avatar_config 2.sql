alter table public.users
drop constraint if exists users_avatar_config_check;

alter table public.users
alter column avatar_config set default jsonb_build_object(
  'color', (array['#2B31B2', '#E9170D', '#F99EAD', '#FCFBFD', '#050000', '#1E3A8A', '#7F1D1D', '#334155'])[1 + floor(random() * 8)::integer],
  'pattern', (array['solid', 'spots', 'stripes', 'split'])[1 + floor(random() * 4)::integer],
  'eyes', (array['oval', 'round', 'sleepy', 'focus'])[1 + floor(random() * 4)::integer],
  'width', 70 + floor(random() * 61)::integer,
  'height', 75 + floor(random() * 51)::integer,
  'roundness', 10 + floor(random() * 91)::integer,
  'tentacleSpread', 70 + floor(random() * 61)::integer,
  'tentacleLength', 70 + floor(random() * 56)::integer,
  'eyeSpacing', 70 + floor(random() * 61)::integer,
  'size', 80 + floor(random() * 41)::integer,
  'motion', 20 + floor(random() * 81)::integer
);

update public.users
set avatar_config = jsonb_build_object(
  'color', (array['#2B31B2', '#E9170D', '#F99EAD', '#FCFBFD', '#050000', '#1E3A8A', '#7F1D1D', '#334155'])[1 + floor(random() * 8)::integer],
  'pattern', (array['solid', 'spots', 'stripes', 'split'])[1 + floor(random() * 4)::integer],
  'eyes', (array['oval', 'round', 'sleepy', 'focus'])[1 + floor(random() * 4)::integer],
  'width', 70 + floor(random() * 61)::integer,
  'height', 75 + floor(random() * 51)::integer,
  'roundness', 10 + floor(random() * 91)::integer,
  'tentacleSpread', 70 + floor(random() * 61)::integer,
  'tentacleLength', 70 + floor(random() * 56)::integer,
  'eyeSpacing', 70 + floor(random() * 61)::integer,
  'size', 80 + floor(random() * 41)::integer,
  'motion', 20 + floor(random() * 81)::integer
);

alter table public.users
add constraint users_avatar_config_check check (
  jsonb_typeof(avatar_config) = 'object'
  and avatar_config ?& array[
    'color', 'pattern', 'eyes', 'width', 'height', 'roundness',
    'tentacleSpread', 'tentacleLength', 'eyeSpacing', 'size', 'motion'
  ]
  and avatar_config - array[
    'color', 'pattern', 'eyes', 'width', 'height', 'roundness',
    'tentacleSpread', 'tentacleLength', 'eyeSpacing', 'size', 'motion'
  ]::text[] = '{}'::jsonb
  and avatar_config ->> 'color' ~ '^#[0-9A-Fa-f]{6}$'
  and avatar_config ->> 'pattern' in ('solid', 'spots', 'stripes', 'split')
  and avatar_config ->> 'eyes' in ('oval', 'round', 'sleepy', 'focus')
  and jsonb_typeof(avatar_config -> 'width') = 'number'
  and (avatar_config ->> 'width')::integer between 70 and 130
  and jsonb_typeof(avatar_config -> 'height') = 'number'
  and (avatar_config ->> 'height')::integer between 75 and 125
  and jsonb_typeof(avatar_config -> 'roundness') = 'number'
  and (avatar_config ->> 'roundness')::integer between 10 and 100
  and jsonb_typeof(avatar_config -> 'tentacleSpread') = 'number'
  and (avatar_config ->> 'tentacleSpread')::integer between 70 and 130
  and jsonb_typeof(avatar_config -> 'tentacleLength') = 'number'
  and (avatar_config ->> 'tentacleLength')::integer between 70 and 125
  and jsonb_typeof(avatar_config -> 'eyeSpacing') = 'number'
  and (avatar_config ->> 'eyeSpacing')::integer between 70 and 130
  and jsonb_typeof(avatar_config -> 'size') = 'number'
  and (avatar_config ->> 'size')::integer between 80 and 120
  and jsonb_typeof(avatar_config -> 'motion') = 'number'
  and (avatar_config ->> 'motion')::integer between 0 and 100
);
