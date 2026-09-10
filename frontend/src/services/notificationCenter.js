import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import { api } from './api';
import {
  buildEventReminderPlan,
  DEFAULT_NOTIFICATION_PREFERENCES,
  getNotificationCategory,
  getNotificationPath,
  isNotificationEnabled,
  stableNotificationId
} from '../utils/notificationRules';

const PENDING_PATH_KEY = 'motrice_pending_notification_path_v1';
const MANAGED_REMINDER_FLAG = 'motriceManagedReminder';

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
  await Promise.all(CHANNELS.map(async (channel) => {
    await LocalNotifications.createChannel(channel).catch(() => undefined);
    await PushNotifications.createChannel(channel).catch(() => undefined);
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

export async function requestNotificationPermission() {
  if (!isNativeDevice()) return { display: 'unsupported' };
  const local = await LocalNotifications.requestPermissions();
  const push = await PushNotifications.requestPermissions().catch(() => ({ receive: 'denied' }));
  return { display: local.display, receive: push.receive };
}

export async function getNotificationPermissionStatus() {
  if (!isNativeDevice()) return { display: 'unsupported', receive: 'unsupported' };
  const [local, push] = await Promise.all([
    LocalNotifications.checkPermissions().catch(() => ({ display: 'denied' })),
    PushNotifications.checkPermissions().catch(() => ({ receive: 'denied' }))
  ]);
  return { display: local.display, receive: push.receive };
}

export async function initializeNotificationCenter({ onOpen } = {}) {
  if (!isNativeDevice()) return () => {};
  await createNotificationChannels();

  const handles = [];
  handles.push(await LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
    forwardNotificationPath(notification?.extra || notification, onOpen);
  }));
  handles.push(await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
    forwardNotificationPath({ ...notification, payload: notification?.data }, onOpen);
  }));
  handles.push(await PushNotifications.addListener('pushNotificationReceived', (notification) => {
    showPushWhileOpen(notification).catch(() => undefined);
  }));
  handles.push(await PushNotifications.addListener('registration', ({ value }) => {
    api.registerPushDevice({
      token: value,
      platform: Capacitor.getPlatform(),
      deviceLabel: navigator.userAgent || 'Motrice mobile'
    }).catch(() => undefined);
  }));
  handles.push(await PushNotifications.addListener('registrationError', () => {
    // I promemoria locali restano operativi anche senza configurazione FCM/APNs.
  }));

  const currentPermissions = await getNotificationPermissionStatus();
  const permissions = ['prompt', 'prompt-with-rationale'].includes(currentPermissions.display) ||
    ['prompt', 'prompt-with-rationale'].includes(currentPermissions.receive)
    ? await requestNotificationPermission()
    : currentPermissions;
  if (permissions.receive === 'granted') await PushNotifications.register().catch(() => undefined);
  if (permissions.display === 'granted') await scheduleEventReminders().catch(() => undefined);

  return () => {
    handles.forEach((handle) => handle?.remove?.());
  };
}
