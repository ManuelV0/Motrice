begin;

-- La simulazione era utile esclusivamente per il prototipo del profilo V3.
-- Non deve poter produrre MOT, XP o affidabilita da un client autenticato.
revoke all on function public.simulate_my_profile_v3_checkin()
from public, anon, authenticated;

grant execute on function public.simulate_my_profile_v3_checkin()
to service_role;

comment on function public.simulate_my_profile_v3_checkin() is
  'Funzione demo disabilitata per i client. Eseguibile solo tramite service role per test amministrativi controllati.';

commit;
