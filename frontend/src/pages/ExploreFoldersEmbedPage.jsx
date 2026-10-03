import { useEffect, useMemo, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import Card from '../components/Card';
import EventCard from '../components/EventCard';
import { api } from '../services/api';
import styles from '../styles/pages/exploreFoldersEmbed.module.css';

const DEFAULT_FILTERS = {
  q: '',
  sport: 'all',
  dateRange: 'all',
  distance: 'all',
  level: 'all',
  timeOfDay: 'all',
  sortBy: 'soonest'
};

function ExploreFoldersEmbedPage() {
  const [events, setEvents] = useState([]);
  const [sports, setSports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([api.listSports(), api.listEvents(DEFAULT_FILTERS)])
      .then(([sportsRows, eventRows]) => {
        if (!active) return;
        setSports(Array.isArray(sportsRows) ? sportsRows : []);
        setEvents(Array.isArray(eventRows) ? eventRows : []);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const folders = useMemo(() => {
    const bySport = new Map();
    events.forEach((event) => {
      const sportId = Number(event.sport_id);
      const key = Number.isFinite(sportId) && sportId > 0 ? `sport-${sportId}` : `sport-${String(event.sport_name || 'altro')}`;
      if (!bySport.has(key)) {
        bySport.set(key, {
          key,
          sportId: Number.isFinite(sportId) && sportId > 0 ? sportId : null,
          title: String(event.sport_name || 'Altro sport'),
          items: []
        });
      }
      bySport.get(key).items.push(event);
    });

    const sportOrder = new Map(
      [...sports]
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'it'))
        .map((sport, index) => [Number(sport.id), index])
    );

    return [...bySport.values()]
      .map((folder) => ({
        ...folder,
        sortIndex: folder.sportId != null && sportOrder.has(folder.sportId) ? sportOrder.get(folder.sportId) : 9999,
        items: [...folder.items].sort((a, b) => Date.parse(a.event_datetime) - Date.parse(b.event_datetime))
      }))
      .sort((a, b) => a.sortIndex - b.sortIndex || a.title.localeCompare(b.title, 'it'));
  }, [events, sports]);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <p className={styles.kicker}>Embed Explore</p>
          <h1>Sezione Cartelle</h1>
        </div>
        <Link to="/map" target="_top" className={styles.openLink}>
          Apri la mappa eventi
        </Link>
      </header>

      {loading ? <p className={styles.muted}>Caricamento cartelle...</p> : null}
      {!loading && folders.length === 0 ? <p className={styles.muted}>Nessuna cartella disponibile.</p> : null}

      <section className={styles.folders}>
        {folders.map((folder) => (
          <Card key={folder.key} className={styles.folder}>
            <div className={styles.folderHead}>
              <p className={styles.folderKicker}>
                <FolderOpen size={14} aria-hidden="true" /> Cartella
              </p>
              <h2>{folder.title}</h2>
              <span className={styles.count}>{folder.items.length} eventi</span>
            </div>
            <div className={styles.rail}>
              {folder.items.slice(0, 10).map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  variant="compact"
                  context="folder"
                  showProgress={false}
                  detailsLabel="Apri"
                  detailsIconOnly
                  linkTarget="_top"
                />
              ))}
            </div>
          </Card>
        ))}
      </section>
    </div>
  );
}

export default ExploreFoldersEmbedPage;
