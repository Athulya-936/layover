// Read-back matching (no browser needed): `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window = globalThis;
const { checkReadback } = await import('../web/seat/ui/readback.js');
const route = { depRwy: '28', arrRwy: '30L', flightNo: 'VK101' };

test('takeoff read-backs people actually say', () => {
  for (const t of ['cleared for takeoff runway two eight Valkyrie one zero one', 'Cleared for take off, runway 28',
    'runway twenty eight cleared for takeoff']) assert.ok(checkReadback('takeoff', t, route), t);
});
test('landing read-backs', () => {
  for (const t of ['cleared to land runway three zero left', 'cleared to land runway thirty left', 'Cleared to land 30L'])
    assert.ok(checkReadback('land', t, route), t);
});
test('wrong runway or missing clearance fails', () => {
  assert.ok(!checkReadback('takeoff', 'cleared for takeoff runway one zero', route));
  assert.ok(!checkReadback('takeoff', 'runway two eight', route));
  assert.ok(!checkReadback('land', 'cleared for takeoff runway three zero', route));
});
