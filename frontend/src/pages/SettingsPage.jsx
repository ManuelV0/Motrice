import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import {
  Bell,
  BellRing,
  ChevronDown,
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

function SettingsAccordion({ id, icon: Icon, title, summary, open, onToggle, children }) {
  return (
    <section className={`${styles.accordion} ${open ? styles.accordionOpen : ''}`}>
      <button
        type="button"
        className={styles.accordionTrigger}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={onToggle}
      >
        <span className={styles.accordionIcon}><Icon size={19} aria-hidden="true" /></span>
        <span className={styles.accordionCopy}>
          <strong>{title}</strong>
          <small>{summary}</small>
        </span>
        <ChevronDown className={styles.accordionChevron} size={19} aria-hidden="true" />
      </button>
      {open ? (
        <div id={`${id}-panel`} className={styles.accordionPanel} role="region">
          {children}
        </div>
      ) : null}
    </section>
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
  const [openSection, setOpenSection] = useState(null);

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

  const activeNotificationCategories = 1
    + Number(Boolean(notificationPreferences.chat_social))
    + Number(Boolean(notificationPreferences.wallet_account))
    + Number(Boolean(notificationPreferences.promotions));
  const mapThemeLabel = MAP_THEME_OPTIONS.find((option) => option.value === appSettings.mapTheme)?.label || 'Satellite';
  const workoutSummary = [
    appSettings.workoutCountdownSound ? 'Suono' : '',
    appSettings.workoutVibration ? 'Vibrazione' : '',
    appSettings.keepWorkoutScreenAwake ? 'Schermo attivo' : ''
  ].filter(Boolean).join(' · ') || 'Feedback disattivato';

  function toggleSection(section) {
    setOpenSection((current) => current === section ? null : section);
  }

  return (
    <section className={styles.page}>
      <header className={styles.pageHeader}>
        <h1>Impostazioni</h1>
        <p>Scegli una sezione per personalizzare Motrice.</p>
      </header>

      <div className={styles.accordionList}>
        <SettingsAccordion
          id="settings-notifications"
          icon={BellRing}
          title="Notifiche"
          summary={`${activeNotificationCategories}/4 attive · ${notificationStatusLabel}`}
          open={openSection === 'notifications'}
          onToggle={() => toggleSection('notifications')}
        >
          <div className={styles.permissionStrip}>
            <span><strong>Notifiche sul dispositivo</strong><small>{notificationStatusLabel}</small></span>
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
        </SettingsAccordion>

        <SettingsAccordion
          id="settings-location"
          icon={MapPinned}
          title="Posizione e mappe"
          summary={`${locationStatusLabel} · Mappa ${mapThemeLabel.toLowerCase()}`}
          open={openSection === 'location'}
          onToggle={() => toggleSection('location')}
        >
          <div className={styles.rows}>
            <SettingRow
              icon={BellRing}
              title="Arrivo intelligente"
              description="Ti avvisa quando entri nell’area; il check-in resta sempre manuale"
              action={<SettingSwitch checked={appSettings.smartArrivalEnabled} label="Arrivo intelligente" onChange={(value) => patchAppSettings({ smartArrivalEnabled: value })} />}
            />
          </div>
          <div className={styles.locationCard}>
            <LocateFixed size={20} aria-hidden="true" />
            <div><strong>Controllo posizione</strong><small>Usata soltanto per mappa, arrivo intelligente, check-in o evento attivo.</small></div>
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
        </SettingsAccordion>

        <SettingsAccordion
          id="settings-workout"
          icon={Dumbbell}
          title="Allenamento live"
          summary={workoutSummary}
          open={openSection === 'workout'}
          onToggle={() => toggleSection('workout')}
        >
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
        </SettingsAccordion>

        <SettingsAccordion
          id="settings-privacy"
          icon={FileLock2}
          title="Privacy e assistenza"
          summary="Autorizzazioni, guida e domande frequenti"
          open={openSection === 'privacy'}
          onToggle={() => toggleSection('privacy')}
        >
          <div className={styles.linkRows}>
            <a href="/privacy/" className={styles.linkRow}>
              <span><FileLock2 size={18} aria-hidden="true" /><strong>Informativa privacy</strong></span><ChevronRight size={18} aria-hidden="true" />
            </a>
            <button type="button" className={styles.linkRow} onClick={openSystemSettings}>
              <span><ShieldCheck size={18} aria-hidden="true" /><strong>Autorizzazioni del telefono</strong></span><ChevronRight size={18} aria-hidden="true" />
            </button>
            <Link to="/tutorial" className={styles.linkRow}><span><Sparkles size={18} aria-hidden="true" /><strong>Guida rapida</strong></span><ChevronRight size={18} aria-hidden="true" /></Link>
            <Link to="/faq" className={styles.linkRow}><span><CircleHelp size={18} aria-hidden="true" /><strong>Domande frequenti</strong></span><ChevronRight size={18} aria-hidden="true" /></Link>
          </div>
        </SettingsAccordion>
      </div>

      <footer className={styles.versionRow}><span>Versione Motrice</span><strong>{appVersion}</strong></footer>
    </section>
  );
}

export default SettingsPage;
