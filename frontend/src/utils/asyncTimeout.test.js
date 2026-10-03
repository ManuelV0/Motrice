import test from 'node:test';
import assert from 'node:assert/strict';
import { withTimeout } from './asyncTimeout.js';

test('restituisce il risultato quando l operazione termina entro il limite', async () => {
  const value = await withTimeout(Promise.resolve('ok'), 50);
  assert.equal(value, 'ok');
});

test('interrompe l attesa quando un operazione non risponde', async () => {
  await assert.rejects(
    withTimeout(new Promise(() => {}), 15, 'Tempo scaduto'),
    /Tempo scaduto/
  );
});
