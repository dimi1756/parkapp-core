-- Lets the app tell "your city hasn't set a code yet" apart from "that code
-- is wrong". redeem_resident_code returns a bare boolean, so the two were
-- indistinguishable and an unconfigured municipality told every resident to
-- double-check a code that could never have matched -- which is exactly what
-- happened on the pilot city, whose resident_code was never set and had no
-- UI to set it from.
--
-- Returns only whether a code exists, never the code itself: resident_code
-- stays readable exclusively by that municipality's admins under the
-- existing municipality_settings RLS (0006), and a probe that leaked it
-- would hand every user free Premium.
create or replace function public.has_resident_code() returns boolean as $$
  select exists (
    select 1
    from public.municipality_settings s
    join public.profiles p on p.municipality_id = s.municipality_id
    where p.id = auth.uid()
      and s.resident_code is not null
      and length(trim(s.resident_code)) > 0
  );
$$ language sql security definer stable set search_path = public;

grant execute on function public.has_resident_code() to authenticated;
