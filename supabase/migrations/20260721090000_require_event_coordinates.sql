begin;

-- Corregge l'unico evento beta creato prima del collegamento automatico alla mappa.
update public.events
set
  lat = 42.8609941,
  lng = 13.5957012
where id = 'e2451498-2154-452f-be80-7f2832a85fc7'
  and lat is null
  and lng is null
  and lower(city) = 'ascoli piceno'
  and lower(location_name) = 'bar dello stadio';

-- Ogni evento visibile in Esplora deve poter produrre un marker sulla Mappa.
alter table public.events alter column lat set not null;
alter table public.events alter column lng set not null;

commit;
