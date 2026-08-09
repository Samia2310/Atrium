-- Credits are domain money and must be whole integers. The starter data
-- contains a few .50 balances; round down so the migration never grants
-- extra credit while converting the schema to the invariant the app enforces.
update person set credits = floor(credits);
update session
   set room_fee_credits = floor(room_fee_credits),
       seat_fee_credits = floor(seat_fee_credits);
update enrolment
   set credits_charged = floor(credits_charged),
       credits_refunded = floor(credits_refunded);

alter table person
  alter column credits type integer using credits::integer,
  alter column credits set default 0,
  alter column email set not null,
  alter column full_name set not null,
  alter column kind set not null,
  alter column active set not null,
  alter column created_at set default now();

alter table session
  alter column room_id set not null,
  alter column coach_id set not null,
  alter column discipline set not null,
  alter column session_type set not null,
  alter column status set not null,
  alter column starts_at set not null,
  alter column ends_at set not null,
  alter column room_fee_credits type integer using room_fee_credits::integer,
  alter column room_fee_credits set not null,
  alter column seat_fee_credits type integer using seat_fee_credits::integer,
  alter column seat_fee_credits set not null;

alter table enrolment
  alter column session_id set not null,
  alter column person_id set not null,
  alter column status set not null,
  alter column credits_charged type integer using credits_charged::integer,
  alter column credits_charged set not null,
  alter column credits_refunded type integer using credits_refunded::integer,
  alter column credits_refunded set not null,
  alter column enrolled_at set default now();

alter table check_in
  alter column enrolment_id set not null,
  alter column checked_in_at set default now();

alter table room
  alter column name set not null,
  alter column capacity set not null,
  add constraint room_capacity_positive check (capacity > 0);

alter table person
  add constraint person_kind_valid check (kind in ('participant', 'coach', 'admin')),
  add constraint person_credits_whole_non_negative check (credits >= 0);

alter table session
  add constraint session_type_valid check (session_type in ('short', 'standard', 'intensive')),
  add constraint session_status_valid check (status in ('scheduled', 'completed', 'cancelled')),
  add constraint session_time_order check (ends_at > starts_at),
  add constraint session_fees_non_negative check (room_fee_credits >= 0 and seat_fee_credits >= 0);

alter table enrolment
  add constraint enrolment_status_valid check (status in ('active', 'cancelled')),
  add constraint enrolment_credits_non_negative check (credits_charged >= 0 and credits_refunded >= 0);

create unique index idx_person_email_lower_unique on person (lower(email));
create unique index idx_enrolment_one_active_per_person_session
  on enrolment (session_id, person_id)
  where status = 'active';

create index idx_session_time_range on session (starts_at, ends_at);
create index idx_session_room_active_range on session (room_id, starts_at, ends_at)
  where status <> 'cancelled';
create index idx_session_coach_active_range on session (coach_id, starts_at, ends_at)
  where status <> 'cancelled';
create index idx_enrolment_person_status on enrolment (person_id, status);
create index idx_enrolment_session_status on enrolment (session_id, status);
