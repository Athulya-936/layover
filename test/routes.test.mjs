// Route builder for "fly from anywhere": `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildRoute } = require('../server/routes.js');

const airports = JSON.parse(fs.readFileSync(new URL('../web/data/airports.json', import.meta.url)));
const featured = [{ id: 'CCJ-DXB', flightNo: 'VK101', from: 'CCJ', to: 'DXB', depRwy: '28', arrRwy: '30L', blockMin: 245 }];

test('featured route is returned as-is', () => {
  assert.equal(buildRoute(airports, featured, 'ccj', 'dxb'), featured[0]);
});

test('custom route picks real runway ends and a sane block time', () => {
  const r = buildRoute(airports, featured, 'BOM', 'LHR');
  assert.ok(!r.error, r.error);
  const ends = iata => airports.find(a => a.iata === iata).runways.flatMap(x => x.ends.map(e => e.id));
  assert.ok(ends('BOM').includes(r.depRwy), `BOM has ${r.depRwy}`);
  assert.ok(ends('LHR').includes(r.arrRwy), `LHR has ${r.arrRwy}`);
  // LHR is west-north-west of BOM: expect a westerly runway at Heathrow (27L/27R)
  assert.match(r.arrRwy, /^27/);
  assert.ok(r.blockMin > 480 && r.blockMin < 660, `block ${r.blockMin}`);
  assert.match(r.flightNo, /^VK\d{3}$/);
});

test('bad input gives an error, not a crash', () => {
  assert.ok(buildRoute(airports, featured, 'XXX', 'DXB').error);
  assert.ok(buildRoute(airports, featured, 'DXB', 'DXB').error);
});
