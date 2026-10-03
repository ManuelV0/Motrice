import { Capacitor } from '@capacitor/core';

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const DATA_URL_PATTERN = /data:(?:image|video|audio)\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/gi;
const SENSITIVE_KEY_PATTERN = /(?:address|authorization|avatar|cookie|coords?|email|image|lat(?:itude)?|lng|lon(?:gitude)?|password|photo|secret|street|token)/i;

let captureExceptionImpl = null;

function sanitizeText(value) {
  return String(value || '')
    .replace(DATA_URL_PATTERN, '[contenuto multimediale rimosso]')
    .replace(EMAIL_PATTERN, '[email rimossa]')
    .replace(UUID_PATTERN, '[id]');
}

function sanitizeUrl(value) {
  try {
    const url = new URL(String(value), window.location.origin);
    url.search = '';
    url.hash = '';
    url.pathname = url.pathname.replace(UUID_PATTERN, ':id');
    return url.toString();
  } catch {
    return sanitizeText(value).split('?')[0].split('#')[0];
  }
}

function sanitizeValue(value, depth = 0) {
  if (depth > 4 || value == null) return value;
  if (typeof value === 'string') return sanitizeText(value);
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 30).map((entry) => sanitizeValue(entry, depth + 1));

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEY_PATTERN.test(key))
      .map(([key, entry]) => [key, sanitizeValue(entry, depth + 1)])
  );
}

function sanitizeEvent(event) {
  const cleaned = { ...event };

  // Motrice does not send account identity, precise position, media or free-form
  // application state to Sentry. Device/OS metadata and stack traces remain useful.
  delete cleaned.user;
  delete cleaned.extra;

  if (cleaned.request) {
    cleaned.request = {
      method: cleaned.request.method,
      url: cleaned.request.url ? sanitizeUrl(cleaned.request.url) : undefined,
    };
  }

  if (cleaned.contexts) cleaned.contexts = sanitizeValue(cleaned.contexts);
  if (cleaned.tags) cleaned.tags = sanitizeValue(cleaned.tags);
  if (cleaned.message) cleaned.message = sanitizeText(cleaned.message);
  if (cleaned.exception?.values) {
    cleaned.exception = {
      ...cleaned.exception,
      values: cleaned.exception.values.map((entry) => ({
        ...entry,
        value: entry?.value ? sanitizeText(entry.value) : entry?.value,
      })),
    };
  }

  return cleaned;
}

function sanitizeBreadcrumb(breadcrumb) {
  if (!breadcrumb) return breadcrumb;
  return {
    ...breadcrumb,
    message: breadcrumb.message ? sanitizeText(breadcrumb.message) : breadcrumb.message,
    data: breadcrumb.data ? sanitizeValue(breadcrumb.data) : breadcrumb.data,
  };
}

async function readAppInfo() {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { App } = await import('@capacitor/app');
    return await App.getInfo();
  } catch {
    return null;
  }
}

export async function initializeErrorMonitoring() {
  const dsn = String(import.meta.env.VITE_SENTRY_DSN || '').trim();
  const explicitlyDisabled = String(import.meta.env.VITE_SENTRY_ENABLED || 'true').toLowerCase() === 'false';
  if (!import.meta.env.PROD || explicitlyDisabled || !/^https:\/\//i.test(dsn)) {
    return { enabled: false };
  }

  try {
    const [appInfo, Sentry, SentryReact] = await Promise.all([
      readAppInfo(),
      import('@sentry/capacitor'),
      import('@sentry/react'),
    ]);
    const platform = Capacitor.getPlatform();
    const version = appInfo?.version || String(import.meta.env.VITE_APP_VERSION || 'web');
    const build = appInfo?.build || 'web';
    const appId = appInfo?.id || 'com.motrice.web';
    const release = `${appId}@${version}+${build}`;

    Sentry.init(
      {
        dsn,
        release,
        environment: import.meta.env.MODE || 'production',
        enabled: true,
        sendDefaultPii: false,
        enableLogs: false,
        maxBreadcrumbs: 30,
        tracesSampleRate: 0,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0,
        beforeSend: sanitizeEvent,
        beforeBreadcrumb: sanitizeBreadcrumb,
        ignoreErrors: [
          'ResizeObserver loop limit exceeded',
          'ResizeObserver loop completed with undelivered notifications',
        ],
        denyUrls: [/extensions\//i, /^chrome-extension:\/\//i, /^safari-extension:\/\//i],
        initialScope: {
          tags: {
            app_platform: platform,
            app_version: version,
            app_build: build,
          },
        },
      },
      SentryReact.init
    );

    captureExceptionImpl = Sentry.captureException;

    return { enabled: true, release, platform };
  } catch (error) {
    console.warn('Monitoraggio errori non disponibile:', error);
    return { enabled: false };
  }
}

export function captureMonitoringException(error, context = {}) {
  if (!captureExceptionImpl || !error) return;
  captureExceptionImpl(error, {
    tags: sanitizeValue(context.tags || {}),
    contexts: context.contexts ? sanitizeValue(context.contexts) : undefined,
  });
}
