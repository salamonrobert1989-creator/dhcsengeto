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
test('Dunaharaszti külsőről csak a Tököl és Ráckeve felé vezető irány kerül az új listába', () => {
  const allStops = { ...stops, t: { name: 'Tököl' }, r: { name: 'Ráckeve' } };
  const entry = ids => ({ stopTimes: ids.map((stopId, index) => ({ stopId, stopSequence: String(index) })) });
  assert.equal(M.southboundDirection(entry(['c', 'b', 'a', 't', 'r']), allStops), true);
  assert.equal(M.southboundDirection(entry(['c', 'b', 'a', 't']), allStops), true);
  assert.equal(M.southboundDirection(entry(['r', 't', 'a', 'b', 'c']), allStops), false);
  assert.equal(M.southboundDirection(entry(['c', 'b']), allStops), false);
});
test('a déli irány rövidített, Szigetszentmiklósig közlekedő járata is megjelenhet', () => {
  assert.equal(M.southboundDirection({ stopTimes: [{ stopId: 'b' }, { stopId: 'a' }] }, stops), true);
  assert.equal(M.direction({ stopTimes: [{ stopId: 'b' }, { stopId: 'a' }] }, stops), false);
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
test('élő adat nélkül a menetrendi indulás után is csenget', () => {
  const monitor = new M.Monitor();
  monitor.ingest([item({ predictedDepartureTime: undefined })], now);
  assert.equal(monitor.upcoming(now).length, 1);
  assert.equal(monitor.pending(now).length, 1);
  assert.equal(monitor.due(now + 29999, now - 1).ringing.length, 0);
  const result = monitor.due(now + 30000, now - 1);
  assert.equal(result.ringing.length, 1);
  assert.equal(result.ringing[0].realtime, false);
  assert.equal(monitor.due(now + 31000, now - 1).ringing.length, 0);
});
test('a letöltött menetrend friss adatkapcsolat nélkül is használható', () => {
  const monitor = new M.Monitor();
  monitor.ingest([item({ predictedDepartureTime: undefined, departureTime: seconds(now + 120000) })], now);
  assert.equal(monitor.upcoming(now + 60000).length, 1);
  assert.equal(monitor.pending(now + 60000)[0].time, now + 120000);
  assert.equal(monitor.due(now + 150000, now - 1).ringing.length, 1);
});
test('az élő adat elsőbbséget kap a korábban kapott menetrendi idővel szemben', () => {
  const monitor = new M.Monitor();
  monitor.ingest([item({ predictedDepartureTime: undefined })], now);
  monitor.ingest([{ ...item({ predictedDepartureTime: seconds(now + 20000) }), observedAt: now + 10000 }], now + 10000);
  assert.equal(monitor.pending(now + 10000)[0].time, now + 20000);
  assert.equal(monitor.pending(now + 10000)[0].realtime, true);
  assert.equal(monitor.due(now + 30000, now - 1).ringing.length, 0);
  assert.equal(monitor.due(now + 50000, now - 1).ringing.length, 1);
});
test('eltűnő és elavuló élő adat esetén visszatér a menetrendi időre', () => {
  const monitor = new M.Monitor();
  const schedule = seconds(now + 90000);
  monitor.ingest([item({ departureTime: schedule, predictedDepartureTime: seconds(now + 120000) })], now);
  assert.equal(monitor.upcoming(now)[0].time, now + 120000);
  assert.equal(monitor.upcoming(now + 46000)[0].time, now + 90000);
  assert.equal(monitor.upcoming(now + 46000)[0].realtime, false);
  assert.equal(monitor.due(now + 120000, now - 1).ringing.length, 1);
  const missing = new M.Monitor();
  missing.ingest([item({ departureTime: schedule, predictedDepartureTime: seconds(now + 120000) })], now);
  missing.ingest([item({ departureTime: schedule, predictedDepartureTime: undefined })], now + 10000);
  assert.equal(missing.pending(now + 10000)[0].time, now + 90000);
});
test('menetrendi jelzés után újra megjelenő élő adat nem csenget másodszor', () => {
  const monitor = new M.Monitor();
  monitor.ingest([item({ predictedDepartureTime: undefined })], now);
  assert.equal(monitor.due(now + 30000, now - 1).ringing.length, 1);
  monitor.ingest([{ ...item({ predictedDepartureTime: seconds(now + 30000) }), observedAt: now + 31000 }], now + 31000);
  assert.equal(monitor.due(now + 60000, now - 1).ringing.length, 0);
});
test('a 30 perces kijelzés pontos határt használ, minden vonatot mutat', () => {
  const monitor = new M.Monitor();
  for (let i = 0; i < 12; i++) monitor.ingest([{ ...item({ predictedDepartureTime: seconds(now + i * 60000) }), key: `train-${i}` }], now);
  monitor.ingest([{ ...item({ predictedDepartureTime: seconds(now + 1800000) }), key: 'boundary' }, { ...item({ predictedDepartureTime: seconds(now + 1800001) }), key: 'outside' }], now);
  assert.equal(monitor.upcoming(now).length, 13);
  assert.equal(monitor.upcoming(now).at(-1).key, 'boundary');
});
test('a két megálló indulásai időrendben, darabszámlevágás nélkül jelennek meg', () => {
  const alarm = new M.Monitor(), displayOnly = new M.Monitor();
  for (let i = 0; i < 12; i++) {
    const record = { ...item({ predictedDepartureTime: seconds(now + i * 60000) }), key: `trip-${i}`, stationName: i % 2 ? 'Dunaharaszti külső' : 'Szigetszentmiklós' };
    (i % 2 ? displayOnly : alarm).ingest([record], now);
  }
  displayOnly.ingest([{ ...item({ predictedDepartureTime: seconds(now + 30 * 60000) }), key: 'boundary' }, { ...item({ predictedDepartureTime: seconds(now + 30 * 60000 + 1) }), key: 'outside' }], now);
  const board = M.combinedDepartures(alarm.upcoming(now), displayOnly.upcoming(now));
  assert.equal(board.length, 13);
  assert.equal(board[0].key, 'trip-0');
  assert.equal(board[1].key, 'trip-1');
  assert.equal(board.at(-1).key, 'boundary');
  assert.equal(alarm.pending(now).length, 6);
});
test('az új, csak kijelzett indulások nem kerülnek a csengetést vezérlő rekordok közé', () => {
  const alarm = new M.Monitor(), displayOnly = new M.Monitor();
  alarm.ingest([{ ...item({ predictedDepartureTime: seconds(now + 60000) }), key: 'north' }], now);
  displayOnly.ingest([{ ...item(), key: 'south' }], now);
  assert.equal(M.combinedDepartures(alarm.upcoming(now), displayOnly.upcoming(now)).length, 2);
  assert.equal(alarm.due(now + 30000, now - 1).ringing.length, 0);
  assert.equal(alarm.handled.has('south'), false);
  assert.equal(alarm.pending(now)[0].key, 'north');
});

test('az élő sor színe a pontos késési időhatárokat követi', () => {
  for (const [delayMs, expected] of [[-1, 'delay-early'], [0, 'delay-green'], [59999, 'delay-green'], [60000, 'delay-green'], [179999, 'delay-green'], [180000, 'delay-red'], [3600000, 'delay-red']]) {
    const record = item({ predictedDepartureTime: seconds(now + delayMs) });
    assert.equal(M.departureAppearance(record).className, expected, `delay ${delayMs}`);
  }
});
test('élő adatoknál a késés kiírható, menetrendi adatoknál nincs kitalált késés', () => {
  const delayed = M.departureAppearance(item({ predictedDepartureTime: seconds(now + 390000) }));
  assert.equal(delayed.delayLabel, '+6 perc');
  assert.equal(delayed.delayClass, 'late');
  assert.equal(M.departureAppearance(item()).delayLabel, '');
  assert.equal(M.departureAppearance(item({ predictedDepartureTime: seconds(now - 30000) })).delayLabel, '-1 perc');
  const minor = M.departureAppearance(item({ predictedDepartureTime: seconds(now + 179999) }));
  assert.equal(minor.delayLabel, '+2 perc');
  assert.equal(minor.delayClass, 'minor');
  assert.equal(M.departureAppearance(item({ predictedDepartureTime: seconds(now + 59999) })).delayLabel, '');
  const scheduled = M.departureAppearance(item({ predictedDepartureTime: undefined }));
  assert.equal(scheduled.className, 'scheduled');
  assert.equal(scheduled.label, 'Menetrend szerint');
  const unknown = M.departureAppearance(item({ departureTime: undefined }));
  assert.equal(unknown.className, 'delay-green');
  assert.equal(unknown.label, 'Valós idejű · késés nem ismert');
});
test('élő adat elvesztésekor a szín és a késésfelirat is menetrendire vált', () => {
  const record = item({ departureTime: seconds(now + 90000), predictedDepartureTime: seconds(now + 990000) });
  assert.equal(M.departureAppearance(M.effectiveDeparture(record, now)).className, 'delay-red');
  const fallback = M.departureAppearance(M.effectiveDeparture(record, now + 46000));
  assert.equal(fallback.className, 'scheduled');
  assert.equal(fallback.label, 'Menetrend szerint');
});
test('nem gyárt vonatszámot egy dátumból vagy egy jármű azonosítójából', () => {
  assert.equal(M.trainNumber(trip), '6123');
  assert.equal(M.trainNumber({ tripShortName: 'H1234' }), '1234');
  assert.equal(M.trainNumber({ id: 'BKK_20261018_123456', blockId: '234567' }), null);
});
test('a vonatszámból csak az első négy számjegy jelenik meg', () => {
  assert.equal(M.trainNumber({ trainNumber: '001234' }), '0012');
  assert.equal(M.trainNumber({ tripShortName: 'H12345678' }), '1234');
  assert.equal(M.trainNumber({ shortName: '12345' }), '1234');
  assert.equal(M.trainNumber({ id: 'BKK_H612345_run' }), '6123');
  assert.equal(M.trainNumber({ blockId: 'BKK_H987654' }), '9876');
});
test('az azonos négyjegyű kijelzésű vonatok külön járatok maradnak', () => {
  const monitor = new M.Monitor();
  for (const id of ['BKK_H612345_run', 'BKK_H612346_run']) {
    monitor.ingest([M.departure({ tripId: id, serviceDate: '2026-10-18', departureTime: seconds(now) }, { ...trip, id }, {}, now)], now);
  }
  assert.equal(monitor.upcoming(now).length, 2);
  assert.equal(monitor.upcoming(now)[0].number, '6123');
  assert.equal(monitor.upcoming(now)[1].number, '6123');
  assert.equal(monitor.due(now + 30000, now - 1).ringing.length, 2);
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
test('elavult élő adatból menetrend nélkül és alvás után nincs késői csengetés', () => {
  const stale = new M.Monitor();
  stale.ingest([item({ departureTime: undefined, predictedDepartureTime: seconds(now + 30000) })], now);
  assert.equal(stale.due(now + 60000, now - 1).ringing.length, 0);
  const sleeping = new M.Monitor();
  sleeping.ingest([item()], now);
  assert.equal(sleeping.due(now + 36000, now - 1).missed.length, 1);
  assert.equal(sleeping.due(now + 37000, now - 1).ringing.length, 0);
});
test('a hang aktiválása előtt esedékes jelzés később sem csenget visszamenőleg', () => {
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

const fullTrip = () => ({
  entry: { stopTimes: [
    { stopId: 'r', stopSequence: 0, departureTime: seconds(now - 600000) },
    { stopId: 'g', stopSequence: 1, arrivalTime: seconds(now - 120000), departureTime: seconds(now - 100000), predictedArrivalTime: seconds(now - 90000) },
    { stopId: 'a', stopSequence: 2, arrivalTime: seconds(now + 50000), departureTime: seconds(now + 60000), predictedArrivalTime: seconds(now + 70000), predictedDepartureTime: seconds(now + 80000) },
    { stopId: 'b', stopSequence: 3, arrivalTime: seconds(now + 180000), departureTime: seconds(now + 190000) },
    { stopId: 'c', stopSequence: 4, arrivalTime: seconds(now + 600000) }
  ] },
  references: { trips: { [trip.id]: trip }, stops: { ...stops, r: { name: 'Ráckeve' }, g: { name: 'Szigetszentmiklós-Gyártelep' } } }
});

test('a teljes menetrend megtartja a Szigetszentmiklós előtti megállókat is', () => {
  const snapshot = M.tripSchedule(fullTrip(), trip.id, now);
  assert.equal(snapshot.rows.length, 5);
  assert.equal(snapshot.rows[0].name, 'Ráckeve');
  assert.equal(snapshot.rows[2].name, 'Szigetszentmiklós');
  assert.equal(snapshot.rows[4].name, 'Közvágóhíd');
  assert.equal(snapshot.number, '6123');
});

test('a menetrend a kiválasztott vonat indulóállomásával kezdődik, Ráckevével vagy Tököllel', () => {
  for (const originName of ['Ráckeve', 'Tököl']) {
    const data = fullTrip();
    data.references.stops.r.name = originName;
    // Some providers encode stopSequence as strings and return the currently
    // watched stop first. The service order still determines the true start.
    for (const stop of data.entry.stopTimes) stop.stopSequence = String(stop.stopSequence);
    const [first, second, watched, fourth, last] = data.entry.stopTimes;
    data.entry.stopTimes = [watched, fourth, last, first, second];
    const snapshot = M.tripSchedule(data, trip.id, now);
    assert.equal(snapshot.rows[0].name, originName);
    assert.equal(snapshot.rows[1].name, 'Szigetszentmiklós-Gyártelep');
    assert.equal(snapshot.rows[2].name, 'Szigetszentmiklós');
    assert.equal(snapshot.rows[4].name, 'Közvágóhíd');
    assert.equal(M.direction(data.entry, data.references.stops), true);
  }
});

test('szöveges megállósorszámok mellett a fordított irány továbbra sem csengethet', () => {
  const data = { stopTimes: [{ stopId: 'a', stopSequence: '2' }, { stopId: 'c', stopSequence: '0' }, { stopId: 'b', stopSequence: '1' }] };
  assert.equal(M.direction(data, stops), false);
});

test('a teljes menetrend a megállósorrendet követi, és nincs 100 megállós levágás', () => {
  const data = fullTrip();
  data.entry.stopTimes.reverse();
  assert.equal(M.tripSchedule(data, trip.id, now).rows[0].name, 'Ráckeve');
  data.entry.stopTimes = Array.from({ length: 140 }, (_, index) => ({ stopId: `stop-${index}`, stopSequence: index, departureTime: seconds(now + index * 1000) }));
  assert.equal(M.tripSchedule(data, trip.id, now).rows.length, 140);
});

test('az érkezési és indulási cella külön-külön az élő időt részesíti előnyben', () => {
  const snapshot = M.tripSchedule(fullTrip(), trip.id, now);
  const origin = snapshot.rows[2];
  assert.equal(M.timetableTime(origin, 'arrival', true).time, now + 70000);
  assert.equal(M.timetableTime(origin, 'departure', true).time, now + 80000);
  assert.equal(M.timetableTime(origin, 'arrival', true).realtime, true);
  const mixed = snapshot.rows[1];
  assert.equal(M.timetableTime(mixed, 'arrival', true).time, now - 90000);
  assert.equal(M.timetableTime(mixed, 'arrival', true).realtime, true);
  assert.equal(M.timetableTime(mixed, 'departure', true).time, now - 100000);
  assert.equal(M.timetableTime(mixed, 'departure', true).realtime, false);
});

test('mentett megnyitáskor csak a menetrendi idők jelennek meg, hiányzó időt nem talál ki', () => {
  const snapshot = M.tripSchedule(fullTrip(), trip.id, now);
  assert.equal(M.timetableTime(snapshot.rows[2], 'arrival', false).time, now + 50000);
  assert.equal(M.timetableTime(snapshot.rows[2], 'departure', false).time, now + 60000);
  assert.equal(M.timetableTime(snapshot.rows[2], 'arrival', false).realtime, false);
  assert.equal(M.timetableTime(snapshot.rows[0], 'arrival', true).time, null);
  assert.equal(M.timetableTime(snapshot.rows[4], 'departure', true).time, null);
});

test('élő időadat nélküli teljes menetrend is használható', () => {
  const data = fullTrip();
  for (const stop of data.entry.stopTimes) { delete stop.predictedArrivalTime; delete stop.predictedDepartureTime; }
  const snapshot = M.tripSchedule(data, trip.id, now);
  assert.equal(M.timetableTime(snapshot.rows[2], 'arrival', true).time, now + 50000);
  assert.equal(M.timetableTime(snapshot.rows[2], 'departure', true).realtime, false);
});

test('a mentett menetrendek járatonként és szolgáltatási naponként elkülönülnek', () => {
  const cache = new M.ScheduleCache();
  const today = M.tripSchedule(fullTrip(), trip.id, now);
  cache.put('trip|2026-10-18', today, now);
  assert.equal(cache.get('trip|2026-10-18', now), today);
  assert.equal(cache.get('trip|2026-10-19', now), null);
  assert.equal(cache.get('other|2026-10-18', now), null);
});

test('a teljes menetrendek tárolóját a járatszám és az összes megállószám is korlátozza', () => {
  const cache = new M.ScheduleCache(3, 12);
  for (let i = 0; i < 40; i++) cache.put(`trip-${i}`, M.tripSchedule(fullTrip(), trip.id, now), now);
  assert.ok(cache.entries.size <= 3);
  assert.ok(cache.stopCount <= 12);
  assert.equal(cache.get('trip-0', now), null);
  assert.ok(cache.get('trip-39', now));
  cache.put('oversized', { rows: Array(13).fill({}), fetchedAt: now }, now);
  assert.equal(cache.get('oversized', now), null);
  assert.ok(cache.stopCount <= 12);
});

test('a lejárt teljes menetrendek felszabadulnak', () => {
  const cache = new M.ScheduleCache();
  cache.put('trip', M.tripSchedule(fullTrip(), trip.id, now), now);
  assert.ok(cache.get('trip', now + 3 * 60 * 60000));
  assert.equal(cache.get('trip', now + 4 * 60 * 60000), null);
  assert.equal(cache.entries.size, 0);
  assert.equal(cache.stopCount, 0);
});

test('hibás vagy üres teljes menetrend nem írható felül érvényes adatként', () => {
  assert.throws(() => M.tripSchedule({ entry: { stopTimes: [] } }, trip.id, now));
  assert.throws(() => M.tripSchedule({}, trip.id, now));
});
