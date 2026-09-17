import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import {
  Bell,
  BellRing,
  ChevronRight,
  CircleHelp,
  Dumbbell,
  FileLock2,
  Info,
  LocateFixed,
  Map,
  MapPinned,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Volume2,
  Vibrate
} from 'lucide-react';
import { usePageMeta } from '../hooks/usePageMeta';
import { useToast } from '../context/ToastContext';
import { useUserLocation } from '../hooks/useUserLocation';
import { api } from '../services/api';
import { getAppSettings, updateAppSettings } from '../services/appSettings';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../utils/notificationRules';
import styles from '../styles/pages/settings.module.css';

const MAP_THEME_OPTIONS = [
  { value: 'dark', label: 'Scura' },
  { value: 'light', label: 'Chiara' },
  { value: 'satellite', label: 'Satellite' }
];

function SettingSwitch({ checked, disabled = false, label, onChange }) {
  return (
    <button
      type="button"
      className={`${styles.switch} ${checked ? styles.switchOn : ''}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span aria-hidden="true" />
    </button>
  );
}

function SettingRow({ icon: Icon, title, description, action }) {
  return (
    <div className={styles.settingRow}>
      <span className={styles.rowIcon}><Icon size={18} aria-hidden="true" /></span>
      <span className={styles.rowCopy}>
        <strong>{title}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      <span className={styles.rowAction}>{action}</span>
    </div>
  );
}

function SettingsPage() {
  const { showToast } = useToast();
  const location = useUserLocation();
  const [appSettings, setAppSettings] = useState(() => getAppSettings());
  const [notificationPreferences, setNotificationPreferences] = useState(DEFAULT_NOTIFICATION_PREFERENCES);
  const [notificationPermission, setNotificationPermission] = useState(null);
  const [notificationBusy, setNotificationBusy] = useState('');
  const [appVersion, setAppVersion] = useState('Beta web');

  usePageMeta({
    title: 'Impostazioni | Motrice',
    description: 'Preferenze beta di Motrice per notifiche, posizione, mappe e allenamento.'
  });

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  useEffect(() => {
    let active = true;
    api.getNotificationPreferences()
      .then((preferences) => {
        if (active) setNotificationPreferences({ ...DEFAULT_NOTIFICATION_PREFERENCES, ...preferences });
      })
      .catch(() => undefined);

    import('../services/notificationCenter')
      .then(({ getNotificationPermissionStatus }) => getNotificationPermissionStatus())
      .then((status) => {
        if (active) setNotificationPermission(status);
      })
      .catch(() => undefined);

    if (Capacitor.isNativePlatform()) {
      import('@capacitor/app')
        .then(({ App }) => App.getInfo())
        .then((info) => {
          if (active) setAppVersion(`${info.version} (${info.build})`);
        })
        .catch(() => undefined);
    }

    return () => { active = false; };
  }, []);

  function patchAppSettings(patch) {
    const next = updateAppSettings(patch);
    setAppSettings(next);
    showToast('Impostazione aggiornata', 'success');
  }

  async function patchNotificationPreference(key, value) {
    if (key === 'event_security' || notificationBusy) return;
    const previous = notificationPreferences;
    const next = { ...previous, [key]: value };
    setNotificationPreferences(next);
    setNotificationBusy(key);
    try {
      const saved = await api.updateNotificationPreferences({ [key]: value });
      setNotificationPreferences({ ...DEFAULT_NOTIFICATION_PREFERENCES, ...saved });
      showToast('Preferenze notifiche aggiornate', 'success');
    } catch {
      setNotificationPreferences(previous);
      showToast('Impossibile salvare la preferenza', 'error');
    } finally {
      setNotificationBusy('');
    }
  }

  async function manageNotificationPermission() {
    const notificationCenter = await import('../services/notificationCenter');
    if (notificationPermission?.receive === 'denied') {
      await notificationCenter.openNotificationSettings();
      return;
    }
    const status = await notificationCenter.requestNotificationPermission();
    setNotificationPermission(status);
  }

  async function openSystemSettings() {
    const notificationCenter = await import('../services/notificationCenter');
    const opened = await notificationCenter.openNotificationSettings();
    if (!opened) showToast('Apri le autorizzazioni dalle impostazioni del dispositivo', 'info');
  }

  async function verifyLocation() {
    const coords = await location.requestLocation({ requireFresh: false, maxAgeMs: 30000 });
    if (coords) showToast('Posizione disponibile', 'success');
  }

  const notificationStatusLabel = notificationPermission?.receive === 'granted'
    ? 'Attive sul dispositivo'
    : notificationPermission?.receive === 'denied'
      ? 'Disattivate dal telefono'
      : notificationPermission?.receive === 'unsupported'
        ? 'Disponibili nell’app installata'
        : 'Da autorizzare';

  const locationStatusLabel = location.hasLocation
    ? location.permission === 'approximate' ? 'Posizione approssimativa' : 'Posizione disponibile'
    : location.permission === 'denied' ? 'Autorizzazione negata' : 'Da verificare';

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <span className={styles.heroIcon}><Sparkles size={20} aria-hidden="true" /></span>
        <div>
          <p>Controlli beta</p>
          <h1>Impostazioni</h1>
          <span>Personalizza Motrice senza modificare il tuo profilo.</span>
        </div>
      </header>

      <section className={styles.settingsSection} aria-labelledby="settings-notifications">
        <div className={styles.sectionHeading}>
          <span><BellRing size={18} aria-hidden="true" /></span>
          <div><h2 id="settings-notifications">Notifiche</h2><p>{notificationStatusLabel}</p></div>
          <button
            type="button"
            className={styles.compactAction}
            onClick={manageNotificationPermission}
            disabled={notificationPermission?.receive === 'unsupported'}
          >
            {notificationPermission?.receive === 'granted'
              ? 'Gestisci'
              : notificationPermission?.receive === 'unsupported' ? 'Solo app' : 'Attiva'}
          </button>
        </div>
        <div className={styles.rows}>
          <SettingRow
            icon={ShieldCheck}
            title="Eventi e sicurezza"
            description="Check-in, modifiche e avvisi indispensabili"
            action={<SettingSwitch checked disabled label="Eventi e sicurezza sempre attivi" onChange={() => {}} />}
          />
          <SettingRow
            icon={Bell}
            title="Chat e social"
            description="Messaggi, inviti e valutazioni"
            action={<SettingSwitch checked={notificationPreferences.chat_social} disabled={notificationBusy === 'chat_social'} label="Chat e social" onChange={(value) => patchNotificationPreference('chat_social', value)} />}
          />
          <SettingRow
            icon={Info}
            title="Wallet e account"
            description="Credito, rimborsi, XP e verifica profilo"
            action={<SettingSwitch checked={notificationPreferences.wallet_account} disabled={notificationBusy === 'wallet_account'} label="Wallet e account" onChange={(value) => patchNotificationPreference('wallet_account', value)} />}
          />
          <SettingRow
            icon={Sparkles}
            title="Suggerimenti"
            description="Novità facoltative sull’app"
            action={<SettingSwitch checked={notificationPreferences.promotions} disabled={notificationBusy === 'promotions'} label="Suggerimenti" onChange={(value) => patchNotificationPreference('promotions', value)} />}
          />
        </div>
      </section>

      <section className={styles.settingsSection} aria-labelledby="settings-location">
        <div className={styles.sectionHeading}>
          <span><MapPinned size={18} aria-hidden="true" /></span>
          <div><h2 id="settings-location">Posizione e mappe</h2><p>{locationStatusLabel}</p></div>
        </div>
        <div className={styles.locationCard}>
          <LocateFixed size={20} aria-hidden="true" />
          <div><strong>Controllo posizione</strong><small>Usata in tempo reale soltanto quando serve per mappa, check-in o evento attivo.</small></div>
          <button type="button" onClick={location.permission === 'denied' ? openSystemSettings : verifyLocation} disabled={location.requesting}>
            {location.requesting ? 'Verifico…' : location.permission === 'denied' ? 'Autorizza' : 'Verifica'}
          </button>
        </div>
        <div className={styles.mapThemeBlock}>
          <div><Map size={18} aria-hidden="true" /><span><strong>Stile della mappa</strong><small>La scelta vale anche nei dettagli evento.</small></span></div>
          <div className={styles.segmented} aria-label="Stile della mappa">
            {MAP_THEME_OPTIONS.map((option) => (
              <button
                type="button"
                key={option.value}
                className={appSettings.mapTheme === option.value ? styles.segmentActive : ''}
                aria-pressed={appSettings.mapTheme === option.value}
                onClick={() => patchAppSettings({ mapTheme: option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.settingsSection} aria-labelledby="settings-workout">
        <div className={styles.sectionHeading}>
          <span><Dumbbell size={18} aria-hidden="true" /></span>
          <div><h2 id="settings-workout">Allenamento live</h2><p>Timer e feedback durante la sessione</p></div>
        </div>
        <div className={styles.rows}>
          <SettingRow
            icon={Volume2}
            title="Suono ultimi 5 secondi"
            description="Segnale nelle cuffie durante il recupero"
            action={<SettingSwitch checked={appSettings.workoutCountdownSound} label="Suono timer" onChange={(value) => patchAppSettings({ workoutCountdownSound: value })} />}
          />
          <SettingRow
            icon={Vibrate}
            title="Vibrazione"
            description="Feedback per serie, timer e modifiche"
            action={<SettingSwitch checked={appSettings.workoutVibration} label="Vibrazione allenamento" onChange={(value) => patchAppSettings({ workoutVibration: value })} />}
          />
          <SettingRow
            icon={Smartphone}
            title="Schermo sempre attivo"
            description="Evita lo spegnimento durante la scheda live"
            action={<SettingSwitch checked={appSettings.keepWorkoutScreenAwake} label="Schermo sempre attivo" onChange={(value) => patchAppSettings({ keepWorkoutScreenAwake: value })} />}
          />
        </div>
      </section>

      <section className={styles.settingsSection} aria-labelledby="settings-privacy">
        <div className={styles.sectionHeading}>
          <span><FileLock2 size={18} aria-hidden="true" /></span>
          <div><h2 id="settings-privacy">Privacy e autorizzazioni</h2><p>Controlli trasparenti, senza modificare statistiche o affidabilità</p></div>
        </div>
        <div className={styles.linkRows}>
          <a href="/privacy/" className={styles.linkRow}>
            <span><FileLock2 size={18} aria-hidden="true" /><strong>Informativa privacy</strong></span><ChevronRight size={18} aria-hidden="true" />
          </a>
          <button type="button" className={styles.linkRow} onClick={openSystemSettings}>
            <span><ShieldCheck size={18} aria-hidden="true" /><strong>Autorizzazioni del telefono</strong></span><ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
      </section>

      <section className={styles.settingsSection} aria-labelledby="settings-help">
        <div className={styles.sectionHeading}>
          <span><CircleHelp size={18} aria-hidden="true" /></span>
          <div><h2 id="settings-help">Assistenza</h2><p>Guide e informazioni tecniche</p></div>
        </div>
        <div className={styles.linkRows}>
          <Link to="/tutorial" className={styles.linkRow}><span><Sparkles size={18} aria-hidden="true" /><strong>Guida rapida</strong></span><ChevronRight size={18} aria-hidden="true" /></Link>
          <Link to="/faq" className={styles.linkRow}><span><CircleHelp size={18} aria-hidden="true" /><strong>Domande frequenti</strong></span><ChevronRight size={18} aria-hidden="true" /></Link>
        </div>
        <div className={styles.versionRow}><span>Versione Motrice</span><strong>{appVersion}</strong></div>
      </section>
    </section>
  );
}

export default SettingsPage;
