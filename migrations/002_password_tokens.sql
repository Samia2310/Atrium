create table password_token (
  id          serial primary key,
  person_id   integer references person(id) not null,
  token_hash  text not null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz default now()
);

create index idx_password_token_hash on password_token (token_hash);