import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { api } from './api';
import {
  buildEventReminderPlan,
  DEFAULT_NOTIFICATION_PREFERENCES,
  getNotificationCategory,
  getNotificationPath,
  isNotificationEnabled,
  stableNotificationId
} from '../utils/notificationRules';
import { withTimeout } from '../utils/asyncTimeout';

const PENDING_PATH_KEY = 'motrice_pending_notification_path_v1';
const PERMISSION_PROMPTED_KEY = 'motrice_notification_permission_prompted_v1';
const MANAGED_REMINDER_FLAG = 'motriceManagedReminder';
// Native releases enable remote push by default. Developers can still disable
// it explicitly with VITE_PUSH_NOTIFICATIONS_ENABLED=false in local builds.
const REMOTE_PUSH_ENABLED = String(
  import.meta.env.VITE_PUSH_NOTIFICATIONS_ENABLED ?? 'true'
).toLowerCase() !== 'false';
const NATIVE_PERMISSION_TIMEOUT_MS = 4000;
const PUSH_REGISTRATION_TIMEOUT_MS = 8000;

const NotificationSettings = registerPlugin('NotificationSettings');

let pushNotificationsPromise;
let pushRegistrationPromise;
let lastRegisteredPushToken = '';
const pushTokenRequests = new Map();

async function getPushNotifications() {
  if (!REMOTE_PUSH_ENABLED) return null;
  if (!pushNotificationsPromise) {
    pushNotificationsPromise = import('@capacitor/push-notifications')
      .then(({ PushNotifications }) => PushNotifications)
      .catch(() => null);
  }
  return pushNotificationsPromise;
}

const CHANNELS = [
  {
    id: 'motrice_events',
    name: 'Eventi e sicurezza',
    description: 'Check-in, variazioni, annullamenti e stato degli eventi',
    importance: 4,
    visibility: 1,
    lights: true,
    lightColor: '#CCFF00',
    vibration: true
  },
  {
    id: 'motrice_chat',
    name: 'Chat e social',
    description: 'Messaggi, inviti e recensioni',
    importance: 3,
    visibility: 1,
    vibration: true
  },
  {
    id: 'motrice_wallet',
    name: 'Wallet e account',
    description: 'Depositi, rimborsi, prelievi e verifica del profilo',
    importance: 4,
    visibility: 0,
    vibration: true
  },
  {
    id: 'motrice_promotions',
    name: 'Suggerimenti e promozioni',
    description: 'Novità e suggerimenti facoltativi',
    importance: 2,
    visibility: 0,
    vibration: false
  }
];

function isNativeDevice() {
  return Capacitor.isNativePlatform() && ['android', 'ios'].includes(Capacitor.getPlatform());
}

function readLocalFlag(key) {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

function writeLocalFlag(key) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, 'true');
  } catch {
    // Il permesso di sistema puo comunque essere richiesto senza persistenza locale.
  }
}

async function persistPushToken(value) {
  const token = String(value || '').trim();
  if (!token) return false;
  if (lastRegisteredPushToken === token) return true;
  if (pushTokenRequests.has(token)) return pushTokenRequests.get(token);

  const request = api.registerPushDevice({
    token,
    platform: Capacitor.getPlatform(),
    deviceLabel: typeof navigator !== 'undefined' ? navigator.userAgent || 'Motrice mobile' : 'Motrice mobile'
  })
    .then(() => {
      lastRegisteredPushToken = token;
      return true;
    })
    .catch(() => false)
    .finally(() => pushTokenRequests.delete(token));

  pushTokenRequests.set(token, request);
  return request;
}

export async function registerCurrentDeviceForPush(pushNotificationsInstance) {
  if (!isNativeDevice()) return false;
  if (pushRegistrationPromise) return pushRegistrationPromise;

  const pushNotifications = pushNotificationsInstance || await getPushNotifications();
  if (!pushNotifications) return false;

  pushRegistrationPromise = new Promise(async (resolve) => {
    let settled = false;
    let timeoutId;
    let registrationHandle;
    let errorHandle;

    const finish = async (registered, token = '') => {
      if (settled) return;
      settled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      await registrationHandle?.remove?.();
      await errorHandle?.remove?.();
      resolve(token ? await persistPushToken(token) : registered);
    };

    try {
      registrationHandle = await pushNotifications.addListener('registration', ({ value }) => {
        finish(true, value).catch(() => resolve(false));
      });
      errorHandle = await pushNotifications.addListener('registrationError', () => {
        finish(false).catch(() => resolve(false));
      });
      timeoutId = window.setTimeout(() => {
        finish(false).catch(() => resolve(false));
      }, PUSH_REGISTRATION_TIMEOUT_MS);
      await pushNotifications.register();
    } catch {
      await finish(false);
    }
  }).finally(() => {
    pushRegistrationPromise = null;
  });

  return pushRegistrationPromise;
}

function channelFor(type) {
  const category = getNotificationCategory(type);
  if (category === 'chat_social') return 'motrice_chat';
  if (category === 'wallet_account') return 'motrice_wallet';
  if (category === 'promotions') return 'motrice_promotions';
  return 'motrice_events';
}

function storePendingPath(path) {
  if (!path || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PENDING_PATH_KEY, path);
  } catch {
    // La navigazione verra comunque inoltrata nell'evento runtime.
  }
}

function forwardNotificationPath(notification, onOpen) {
  const path = getNotificationPath(notification);
  if (onOpen) onOpen(path);
  else storePendingPath(path);
}

export function consumePendingNotificationPath() {
  if (typeof window === 'undefined') return '';
  try {
    const path = window.localStorage.getItem(PENDING_PATH_KEY) || '';
    if (path) window.localStorage.removeItem(PENDING_PATH_KEY);
    return path;
  } catch {
    return '';
  }
}

async function createNotificationChannels() {
  if (!isNativeDevice() || Capacitor.getPlatform() !== 'android') return;
  const pushNotifications = await getPushNotifications();
  await Promise.all(CHANNELS.map(async (channel) => {
    await LocalNotifications.createChannel(channel).catch(() => undefined);
    if (pushNotifications) {
      await pushNotifications.createChannel(channel).catch(() => undefined);
    }
  }));
}

async function readPreferences() {
  try {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...(await api.getNotificationPreferences()) };
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
}

async function showPushWhileOpen(notification) {
  const preferences = await readPreferences();
  const type = notification?.data?.type || notification?.type || 'event_update';
  if (!isNotificationEnabled(type, preferences)) return;
  await LocalNotifications.schedule({
    notifications: [{
      id: stableNotificationId(`push:${notification?.id || Date.now()}`),
      title: notification?.title || 'Motrice',
      body: notification?.body || 'Hai un nuovo aggiornamento.',
      channelId: channelFor(type),
      schedule: { at: new Date(Date.now() + 250) },
      extra: {
        ...(notification?.data || {}),
        type,
        action_path: getNotificationPath(notification)
      }
    }]
  }).catch(() => undefined);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('motrice:notifications-changed'));
}

export async function scheduleEventReminders() {
  if (!isNativeDevice()) return { scheduled: 0 };
  const permission = await LocalNotifications.checkPermissions().catch(() => ({ display: 'denied' }));
  if (permission.display !== 'granted') return { scheduled: 0, permission: permission.display };

  const pending = await LocalNotifications.getPending().catch(() => ({ notifications: [] }));
  const managed = (pending?.notifications || []).filter((item) => item?.extra?.[MANAGED_REMINDER_FLAG]);
  if (managed.length) {
    await LocalNotifications.cancel({ notifications: managed.map((item) => ({ id: item.id })) }).catch(() => undefined);
  }

  const events = await api.listEvents({
    dateRange: 'all',
    includePast: false,
    includeCancelled: false,
    sortBy: 'soonest'
  }).catch(() => []);
  const reminders = buildEventReminderPlan(events);
  if (!reminders.length) return { scheduled: 0 };

  await LocalNotifications.schedule({
    notifications: reminders.map((reminder) => ({
      id: reminder.id,
      title: reminder.title,
      body: reminder.body,
      channelId: 'motrice_events',
      schedule: { at: new Date(reminder.atMs), allowWhileIdle: true },
      extra: {
        [MANAGED_REMINDER_FLAG]: true,
        type: reminder.type,
        event_id: reminder.eventId,
        action_path: reminder.path
      }
    }))
  });
  return { scheduled: reminders.length };
}

export async function showSmartArrivalNotification(event) {
  if (!event?.id) return { delivered: false, reason: 'invalid_event' };
  const path = `/agenda?verifyEvent=${encodeURIComponent(String(event.id))}&arrival=1`;

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('motrice:smart-arrival-detected', {
      detail: { eventId: String(event.id), path }
    }));
  }

  if (!isNativeDevice()) return { delivered: false, reason: 'web', path };
  const permission = await LocalNotifications.checkPermissions().catch(() => ({ display: 'denied' }));
  if (permission.display !== 'granted') return { delivered: false, reason: permission.display, path };

  const eventName = event.title || event.sport_name || 'il tuo evento';
  await LocalNotifications.schedule({
    notifications: [{
      id: stableNotificationId(`smart-arrival:${event.id}`),
      title: 'Sei arrivato?',
      body: `Conferma ora la presenza a ${eventName}.`,
      channelId: 'motrice_events',
      schedule: { at: new Date(Date.now() + 250), allowWhileIdle: true },
      extra: {
        type: 'event_arrival_detected',
        event_id: String(event.id),
        action_path: path
      }
    }]
  }).catch(() => undefined);

  return { delivered: true, path };
}

export async function requestNotificationPermission() {
  if (!isNativeDevice()) return { display: 'unsupported', receive: 'unsupported' };
  writeLocalFlag(PERMISSION_PROMPTED_KEY);
  const local = await LocalNotifications.requestPermissions().catch(() => ({ display: 'denied' }));
  const pushNotifications = await getPushNotifications();
  const push = pushNotifications
    ? await pushNotifications.requestPermissions().catch(() => ({ receive: 'denied' }))
    : { receive: 'disabled' };
  const registered = push.receive === 'granted'
    ? await registerCurrentDeviceForPush(pushNotifications)
    : false;
  if (local.display === 'granted') {
    await scheduleEventReminders().catch(() => undefined);
  }
  return { display: local.display, receive: push.receive, registered };
}

export function shouldAutoRequestNotificationPermission(status) {
  if (!isNativeDevice() || readLocalFlag(PERMISSION_PROMPTED_KEY)) return false;
  return status === 'prompt' || status === 'prompt-with-rationale';
}

export async function openNotificationSettings() {
  if (!isNativeDevice() || Capacitor.getPlatform() !== 'android') return false;
  try {
    const result = await NotificationSettings.openAppSettings();
    return result?.opened !== false;
  } catch {
    return false;
  }
}

export async function getNotificationPermissionStatus() {
  if (!isNativeDevice()) return { display: 'unsupported', receive: 'unsupported' };
  const pushNotifications = await withTimeout(
    getPushNotifications(),
    NATIVE_PERMISSION_TIMEOUT_MS,
    'Modulo push non disponibile'
  ).catch(() => null);
  const [local, push] = await Promise.all([
    withTimeout(
      LocalNotifications.checkPermissions(),
      NATIVE_PERMISSION_TIMEOUT_MS,
      'Permessi notifiche locali non disponibili'
    ).catch(() => ({ display: 'denied' })),
    pushNotifications
      ? withTimeout(
        pushNotifications.checkPermissions(),
        NATIVE_PERMISSION_TIMEOUT_MS,
        'Permessi push non disponibili'
      ).catch(() => ({ receive: 'denied' }))
      : Promise.resolve({ receive: 'disabled' })
  ]);
  return { display: local.display, receive: push.receive };
}

export async function initializeNotificationCenter({ onOpen } = {}) {
  if (!isNativeDevice()) return () => {};
  await createNotificationChannels();

  const handles = [];
  const localActionHandle = await LocalNotifications
    .addListener('localNotificationActionPerformed', ({ notification }) => {
      forwardNotificationPath(notification?.extra || notification, onOpen);
    })
    .catch(() => null);
  if (localActionHandle) handles.push(localActionHandle);

  const pushNotifications = await getPushNotifications();
  if (pushNotifications) {
    const pushHandles = await Promise.all([
      pushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
        forwardNotificationPath({ ...notification, payload: notification?.data }, onOpen);
      }).catch(() => null),
      pushNotifications.addListener('pushNotificationReceived', (notification) => {
        showPushWhileOpen(notification).catch(() => undefined);
      }).catch(() => null),
      pushNotifications.addListener('registration', ({ value }) => {
        persistPushToken(value).catch(() => undefined);
      }).catch(() => null),
      pushNotifications.addListener('registrationError', () => {
        // I promemoria locali restano operativi anche senza configurazione FCM/APNs.
      }).catch(() => null)
    ]);
    handles.push(...pushHandles.filter(Boolean));
  }

  const currentPermissions = await getNotificationPermissionStatus();
  // Non mostrare richieste di sistema durante l'accesso: l'utente le attiva
  // volontariamente dalla pagina Notifiche. Questo mantiene il bootstrap sicuro.
  if (pushNotifications && currentPermissions.receive === 'granted') {
    await registerCurrentDeviceForPush(pushNotifications).catch(() => false);
  }
  if (currentPermissions.display === 'granted') {
    await scheduleEventReminders().catch(() => undefined);
  }

  return () => {
    handles.forEach((handle) => handle?.remove?.());
  };
}
