import test from 'node:test';
import assert from 'node:assert/strict';
import { getReadableLoadError, isNetworkError } from './networkStatus.js';

test('riconosce gli errori di rete più comuni', () => {
  assert.equal(isNetworkError(new TypeError('Failed to fetch')), true);
  assert.equal(isNetworkError(new Error('Network request failed')), true);
});

test('riconosce un errore di rete conservato come causa', () => {
  const error = new Error('Snapshot incompleto');
  error.cause = new Error('Load failed');
  assert.equal(isNetworkError(error), true);
});

test('non trasforma un errore applicativo in errore di rete', () => {
  assert.equal(isNetworkError(new Error('Accesso amministratore richiesto')), false);
});

test('restituisce un messaggio comprensibile per la rete assente', () => {
  assert.equal(
    getReadableLoadError(new Error('Failed to fetch')),
    'Connessione assente. Controlla la rete e riprova.'
  );
});
