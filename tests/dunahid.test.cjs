'use strict';
// No test dependencies: node --test tests/dunahid.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'dunahid-csengeto.html'), 'utf8');
const code = html.match(/<script id="train-model">([\s\S]*?)<\/script>/)[1];
const sandbox = vm.createContext({ Intl, Date, Map, Set });
vm.runInContext(code, sandbox);
const M = vm.runInContext('TrainModel', sandbox);
const now = Date.now();
const seconds = value => value / 1000;
const trip = { id: 'BKK_H6123_run', routeId: 'BKK_H6', tripHeadsign: 'Közvágóhíd' };
const stops = { a: { name: 'Szigetszentmiklós' }, b: { name: 'Dunaharaszti külső' }, c: { name: 'Közvágóhíd' } };
const item = (changes = {}, meta = {}) => M.departure({ tripId: trip.id, serviceDate: '2026-10-18', departureTime: seconds(now), predictedDepartureTime: seconds(now), ...changes }, trip, meta, now);

test('az irányt a megállók sorrendje dönti el, nem a közös útvonalnév', () => {
  assert.equal(M.direction({ stopTimes: [{ stopId: 'a' }, { stopId: 'b' }, { stopId: 'c' }] }, stops), true);
  assert.equal(M.direction({ stopTimes: [{ stopId: 'c' }, { stopId: 'b' }, { stopId: 'a' }] }, stops), false);
  assert.equal(M.direction({ stopTimes: [{ stopId: 'a' }, { stopId: 'c' }] }, stops), false);
});
test('csak a pontos Szigetszentmiklós megálló és H6 járat fogadható el', () => {
  assert.equal(M.isOrigin('Szigetszentmiklós H'), true);
  assert.equal(M.isOrigin('Szigetszentmiklós, József Attila-telep'), false);
  assert.equal(M.isH6(trip), true);
  assert.equal(M.isH6({ routeId: 'custom' }, { custom: { shortName: 'H6' } }), true);
  assert.equal(M.isH6({ routeId: 'BKK_H7' }), false);
  assert.equal(M.isH6({ routeId: 'BKK_2380' }, { BKK_2380: { shortName: '238' } }), false);
});
test('az indulási előrejelzés elsőbbséget élvez; érkezésből nem készül jelzés', () => {
  const value = item({ predictedArrivalTime: seconds(now - 60000), arrivalTime: seconds(now - 90000), predictedDepartureTime: seconds(now + 40000) });
  assert.equal(value.time, now + 40000);
  assert.equal(value.realtime, true);
  assert.equal(item({ departureTime: undefined, predictedDepartureTime: undefined, predictedArrivalTime: seconds(now) }), null);
});
test('pontosan indulás +30 mp után válik esedékessé a jelzés', () => {
  const monitor = new M.Monitor();
  monitor.ingest([item()], now);
  assert.equal(monitor.due(now + 29999, now - 1000).ringing.length, 0);
  assert.equal(monitor.due(now + 30000, now - 1000).ringing.length, 1);
  assert.equal(monitor.due(now + 30001, now - 1000).ringing.length, 0);
});
test('az új valós idejű indulási idő átütemezi a jelzést', () => {
  const monitor = new M.Monitor();
  monitor.ingest([item()], now);
  monitor.ingest([item({ predictedDepartureTime: seconds(now + 20000) })], now + 10000);
  assert.equal(monitor.records.size, 1);
  assert.equal(monitor.due(now + 30000, now - 1).ringing.length, 0);
  monitor.ingest([{ ...item({ predictedDepartureTime: seconds(now + 20000) }), observedAt: now + 30000 }], now + 30000);
  assert.equal(monitor.due(now + 50000, now - 1).ringing.length, 1);
});
test('a kijelzésből eltűnő, már elindult vonat +30 mp jelzése megmarad', () => {
  const monitor = new M.Monitor();
  monitor.ingest([item({ predictedDepartureTime: seconds(now + 5000) })], now);
  monitor.ingest([], now + 10000);
  monitor.ingest([], now + 20000);
  assert.equal(monitor.upcoming(now + 10000).length, 0);
  assert.equal(monitor.due(now + 35000, now - 1).ringing.length, 1);
});
test('csak menetrendi idő látható, de soha nem csenget', () => {
  const monitor = new M.Monitor();
  monitor.ingest([item({ predictedDepartureTime: undefined })], now);
  assert.equal(monitor.upcoming(now).length, 1);
  assert.equal(monitor.due(now + 30000, now - 1).ringing.length, 0);
});
test('a 30 perces kijelzés pontos határt használ, minden vonatot mutat', () => {
  const monitor = new M.Monitor();
  for (let i = 0; i < 12; i++) monitor.ingest([{ ...item({ predictedDepartureTime: seconds(now + i * 60000) }), key: `train-${i}` }], now);
  monitor.ingest([{ ...item({ predictedDepartureTime: seconds(now + 1800000) }), key: 'boundary' }, { ...item({ predictedDepartureTime: seconds(now + 1800001) }), key: 'outside' }], now);
  assert.equal(monitor.upcoming(now).length, 13);
  assert.equal(monitor.upcoming(now).at(-1).key, 'boundary');
});
test('nem gyárt vonatszámot egy dátumból vagy egy jármű azonosítójából', () => {
  assert.equal(M.trainNumber(trip), '6123');
  assert.equal(M.trainNumber({ tripShortName: 'H1234' }), '1234');
  assert.equal(M.trainNumber({ id: 'BKK_20261018_123456', blockId: '234567' }), null);
});
test('kimaradó és törölt vonat nem csenget, indulási idő nélküli törlés is működik', () => {
  const monitor = new M.Monitor();
  monitor.ingest([item()], now);
  monitor.ingest([item({ status: 'CANCELED' })], now);
  assert.equal(monitor.records.size, 0);
  monitor.ingest([item()], now);
  monitor.cancel(trip.id, '2026-10-18');
  assert.equal(monitor.due(now + 30000, now - 1).ringing.length, 0);
  assert.equal(M.cancelled({ scheduleRelationship: 'SKIPPED' }), true);
});
test('elavult adatból és alvás után nincs késői csengetés', () => {
  const stale = new M.Monitor();
  stale.ingest([item({ predictedDepartureTime: seconds(now + 30000) })], now);
  assert.equal(stale.due(now + 60000, now - 1).ringing.length, 0);
  const sleeping = new M.Monitor();
  sleeping.ingest([item()], now);
  assert.equal(sleeping.due(now + 36000, now - 1).missed.length, 1);
  assert.equal(sleeping.due(now + 37000, now - 1).ringing.length, 0);
});
test('hangengedélyezés előtt esedékes jelzés később sem csenget visszamenőleg', () => {
  const monitor = new M.Monitor();
  monitor.ingest([item()], now);
  assert.equal(monitor.due(now + 30000).ringing.length, 0);
  assert.equal(monitor.due(now + 31000, now + 30500).ringing.length, 0);
});
test('újratöltés után sem csenget újra ugyanaz a napi vonat', () => {
  const monitor = new M.Monitor();
  monitor.ingest([item()], now);
  monitor.due(now + 30000, now - 1);
  const restored = new M.Monitor([...monitor.handled]);
  restored.ingest([item()], now + 31000);
  assert.equal(restored.due(now + 31000, now - 1).ringing.length, 0);
});
test('a következő napi azonos azonosítójú vonat külön jelzést kaphat', () => {
  const monitor = new M.Monitor();
  const first = item();
  monitor.handled.set(first.key, now + 100000);
  const next = item({ serviceDate: '2026-10-19' });
  monitor.ingest([next], now);
  assert.equal(monitor.due(now + 30000, now - 1).ringing.length, 1);
});
test('a vonat- és ismétlésvédelmi tárolók mérete korlátos', () => {
  const monitor = new M.Monitor();
  for (let i = 0; i < 500; i++) {
    monitor.ingest([{ ...item(), key: `trip-${i}` }], now);
    monitor.due(now + 30000, now - 1);
  }
  assert.ok(monitor.records.size <= 64);
  assert.ok(monitor.handled.size <= 128);
  monitor.prune(now + 5 * 60 * 60000);
  assert.equal(monitor.records.size, 0);
  assert.equal(monitor.handled.size, 0);
});
