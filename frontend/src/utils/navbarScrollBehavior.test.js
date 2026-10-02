import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceNavbarScrollState,
  createNavbarScrollState
} from './navbarScrollBehavior.js';

test('compatta la top bar solo dopo uno scroll verso il basso intenzionale', () => {
  let state = createNavbarScrollState(0);
  state = advanceNavbarScrollState(state, 40);
  assert.equal(state.compact, false);

  state = advanceNavbarScrollState(state, 58);
  assert.equal(state.compact, false);

  state = advanceNavbarScrollState(state, 74);
  assert.equal(state.compact, true);
});

test('ripristina la top bar appena l utente risale in modo evidente', () => {
  let state = { ...createNavbarScrollState(150), compact: true };
  state = advanceNavbarScrollState(state, 144);
  assert.equal(state.compact, true);

  state = advanceNavbarScrollState(state, 139);
  assert.equal(state.compact, false);
});

test('mantiene la top bar normale vicino all inizio e quando un pannello e aperto', () => {
  const compact = { ...createNavbarScrollState(120), compact: true };

  assert.equal(advanceNavbarScrollState(compact, 18).compact, false);
  assert.equal(advanceNavbarScrollState(compact, 140, { blocked: true }).compact, false);
  assert.equal(advanceNavbarScrollState(compact, 140, { enabled: false }).compact, false);
});
