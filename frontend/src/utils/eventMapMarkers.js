const EVENT_PIN_FILL = '#a8f000';
const EVENT_PIN_SAVED_FILL = '#c7f75a';
const EVENT_GYM_PIN_FILL = '#cf70ff';
const EVENT_GYM_PIN_SAVED_FILL = '#e6b8ff';
const EVENT_PIN_PATH = 'M24 2.5C12.5 2.5 3.5 11.1 3.5 22.2c0 8.3 5.1 15 11.9 19.2L24 54.2l8.6-12.8c6.8-4.2 11.9-10.9 11.9-19.2C44.5 11.1 35.5 2.5 24 2.5Z';

const EVENT_ACTIVITY_ICON_NODES = {
  running: [
    ['path', { d: 'M13.5 5.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm-3.7 12.4 1-4.4 2.1 2v6h2V14l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.6 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.2L6 6.8v4.7h2V8.2l1.8-.7-1.6 8.1-4.9-1-.4 2 6.9 1.3Z', fill: 'currentColor', stroke: 'none' }]
  ],
  gym: [
    ['rect', { x: 1.7, y: 8, width: 3.8, height: 8, rx: 1.9, fill: 'currentColor', stroke: 'none' }],
    ['rect', { x: 5, y: 6.2, width: 3.3, height: 11.6, rx: 1.65, fill: 'currentColor', stroke: 'none' }],
    ['rect', { x: 7.7, y: 10.35, width: 8.6, height: 3.3, rx: 1.65, fill: 'currentColor', stroke: 'none' }],
    ['rect', { x: 15.7, y: 6.2, width: 3.3, height: 11.6, rx: 1.65, fill: 'currentColor', stroke: 'none' }],
    ['rect', { x: 18.5, y: 8, width: 3.8, height: 8, rx: 1.9, fill: 'currentColor', stroke: 'none' }]
  ],
  tennis: [
    ['ellipse', { cx: 8.8, cy: 8.1, rx: 5.1, ry: 6.8, transform: 'rotate(-38 8.8 8.1)', fill: 'currentColor', stroke: 'none' }],
    ['path', { d: 'm12.6 13.5 6.8 7', 'stroke-width': 3.25 }],
    ['circle', { cx: 18.8, cy: 6.4, r: 2.45, fill: 'currentColor', stroke: 'none' }]
  ],
  football: [
    ['circle', { cx: 12, cy: 12, r: 9.2 }],
    ['path', { d: 'm12 7.8 3.6 2.6-1.4 4.2H9.8l-1.4-4.2z', fill: 'currentColor' }],
    ['path', { d: 'm12 7.8.1-5' }],
    ['path', { d: 'm15.6 10.4 4.8-1.5' }],
    ['path', { d: 'm14.2 14.6 3 4.2' }],
    ['path', { d: 'm9.8 14.6-3 4.2' }],
    ['path', { d: 'm8.4 10.4-4.8-1.5' }]
  ],
  basketball: [
    ['circle', { cx: 12, cy: 12, r: 9.3, fill: 'currentColor', stroke: 'none' }],
    ['path', { d: 'M3.1 12h17.8M12 2.7v18.6M5.3 5.5c4.7 2.1 8.7 8.9 13.4 13M18.7 5.5c-4.7 2.1-8.7 8.9-13.4 13', stroke: 'var(--event-pin-fill)', 'stroke-width': 1.45 }]
  ],
  yoga: [
    ['circle', { cx: 12, cy: 4.6, r: 2.7, fill: 'currentColor', stroke: 'none' }],
    ['path', { d: 'M12 8.4v6.2M12 10.6 7.2 14M12 10.6l4.8 3.4M4 17.2c3.5 0 5.6-1 8-2.6 2.4 1.6 4.5 2.6 8 2.6M5.1 20.2c2.8-2 4.8-2.4 6.9-2.4s4.1.4 6.9 2.4', 'stroke-width': 3.15 }]
  ],
  trekking: [
    ['path', { d: 'm2.6 19.7 6-9.4 3.1 4.2 2.8-4.4 6.9 9.6H2.6Z', fill: 'currentColor', stroke: 'none' }],
    ['path', { d: 'm8.6 10.3 1.7 2.3-2.4 1.2-1.1-1.3', stroke: 'var(--event-pin-fill)', 'stroke-width': 1.25 }]
  ],
  cycling: [
    ['circle', { cx: 6.2, cy: 17.1, r: 3.55 }],
    ['circle', { cx: 17.8, cy: 17.1, r: 3.55 }],
    ['circle', { cx: 13.1, cy: 5.2, r: 1.8, fill: 'currentColor', stroke: 'none' }],
    ['path', { d: 'm10.2 8.1 3.8.5 2.1 3.4M10.2 8.1 7.5 12l4.3 2.2 2.1 3M10.2 8.1l2.9-1.3', 'stroke-width': 2.1 }]
  ],
  swimming: [
    ['path', { d: 'M2 17c1.3 0 1.9-1 3.2-1s1.9 1 3.2 1 1.9-1 3.2-1 1.9 1 3.2 1 1.9-1 3.2-1 1.9 1 3.2 1', 'stroke-width': 2.1 }],
    ['path', { d: 'M3.2 20c1.2 0 1.8-.8 3-.8s1.8.8 3 .8 1.8-.8 3-.8 1.8.8 3 .8 1.8-.8 3-.8 1.8.8 3 .8', 'stroke-width': 2.1 }],
    ['circle', { cx: 15.8, cy: 7, r: 2.1, fill: 'currentColor', stroke: 'none' }],
    ['path', { d: 'm5.2 14.7 5.1-5.1 4.2 2.2 3.2-1.1', 'stroke-width': 2.5 }]
  ],
  activity: [
    ['path', { d: 'M3 12h4l2.2-5.2 4.1 10.4 2.2-5.2H21', 'stroke-width': 3.1 }]
  ]
};

export function getEventActivityType(event) {
  const activity = `${event?.sport_name || ''} ${event?.title || ''}`.toLocaleLowerCase('it-IT');
  if (/(calcio|calcetto|football|soccer|futsal)/.test(activity)) return 'football';
  if (/(tennis|padel|racchett|pickleball)/.test(activity)) return 'tennis';
  if (/(basket|pallacanestro)/.test(activity)) return 'basketball';
  if (/(yoga|pilates|meditazione|mindfulness)/.test(activity)) return 'yoga';
  if (/(trekking|escursion|hiking|camminata|walking|montagna)/.test(activity)) return 'trekking';
  if (/(ciclismo|bicicletta|bici|cycling|bike|mtb)/.test(activity)) return 'cycling';
  if (/(nuoto|swimming|piscina|acqua)/.test(activity)) return 'swimming';
  if (/(palestra|gym|fitness|forza|functional|workout|crossfit|hiit|calisthenics|bodybuild)/.test(activity)) return 'gym';
  if (/(corsa|running|jogging|trail|maratona)/.test(activity)) return 'running';
  return 'activity';
}

function escapeSvgAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function renderEventActivityNodes(activityType, pinFill) {
  return EVENT_ACTIVITY_ICON_NODES[activityType]
    .map(([tagName, attributes]) => {
      const serializedAttributes = Object.entries(attributes)
        .map(([name, value]) => {
          const normalizedValue = String(value)
            .replaceAll('currentColor', '#050705')
            .replaceAll('var(--event-pin-fill)', pinFill);
          return `${name}="${escapeSvgAttribute(normalizedValue)}"`;
        })
        .join(' ');
      return `<${tagName} ${serializedAttributes}/>`;
    })
    .join('');
}

export function getEventPinImageId(activityType, saved = false, selected = false, gym = false) {
  return `motrice-pin-${activityType}-${gym ? 'gym' : 'standard'}-${saved ? 'saved' : 'default'}${selected ? '-selected' : ''}`;
}

export function createEventPinSvg(activityType, { saved = false, selected = false, cluster = false, gym = false } = {}) {
  const pinFill = gym
    ? (saved ? EVENT_GYM_PIN_SAVED_FILL : EVENT_GYM_PIN_FILL)
    : (saved ? EVENT_PIN_SAVED_FILL : EVENT_PIN_FILL);
  const activityNodes = cluster ? '' : renderEventActivityNodes(activityType, pinFill);
  const selectedOutline = selected
    ? `<path d="${EVENT_PIN_PATH}" fill="none" stroke="#ffffff" stroke-width="4.6" stroke-linejoin="round"/>`
    : `<path d="${EVENT_PIN_PATH}" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="3.4" stroke-linejoin="round"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="112" viewBox="0 0 48 56">
    <ellipse cx="24" cy="53.7" rx="6.5" ry="1.65" fill="rgba(0,0,0,.32)"/>
    ${selectedOutline}
    <path d="${EVENT_PIN_PATH}" fill="${pinFill}" stroke="#050705" stroke-width="2.5" stroke-linejoin="round"/>
    ${cluster ? '' : `<g transform="translate(12 10)" fill="none" stroke="#050705" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round">${activityNodes}</g>`}
    ${gym && !cluster ? '<g aria-hidden="true"><circle cx="38" cy="13" r="5.25" fill="#0d0712" stroke="#ffffff" stroke-opacity=".55" stroke-width="1"/><path d="M36.25 13v-1.15a1.75 1.75 0 0 1 3.5 0V13m-4.1 0h4.7v3.4h-4.7z" fill="none" stroke="#cf70ff" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></g>' : ''}
  </svg>`;
}
