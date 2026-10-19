'use strict';
// Optional integration suite: Playwright + Chromium; see README.md.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');

let server, browser, address;
before(async () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'dunahid-csengeto.html'));
  server = http.createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  address = `http://127.0.0.1:${server.address().port}`;
  const executablePath = process.env.CHROMIUM_EXECUTABLE_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--autoplay-policy=document-user-activation-required'] });
});
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function setup(t, options = {}) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, [], 'nincs kezeletlen böngészőhiba'); });
  page.setDefaultTimeout(5000);
  const base = Date.parse('2026-10-19T12:00:00Z');
  await page.clock.install({ time: new Date(base - 1000) });
  await page.clock.pauseAt(new Date(base));
  await page.addInitScript(() => {
    const NativeAudioContext = window.AudioContext;
    window.__sound = { contexts: [], starts: [], disconnected: 0, failNext: false };
    window.AudioContext = class extends NativeAudioContext {
      constructor(...args) {
        super(...args);
        window.__sound.contexts.push(this);
      }
      createOscillator() {
        if (window.__sound.failNext) { window.__sound.failNext = false; throw new Error('Tesztelt átmeneti hanghiba'); }
        const oscillator = super.createOscillator();
        const nativeStart = oscillator.start.bind(oscillator), nativeDisconnect = oscillator.disconnect.bind(oscillator);
        oscillator.start = (...args) => { nativeStart(...args); window.__sound.starts.push({ at: Date.now(), state: this.state }); };
        oscillator.disconnect = (...args) => { window.__sound.disconnected++; return nativeDisconnect(...args); };
        return oscillator;
      }
      createGain() {
        const gain = super.createGain();
        const analyser = this.createAnalyser();
        analyser.fftSize = 1024;
        gain.connect(analyser);
        window.__sound.analyser = analyser;
        return gain;
      }
    };
  });
  const state = { gone: false, failed: false, cancelled: false, ...options };
  const stops = { s: { id: 's', name: 'Szigetszentmiklós' }, d: { id: 'd', name: 'Dunaharaszti külső' }, r: { id: 'r', name: 'Ráckeve' } };
  const trips = { north: { id: 'north', routeId: 'H6', trainNumber: '123456', tripHeadsign: 'Közvágóhíd' }, south: { id: 'south', routeId: 'H6', trainNumber: '987654', tripHeadsign: 'Ráckeve' } };
  const refs = { stops, trips, routes: { H6: { shortName: 'H6' } } };
  await page.route('https://futar.bkk.hu/**', async route => {
    const url = new URL(route.request().url());
    const south = url.searchParams.get('query') === 'Dunaharaszti külső' || url.searchParams.get('stopId') === 'd';
    if (state.failed && !south) { await route.abort('failed'); return; }
    let entry;
    if (url.pathname.includes('/search.')) entry = { stopIds: [south ? 'd' : 's'] };
    else if (url.pathname.includes('/arrivals-and-departures-for-stop.')) {
      const row = {
        tripId: south ? 'south' : 'north', serviceDate: '2026-10-19',
        departureTime: (base + (state.scheduledOffset ?? 10000)) / 1000,
        ...(state.predictedOffset === undefined ? {} : { predictedDepartureTime: (base + state.predictedOffset) / 1000 }),
        ...(!south && state.cancelled ? { status: 'CANCELED' } : {})
      };
      entry = { stopId: south ? 'd' : 's', stopTimes: (south ? state.south : !state.gone) ? [row] : [] };
    } else {
      const ids = url.searchParams.get('tripId') === 'south' ? ['d', 's', 'r'] : ['r', 's', 'd'];
      entry = { stopTimes: ids.map((stopId, index) => ({ stopId, stopSequence: index, departureTime: (base + index * 60000) / 1000 })) };
    }
    await route.fulfill({ json: { code: 200, status: 'OK', data: { entry, references: refs } } });
  });
  await page.goto(address);
  const cdp = await context.newCDPSession(page);
  // Do not accidentally unlock autoplay while inspecting the untouched page.
  const read = async expression => (await cdp.send('Runtime.evaluate', { expression, userGesture: false, returnByValue: true })).result.value;
  async function waitRead(expression) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (await read(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.fail(`Nem teljesült: ${expression}`);
  }
  await waitRead("document.querySelector('#connection').dataset.state === 'ok'");
  const activate = async () => { await page.locator('h1').click(); await waitRead("window.__sound.contexts[0].state === 'running'"); };
  const starts = () => read('window.__sound.starts.length');
  const handled = () => read("JSON.parse(sessionStorage.getItem('dunahid-handled-v1') || '[]').length");
  return { page, state, read, waitRead, activate, starts, handled, base };
}

test('valódi AudioContext: pontos indulás +30 mp, automatikus leállás 20 mp után', async t => {
  const { page, activate, starts, read, base } = await setup(t);
  await activate();
  await page.clock.runFor(39750);
  assert.equal(await starts(), 0);
  await page.clock.runFor(250);
  assert.equal(await starts(), 1);
  assert.equal(await read('window.__sound.starts[0].at'), base + 40000);
  assert.equal(await read('window.__sound.starts[0].state'), 'running');
  await page.clock.runFor(20000);
  assert.equal(await page.locator('#alarm-banner.ringing').count(), 0);
  assert.equal(await read('window.__sound.disconnected'), 1);
  await page.clock.runFor(10000);
  assert.equal(await starts(), 1);
});
test('felfüggesztett hang: esedékességkor nincs hamis nyugtázás, folytatáskor csenget', async t => {
  const { page, activate, starts, handled, waitRead, read } = await setup(t);
  await activate();
  await page.clock.runFor(35000);
  await page.evaluate(() => window.__sound.contexts[0].suspend());
  await waitRead("window.__sound.contexts[0].state === 'suspended'");
  await page.clock.runFor(5500);
  assert.equal(await handled(), 0);
  await page.keyboard.press('a');
  await waitRead("window.__sound.contexts[0].state === 'running'");
  await page.clock.runFor(250);
  assert.equal(await starts(), 1);
  assert.equal(await handled(), 1);
  assert.equal(await read('window.__sound.contexts.length'), 1);
});
test('a csengetés ténylegesen hangmintákat állít elő, kézi leállításkor elnémul', async t => {
  const { page, activate, waitRead } = await setup(t);
  await activate();
  await page.clock.runFor(40000);
  const peak = `(() => {
    const samples = new Float32Array(1024);
    window.__sound.analyser.getFloatTimeDomainData(samples);
    return Math.max(...samples.map(Math.abs));
  })()`;
  await waitRead(`${peak} > 0.005`);
  await page.locator('#stop-alarm').click();
  await waitRead(`${peak} === 0`);
});
test('háttérlapot utánzó 12 mp időzítőcsúszás mellett sem vész el a jelzés', async t => {
  const { page, activate, starts } = await setup(t);
  await activate();
  await page.clock.runFor(25000);
  await page.clock.fastForward(27000);
  assert.equal(await starts(), 1);
});
test('listából eltűnő késő vonat megtartja az indulás előtti élő adatát a jelzésig', async t => {
  const { page, state, activate, starts } = await setup(t, { scheduledOffset: -180000, predictedOffset: 20000 });
  await activate();
  state.gone = true;
  await page.clock.runFor(49750);
  assert.equal(await starts(), 0);
  await page.clock.runFor(250);
  assert.equal(await starts(), 1);
});
test('átmeneti hangindítási hiba után újrapróbál, csak a sikeres indítást menti', async t => {
  const { page, activate, starts, handled } = await setup(t);
  await activate();
  await page.evaluate(() => { window.__sound.failNext = true; });
  await page.clock.runFor(40000);
  assert.equal(await starts(), 0);
  assert.equal(await handled(), 0);
  await page.clock.runFor(250);
  assert.equal(await starts(), 1);
  assert.equal(await handled(), 1);
});
test('a próbacsengés nem nyeli el a közben esedékessé váló vonatjelzést', async t => {
  const { page, activate, starts, handled } = await setup(t);
  await activate();
  await page.clock.runFor(35000);
  await page.locator('#test-alarm').click();
  await page.clock.runFor(5000);
  assert.equal(await starts(), 2);
  assert.equal(await page.locator('#alarm-title').textContent(), 'Vonat elindult');
  assert.equal(await handled(), 1);
  await page.locator('#stop-alarm').click();
  assert.equal(await page.locator('#alarm-banner.ringing').count(), 0);
  await page.clock.runFor(30000);
  assert.equal(await starts(), 2);
});
test('kapcsolatszakadáskor a letöltött menetrend szerint csenget', async t => {
  const { page, state, activate, starts } = await setup(t);
  await activate();
  state.failed = true;
  await page.clock.runFor(40000);
  assert.equal(await starts(), 1);
});
test('törölt és Dunaharaszti külsőről délre induló vonat nem csenget', async t => {
  const { page, state, activate, starts } = await setup(t, { south: true });
  await activate();
  state.cancelled = true;
  await page.locator('#refresh').click();
  await page.waitForFunction(() => !document.querySelector('#refresh').disabled);
  await page.clock.runFor(40000);
  assert.equal(await starts(), 0);
});
test('letiltott automatikus hang mellett nincs visszamenőleges csengetés az első kattintásra', async t => {
  const { page, read, starts, activate } = await setup(t);
  assert.equal(await read('navigator.userActivation.hasBeenActive'), false);
  assert.equal(await read('window.__sound.contexts[0].state'), 'suspended');
  await page.clock.runFor(45000);
  assert.equal(await starts(), 0);
  await activate();
  await page.clock.runFor(1000);
  assert.equal(await starts(), 0);
});
test('újratöltés és az oldal elhagyása nem duplázza meg a jelzést, nem hagy hangot futni', async t => {
  const { page, activate, starts, handled, read } = await setup(t);
  await activate();
  await page.clock.runFor(40000);
  assert.equal(await handled(), 1);
  await page.reload();
  await activate();
  await page.clock.runFor(1000);
  assert.equal(await starts(), 0);
  await page.locator('#test-alarm').click();
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide')));
  await page.waitForFunction(() => window.__sound.contexts[0].state === 'closed');
  assert.equal(await read('window.__sound.disconnected'), 1);
});
