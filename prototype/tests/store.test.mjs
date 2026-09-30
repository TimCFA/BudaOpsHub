// Store: Fill confirm never overwrites a slot that already has someone, saved or still pending.
// Run: cd prototype && node --test tests/store.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, seedState } from '../state/store.js';

describe('store', () => {
  test('applyProposals leaves a pending hand placement alone', async () => {
    const store = createStore(seedState());
    store.assign('lunch', 'drinks-1', 'p-rafael', { side: 'foh' }); // pending for 600 ms
    assert.equal(store.dpAssignments('foh', 'lunch')['drinks-1'].pending, true);
    await store.applyProposals([{ slotId: 'drinks-1', personId: 'p-yesenia' }, { slotId: 'host-2', personId: 'p-yesenia' }], 'lunch', { side: 'foh' });
    const dp = store.dpAssignments('foh', 'lunch');
    assert.equal(dp['drinks-1'].personId, 'p-rafael', 'the pending hand placement stays');
    assert.equal(dp['host-2'].personId, 'p-yesenia', 'the empty slot is filled');
  });

  test('applyProposals leaves a saved placement alone and clear() only empties that slot', async () => {
    const store = createStore(seedState());
    await store.assign('lunch', 'drinks-1', 'p-rafael', { side: 'foh' });
    assert.equal(store.dpAssignments('foh', 'lunch')['drinks-1'].pending, undefined);
    await store.applyProposals([{ slotId: 'drinks-1', personId: 'p-harper' }, { slotId: 'omd-1', personId: 'p-diego' }], 'lunch', { side: 'foh' });
    assert.equal(store.dpAssignments('foh', 'lunch')['drinks-1'].personId, 'p-rafael');
    await store.clear('lunch', 'omd-1', { side: 'foh' });
    const dp = store.dpAssignments('foh', 'lunch');
    assert.equal(dp['omd-1'], undefined);
    assert.equal(dp['drinks-1'].personId, 'p-rafael');
  });
});
