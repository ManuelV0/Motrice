import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeValhallaPolyline } from './routeGeometry.js';

test('decodifica correttamente una geometria Valhalla polyline6', () => {
  assert.deepEqual(
    decodeValhallaPolyline('e~epoA|jfpOiDaK'),
    [
      [42.225139, -8.670911],
      [42.225224, -8.670718]
    ]
  );
});

test('rifiuta una polyline troncata invece di produrre coordinate errate', () => {
  assert.deepEqual(decodeValhallaPolyline('e~epoA|'), []);
});
