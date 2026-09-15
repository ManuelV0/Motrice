import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getHighDefinitionPixelRatio,
  getHighDefinitionRasterTiles,
  MAPLIBRE_STYLES
} from './mapRendering.js';

test('uses high-density raster tiles for light and dark compatible maps', () => {
  const light = getHighDefinitionRasterTiles('light');
  const dark = getHighDefinitionRasterTiles('dark');

  assert.match(light.url, /light_all/);
  assert.match(dark.url, /dark_all/);
  assert.match(light.url, /\{r\}/);
  assert.equal(light.options.maxZoom, 20);
  assert.match(light.options.attribution, /CARTO/);
});

test('keeps vector styles aligned with the selected map theme', () => {
  assert.match(MAPLIBRE_STYLES.light, /positron/);
  assert.match(MAPLIBRE_STYLES.dark, /dark-matter/);
  assert.equal(getHighDefinitionPixelRatio(), 1.5);
});
