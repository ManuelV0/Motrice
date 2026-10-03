import styles from '../styles/components/routeLoadingSkeleton.module.css';

function routeKind(pathname) {
  if (pathname === '/map' || pathname === '/game') return 'map';
  if (pathname === '/agenda') return 'agenda';
  if (pathname.startsWith('/chat') || pathname.startsWith('/chatrice')) return 'chat';
  if (pathname === '/account' || pathname.startsWith('/profile/')) return 'profile';
  if (pathname === '/create') return 'create';
  if (/^\/events\/[^/]+\/workout$/.test(pathname)) return 'workout';
  if (/^\/events\/[^/]+$/.test(pathname)) return 'event';
  return 'default';
}

function Block({ className = '' }) {
  return <span className={`${styles.block} ${className}`} aria-hidden="true" />;
}

function MapSkeleton() {
  return (
    <div className={styles.mapLayout}>
      <div className={styles.mapSurface}>
        <Block className={styles.search} />
        <Block className={styles.mapAction} />
        <div className={styles.mapPins} aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      </div>
      <div className={styles.mapList}>
        <Block className={styles.eyebrow} />
        <Block className={styles.title} />
        <Block className={styles.eventRow} />
        <Block className={styles.eventRow} />
        <Block className={styles.eventRow} />
      </div>
    </div>
  );
}

function AgendaSkeleton() {
  return (
    <div className={styles.pageLayout}>
      <Block className={styles.eyebrow} />
      <Block className={styles.heroTitle} />
      <Block className={styles.subtitle} />
      <Block className={styles.segmented} />
      <div className={styles.calendar}>
        <Block className={styles.calendarTitle} />
        <div className={styles.calendarGrid} aria-hidden="true">
          {Array.from({ length: 35 }, (_, index) => <i key={index} />)}
        </div>
      </div>
    </div>
  );
}

function ChatSkeleton() {
  return (
    <div className={`${styles.pageLayout} ${styles.compact}`}>
      <Block className={styles.eyebrow} />
      <Block className={styles.heroTitle} />
      <Block className={styles.subtitle} />
      <Block className={styles.segmented} />
      <Block className={styles.input} />
      {Array.from({ length: 4 }, (_, index) => (
        <div className={styles.chatRow} key={index}>
          <Block className={styles.avatar} />
          <span>
            <Block className={styles.rowTitle} />
            <Block className={styles.rowText} />
          </span>
        </div>
      ))}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className={`${styles.pageLayout} ${styles.profileLayout}`}>
      <Block className={styles.eyebrow} />
      <Block className={styles.segmented} />
      <div className={styles.profileHero}>
        <Block className={styles.cover} />
        <Block className={styles.profileAvatar} />
        <Block className={styles.profileName} />
        <Block className={styles.profileBio} />
        <div className={styles.stats}>
          <Block /><Block /><Block />
        </div>
      </div>
      <Block className={styles.profileCard} />
      <Block className={styles.profileCard} />
    </div>
  );
}

function CreateSkeleton() {
  return (
    <div className={styles.pageLayout}>
      <Block className={styles.eyebrow} />
      <Block className={styles.heroTitle} />
      <div className={styles.formCard}>
        <Block className={styles.progress} />
        <Block className={styles.sectionTitle} />
        <Block className={styles.input} />
        <div className={styles.sportGrid}>
          {Array.from({ length: 6 }, (_, index) => <Block key={index} />)}
        </div>
        <Block className={styles.input} />
      </div>
    </div>
  );
}

function DetailSkeleton({ workout = false }) {
  return (
    <div className={styles.pageLayout}>
      <div className={workout ? styles.workoutHero : styles.detailHero}>
        <Block className={styles.detailBadge} />
        <Block className={styles.detailTitle} />
        <Block className={styles.detailSubtitle} />
      </div>
      <Block className={styles.detailMap} />
      <div className={styles.detailStats}>
        <Block /><Block /><Block />
      </div>
      <Block className={styles.detailCard} />
    </div>
  );
}

function DefaultSkeleton() {
  return (
    <div className={styles.pageLayout}>
      <Block className={styles.eyebrow} />
      <Block className={styles.heroTitle} />
      <Block className={styles.subtitle} />
      <Block className={styles.detailCard} />
      <Block className={styles.detailCard} />
    </div>
  );
}

function RouteLoadingSkeleton({ pathname = '/' }) {
  const kind = routeKind(pathname);

  return (
    <section
      className={styles.root}
      aria-label="Caricamento della schermata"
      aria-live="polite"
      aria-busy="true"
    >
      <span className={styles.srOnly}>Caricamento...</span>
      {kind === 'map' ? <MapSkeleton /> : null}
      {kind === 'agenda' ? <AgendaSkeleton /> : null}
      {kind === 'chat' ? <ChatSkeleton /> : null}
      {kind === 'profile' ? <ProfileSkeleton /> : null}
      {kind === 'create' ? <CreateSkeleton /> : null}
      {kind === 'event' ? <DetailSkeleton /> : null}
      {kind === 'workout' ? <DetailSkeleton workout /> : null}
      {kind === 'default' ? <DefaultSkeleton /> : null}
    </section>
  );
}

export default RouteLoadingSkeleton;
