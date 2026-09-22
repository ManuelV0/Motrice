import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyDerivedDarkMapStyle,
  applyLocalizedMapLabels,
  canUseAcceleratedMapRenderer,
  getAndroidMajorVersion,
  getHighDefinitionPixelRatio,
  getHighDefinitionRasterTiles,
  MAPLIBRE_STYLES,
  shouldUseCompatibleMapRenderer
} from './mapRendering.js';

test('prefers Italian and local map labels without touching non-name symbols', () => {
  const updates = [];
  const map = {
    getStyle() {
      return {
        layers: [
          { id: 'place_city', type: 'symbol', layout: { 'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']] } },
          { id: 'motorway_ref', type: 'symbol', layout: { 'text-field': ['get', 'ref'] } },
          { id: 'roads', type: 'line', layout: {} }
        ]
      };
    },
    setLayoutProperty(...args) {
      updates.push(args);
    }
  };

  assert.equal(applyLocalizedMapLabels(map), 1);
  assert.deepEqual(updates, [[
    'place_city',
    'text-field',
    ['coalesce', ['get', 'name_it'], ['get', 'name:it'], ['get', 'name'], ['get', 'name_en'], ['get', 'name:latin']]
  ]]);
  assert.equal(applyLocalizedMapLabels(null), 0);
});

test('uses an API-key-free raster source for compatible maps', () => {
  const light = getHighDefinitionRasterTiles('light');
  const dark = getHighDefinitionRasterTiles('dark');
  const satellite = getHighDefinitionRasterTiles('satellite');

  assert.equal(light.url, 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
  assert.equal(dark.url, light.url);
  assert.doesNotMatch(light.url, /key|token|carto/i);
  assert.equal(light.options.maxZoom, 20);
  assert.equal(light.options.maxNativeZoom, 19);
  assert.equal(light.options.detectRetina, true);
  assert.match(light.options.attribution, /OpenStreetMap/);
  assert.match(satellite.url, /World_Imagery/);
  assert.match(satellite.overlayUrl, /World_Boundaries_and_Places/);
  assert.match(satellite.options.attribution, /Esri/);
  assert.equal(satellite.overlayOptions.detectRetina, true);
});

test('keeps vector styles aligned with the selected map theme', () => {
  assert.match(MAPLIBRE_STYLES.light, /positron/);
  assert.equal(MAPLIBRE_STYLES.dark, MAPLIBRE_STYLES.light);
  assert.match(MAPLIBRE_STYLES.light, /openfreemap/);
  assert.equal(MAPLIBRE_STYLES.satellite.version, 8);
  assert.equal(MAPLIBRE_STYLES.satellite.layers.at(-1).source, 'motrice-satellite-labels');
  assert.equal(getHighDefinitionPixelRatio(), 1.5);
});

test('derives the dark palette from the light layers without recoloring Motrice overlays', () => {
  const updates = [];
  const map = {
    getStyle() {
      return {
        layers: [
          { id: 'background', type: 'background' },
          { id: 'highway_minor', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation' },
          { id: 'label_city', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place' },
          { id: 'motrice-event-pins', type: 'symbol', source: 'motrice-event-markers' }
        ]
      };
    },
    setPaintProperty(...args) {
      updates.push(args);
    }
  };

  assert.equal(applyDerivedDarkMapStyle(map), 3);
  assert.ok(updates.some(([id, property, value]) => id === 'highway_minor' && property === 'line-color' && value === '#55615a'));
  assert.ok(updates.some(([id, property, value]) => id === 'label_city' && property === 'text-color' && value === '#edf2ed'));
  assert.equal(updates.some(([id]) => id === 'motrice-event-pins'), false);
  assert.equal(applyDerivedDarkMapStyle(null), 0);
});

test('routes every Android WebView and low-memory device to the compatible renderer', () => {
  assert.equal(getAndroidMajorVersion('Mozilla/5.0 (Linux; Android 9; SM-G950F)'), 9);
  assert.equal(getAndroidMajorVersion('Mozilla/5.0 (Linux; Android 14; SM-S921B)'), 14);
  assert.equal(shouldUseCompatibleMapRenderer({ userAgent: 'Android 9', deviceMemory: 8 }), true);
  assert.equal(shouldUseCompatibleMapRenderer({ userAgent: 'Android 14', deviceMemory: 2 }), true);
  assert.equal(shouldUseCompatibleMapRenderer({ userAgent: 'Android 14', deviceMemory: 8 }), true);
  assert.equal(shouldUseCompatibleMapRenderer({ userAgent: 'Mozilla/5.0 (Macintosh)', deviceMemory: 8 }), false);
});

test('checks WebGL safely before enabling the accelerated renderer', () => {
  const loseContextCalls = [];
  const documentRef = {
    createElement() {
      return {
        getContext() {
          return {
            getExtension() {
              return { loseContext: () => loseContextCalls.push('lost') };
            }
          };
        }
      };
    }
  };

  assert.equal(canUseAcceleratedMapRenderer({
    documentRef,
    userAgent: 'Mozilla/5.0 (Linux; Android 14)',
    deviceMemory: 8
  }), false);
  assert.deepEqual(loseContextCalls, []);
  assert.equal(canUseAcceleratedMapRenderer({
    documentRef,
    userAgent: 'Mozilla/5.0 (Macintosh)',
    deviceMemory: 8
  }), true);
  assert.deepEqual(loseContextCalls, ['lost']);
});
