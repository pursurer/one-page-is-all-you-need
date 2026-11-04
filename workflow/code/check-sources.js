// Decide, per source, whether today's data is usable. A failed source falls back to the
// last good copy in source_cache and is marked "stale". Nothing here calls the model.
const ctx = $('Run context').first().json;
const watch = $('My watchlist').first().json;
const cache = {};
for (const item of $('Load source cache').all()) {
  if (item.json.source) cache[item.json.source] = item.json;
}
const cached = (key) => (cache[key] ? JSON.parse(cache[key].payload) : null);
const log = [];
const updates = [];

// A node exists only once its source is connected, so check before reading it.
const ran = (n) => { try { return $(n).isExecuted; } catch (e) { return false; } };

// An HTTP or RSS node set to "continue" returns { error } instead of data.
function failure(nodeName) {
  if (!ran(nodeName)) return null;
  const items = $(nodeName).all();
  if (!items.length) return 'no response';
  const e = items[0].json.error;
  if (!e) return null;
  const text = typeof e === 'string' ? e : (e.message || e.description || JSON.stringify(e));
  const code = (e.httpCode || (String(text).match(/[1-5][0-9][0-9]/) || [])[0]);
  return code ? 'HTTP ' + code : String(text).slice(0, 60);
}

function source(key, nodes, read, meta) {
  let failed = nodes.map(failure).filter(Boolean);
  let payload = null;
  if (!failed.length) {
    try { payload = read(); } catch (e) { failed = [String(e.message || e).slice(0, 60)]; }
  }
  if (!failed.length) {
    updates.push({ source: key, fetched_at: ctx.startedAt, payload: JSON.stringify(payload) });
    log.push({ t: ctx.time, msg: meta.short + ': OK' });
    return { payload, status: { ...meta, status: 'ok', detail: meta.describe(payload), code: null, note: null, cachedAt: null, fetched: ctx.time } };
  }
  const code = failed[0];
  log.push({ t: ctx.time, msg: meta.short + ': ' + code + ' after one retry, cache used', bad: true });
  const old = cache[key];
  return {
    payload: old ? JSON.parse(old.payload) : null,
    status: {
      ...meta,
      status: 'stale',
      detail: old ? meta.describe(JSON.parse(old.payload)) : 'No data',
      code,
      note: meta.short + ' returned ' + code + ' twice. ' + (old ? 'Showing the copy from ' + old.fetched_at.slice(0, 16).replace('T', ' ') + '.' : 'No cached copy yet.') + ' The next run retries automatically.',
      cachedAt: old ? old.fetched_at : null,
      fetched: ctx.time,
    },
  };
}

// Zeus runs only when the private config table has a link. Classes for the next 14 days, Paris time.
// A revoked link answers with an error or a login page; both count as a failure here.
const zeus = ran('Zeus · timetable (ICS)') ? source(
  'zeus',
  ['Zeus · timetable (ICS)', 'Read Zeus events'],
  () => {
    const from = $now.setZone('Europe/Paris').startOf('day');
    const until = from.plus({ days: 14 });
    const at = (d) => DateTime.fromISO(new Date(d).toISOString()).setZone('Europe/Paris');
    return (($('Read Zeus events').first().json.data || {}).events || [])
      // Zeus also lists holidays ("Vacances", "Bank Holiday") as events; they are not classes.
      .filter((e) => e.start && !/vacances|holiday|férié/i.test(e.summary || ''))
      .filter((e) => at(e.start.date) >= from && at(e.start.date) < until)
      .sort((a, b) => at(a.start.date) - at(b.start.date))
      .map((e) => {
        const start = at(e.start.date);
        const end = e.end ? at(e.end.date) : start;
        const group = (String(e.description || '').match(/group[es]*\s*:\s*([^\n]+)/i) || [])[1] || null;
        return { start: start.toISO(), day: start.toFormat('yyyy-MM-dd'), time: start.toFormat('HH:mm') + '–' + end.toFormat('HH:mm'),
          title: e.summary || 'Untitled class', where: [e.location, group].filter(Boolean).join(', ') || 'Room not listed' };
      });
  },
  { key: 'zeus', short: 'Zeus', name: 'Zeus timetable (ICS link)', url: 'https://zeus.ionis-it.com',
    describe: (p) => p.length + ' classes in the next 14 days' },
) : null;

// Gmail, read only: sender, subject and a short snippet. Newsletters and promotions are only counted.
// A mail is new when the previous run did not see its ID (the run before is normally yesterday's 08:00).
const BULK = ['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_FORUMS'];
// A one-time code (verification, 2FA, login) is a credential: the page is shown on a projector and the mail would also
// go to the model and the cache. Such a mail is only counted; its snippet is dropped and its digits become "••••".
// The rule is broad on purpose: a false match only hides one mail.
const CODE_WORDS = /ne pas partager|code de v[ée]rification|verification code|your code|votre code|one[- ]time|\botp\b|\b2fa\b|code de connexion|login code|security code|code de s[ée]curit[ée]|passcode/i;
const CODE_DIGITS = /\b\d{4,8}\b|\b\d{3}[ -]\d{3}\b/;
const NOREPLY = /no-?reply|ne-?pas-?r[ée]pondre|do-?not-?reply/i;
const withoutCode = (m) => {
  const text = m.subject + ' ' + (m.snippet || '');
  // Without a code word, a no-reply sender with digits in the subject counts too; a year such as 2026 does not.
  const digitsNoYear = CODE_DIGITS.test(String(m.subject).replace(/\b(19|20)\d\d\b/g, ''));
  if (!m.code && !((CODE_WORDS.test(text) && CODE_DIGITS.test(text)) || (digitsNoYear && NOREPLY.test(m.sender || m.from)))) return m;
  return { ...m, code: true, subject: String(m.subject).replace(/\d+/g, '••••'), snippet: '' };
};
const gmail = ran('Gmail · list last 24h') ? source(
  'gmail',
  ['Gmail · list last 24h', 'Gmail · read headers'],
  () => {
    const seen = new Set((cached('gmail') || []).map((m) => m.id));
    const read = ran('Gmail · read headers') ? $('Gmail · read headers').all() : [];
    return read.filter((i) => i.json.id).map((i) => {
      const h = {};
      for (const x of ((i.json.payload || {}).headers || [])) h[String(x.name).toLowerCase()] = x.value;
      const sender = String(h.from || '');
      const m = withoutCode({ id: i.json.id, sender, from: sender.replace(/\s*<[^>]*>\s*$/, '').replace(/^"(.*)"$/, '$1') || sender,
        subject: h.subject || '(no subject)', snippet: String(i.json.snippet || '').slice(0, 200),
        bulk: (i.json.labelIds || []).some((l) => BULK.includes(l)), isNew: !seen.has(i.json.id) });
      delete m.sender; // the address was only needed to spot a no-reply sender
      return m;
    });
  },
  { key: 'gmail', short: 'Gmail', name: 'Gmail, last 24 hours (read only)', url: 'https://mail.google.com',
    describe: (p) => p.length + ' mails in 24 hours, ' + p.filter((m) => m.isNew).length + ' new since the last run' },
) : null;
// A copy cached before 11-01 may still hold a code: clean it the same way before anything uses it.
if (gmail && gmail.payload) gmail.payload = gmail.payload.map(withoutCode);

// Market: the 8 watchlist codes with Twelve Data's daily candles (the user's choice, 11-01). The IBKR account is
// still read, but only its number of positions is kept, and it is not shown. A code without candles is listed in
// "missing" with the reason; the others are shown as usual. Only when every code fails is the board stale.
const tdReason = (c) => (c.error ? 'HTTP ' + (c.error.httpCode || (String(c.error.message || '').match(/[1-5][0-9][0-9]/) || [])[0] || '?')
  // Twelve Data writes its messages in Markdown ("**symbol** not found"); the page shows plain text.
  : c.status === 'error' ? 'Twelve Data ' + (c.code || 'error') + ': ' + String(c.message || '').replace(/\*/g, '').slice(0, 60) : 'no candles');
const ibkrText = (b) => (!b ? '' : !b.connected ? 'IBKR not connected'
  : b.error ? 'IBKR account: error ' + b.error : 'IBKR account: ' + b.positions + (b.positions === 1 ? ' position' : ' positions') + ', not shown');
const market = ran('Twelve Data · daily candles') ? source(
  'market',
  [],
  () => {
    const codes = $('Watchlist codes (IBKR counted)').all().map((i) => i.json);
    const candles = $('Twelve Data · daily candles').all().map((i) => i.json);
    const missing = [];
    let lastClose = null;
    const holdings = codes.map((p, k) => {
      const c = candles[k] || {};
      const values = (c.values || []).slice().reverse();
      if (!values.length) {
        missing.push({ symbol: p.symbol, reason: tdReason(c) });
        return null;
      }
      const closes = values.map((v) => Number(v.close));
      const last = closes[closes.length - 1];
      const prev = closes[closes.length - 2] || last;
      // Candles are daily closes: on a weekend or a holiday the newest one is from the last trading day.
      const day = String(values[values.length - 1].datetime).slice(0, 10);
      if (!lastClose || day > lastClose) lastClose = day;
      return { symbol: p.symbol, name: p.name || null, weightPct: null, pct: Math.round(((last - prev) / prev) * 1000) / 10, closes,
        ohlc: values.map((v) => ({ o: Number(v.open), h: Number(v.high), l: Number(v.low), c: Number(v.close) })) };
    }).filter(Boolean);
    if (!holdings.length) throw new Error((missing[0] || {}).reason || 'Twelve Data returned no candles');
    return { holdings, missing, codesFrom: 'watchlist', lastClose, ibkr: (codes[0] || {}).ibkr || null };
  },
  { key: 'market', short: 'Twelve Data (watchlist)', name: 'Twelve Data daily candles for the watchlist codes; IBKR Flex account read, positions not shown',
    url: 'https://twelvedata.com',
    describe: (p) => {
      const miss = p.missing || [];
      const n = p.holdings.length + miss.length;
      return (miss.length ? p.holdings.length + ' of ' + n : n) + (n === 1 ? ' watchlist code, ' : ' watchlist codes, ') +
        ((p.holdings[0] || {}).closes || []).length + ' days each' + (miss.length ? ' (' + miss.map((m) => m.symbol + ': ' + m.reason).join(', ') + ')' : '') +
        (p.ibkr ? '; ' + ibkrText(p.ibkr) : '');
    } },
) : null;
// A copy cached before 11-01 may hold the IBKR position; only watchlist codes are ever shown.
if (market && market.payload && market.payload.codesFrom !== 'watchlist') {
  market.payload = { ...market.payload, codesFrom: 'watchlist', holdings: market.payload.holdings.filter((h) => watch.marketSymbols.includes(h.symbol)) };
}
if (market && market.payload && (market.payload.missing || []).length) {
  log.push({ t: ctx.time, msg: 'Twelve Data: no candles for ' + market.payload.missing.map((m) => m.symbol + ' (' + m.reason + ')').join(', ') + '; the other codes are shown', bad: true });
}

// Travel: flights are searched at most once a day; a rebuild later the same day reuses the morning search.
// Hotels are searched once a week per city, 3 stars or more and rated 4.0 or more (hostel beds do not count).
let travel = null;
const travelMeta = { key: 'travel', short: 'SerpApi', name: 'SerpApi Google Flights and Hotels', url: 'https://serpapi.com',
  describe: (p) => p.routes.length + ' routes, ' + p.dates };
const month = ctx.date.slice(0, 7);
const weekAgo = DateTime.fromISO(ctx.date).minus({ days: 7 }).toISODate();
function withHotels(old) {
  const filter = watch.travel.hotelFilter;
  const tag = filter.tag;
  const hostel = /hostel|hostal|dorm|capsule|backpack|bunk|publove|meininger|generator|wombat|\bpod\b/i;
  const hotels = { ...(old.hotels || {}) };
  if (ran('SerpApi · hotels')) {
    const due = $('Hotels due this week').all();
    $('SerpApi · hotels').all().forEach((h, k) => {
      const ok = (x) => (x.type || 'hotel') === 'hotel' && (x.extracted_hotel_class || 0) >= filter.minClass &&
        (x.overall_rating || 0) >= filter.minRating && !hostel.test(x.name || '');
      const rates = (h.json.properties || []).filter(ok).map((x) => (x.rate_per_night || {}).extracted_lowest).filter((n) => n > 0).sort((a, b) => a - b);
      const code = (due[k] || { json: {} }).json.code;
      // The median nightly rate after taxes: a typical hotel, not the one cheapest room.
      if (code) hotels[code] = { perNight: rates.length ? rates[Math.floor(rates.length / 2)] : null, searchedOn: ctx.date, filter: tag };
    });
  }
  // The month's count is read before this run's searches (SerpApi's counter lags a few seconds), then this run's searches are added.
  const made = ['SerpApi · flights', 'SerpApi · shopping', 'SerpApi · hotels'].reduce((n, x) => n + (ran(x) ? $(x).all().length : 0), 0);
  const reported = ran('SerpApi · this month') ? $('SerpApi · this month').first().json : {};
  const before = reported.this_month_usage != null ? reported.this_month_usage : (old.usage && old.usage.month === month ? old.usage.used : 0);
  const of = reported.searches_per_month || (old.usage || {}).of || 250;
  return { hotels, usage: { used: before + made, of, month } };
}
const plan = ran('SerpApi plan') ? $('SerpApi plan').first().json : null;
if (plan && plan.note) log.push({ t: ctx.time, msg: plan.note });
if (ran('Load travel cache') && !ran('SerpApi · flights')) {
  const p = cached('travel');
  // Not searched today means the quota guard skipped the flights: the last search is shown and marked stale.
  const today = p && cache.travel.fetched_at.slice(0, 10) === ctx.date;
  if (p) {
    const payload = { ...p, ...withHotels(p) };
    if (ran('SerpApi · hotels')) updates.push({ source: 'travel', fetched_at: cache.travel.fetched_at, payload: JSON.stringify(payload) });
    travel = { payload, status: { ...travelMeta, status: today ? 'ok' : 'stale', detail: travelMeta.describe(payload), code: null,
      note: today ? 'Flights searched at ' + cache.travel.fetched_at.slice(11, 16) + ' today; a rebuild reuses them to save SerpApi searches.'
        : 'Flights not searched today: the SerpApi quota guard kept ' + plan.margin + ' searches for later. Showing the search from ' +
          cache.travel.fetched_at.slice(0, 16).replace('T', ' ') + '.',
      cachedAt: cache.travel.fetched_at, fetched: cache.travel.fetched_at.slice(11, 19) } };
  }
  log.push({ t: ctx.time, msg: 'SerpApi: ' + (today ? 'flights already searched today, cache reused' : 'flights skipped, last search reused') +
    (ran('SerpApi · hotels') ? '; hotels searched' : '') });
} else if (ran('SerpApi · flights')) {
  travel = source('travel', ['SerpApi · flights'], () => {
    const routes = $('Routes to search').all().map((i) => i.json);
    const flights = $('SerpApi · flights').all().map((i) => i.json);
    const old = cached('travel') || {};
    return {
      dates: 'Round trip from Paris ' + watch.travel.origin + ', ' + [watch.travel.out, watch.travel.back]
        .map((d) => DateTime.fromISO(d).setLocale('en').toFormat('d LLL yyyy')).join(' to '),
      routes: routes.map((r, k) => {
        const f = flights[k] || {};
        const prices = [].concat(f.best_flights || [], f.other_flights || []).map((x) => x.price).filter((n) => n > 0);
        const insights = f.price_insights || {};
        // Google's price_history is one fare per Paris day and ends with today (execution 308: the last point is
        // 11-01 00:00 Paris and equals today's fare). Keep the 7 calendar days before today, with their dates.
        const history = (insights.price_history || []).filter((x) => x[1] > 0)
          .map(([t, price]) => ({ day: DateTime.fromSeconds(t).setZone('Europe/Paris').toISODate(), price }))
          .filter((x) => x.day >= weekAgo && x.day < ctx.date);
        return { city: r.city, code: r.code, fare: prices.length ? Math.min(...prices) : null, history,
          typical: insights.typical_price_range || null };
      }),
      ...withHotels(old),
    };
  }, travelMeta);
}

const aihot = source(
  'aihot',
  ['AIHOT · hot topics', 'AIHOT · last 24h', 'AIHOT · Codex resets'],
  () => ({
    hot: $('AIHOT · hot topics').first().json.items || [],
    items: ($('AIHOT · last 24h').first().json.items || []).map((i) => ({
      id: i.id, title: i.title, summary: (i.summary || '').slice(0, 280), url: i.links && i.links.aihot,
      category: i.category, score: i.score, publishedAt: i.publishedAt,
    })),
    codex: $('AIHOT · Codex resets').first().json,
  }),
  { key: 'aihot', short: 'AIHOT', name: 'AIHOT public API', url: 'https://aihot.news/hot',
    describe: (p) => (p.hot || []).length + ' hot topics, ' + (p.items || []).length + ' items in 24 hours' },
);

const FEEDS = { 'Dealabs · Apple': 'apple', 'Dealabs · sportswear': 'vetements-de-sport', 'Dealabs · fashion': 'mode', 'Dealabs · hiking': 'randonnee' };
const deals = source(
  'deals',
  Object.keys(FEEDS),
  () => Object.entries(FEEDS).flatMap(([node, feed]) => $(node).all().map((i) => {
    const m = (i.json['pepper:merchant'] || {}).$ || {};
    return { feed, title: i.json.title, link: i.json.link, merchant: m.name || null, priceText: m.price || null, isoDate: i.json.isoDate };
  })),
  // Prices also come from Google Shopping when SerpApi is connected, so the source names both.
  { key: 'deals', short: ran('Load shopping cache') ? 'Dealabs + Google Shopping' : 'Dealabs',
    name: ran('Load shopping cache') ? 'Dealabs RSS (4 feeds) and SerpApi Google Shopping (FR)' : 'Dealabs RSS: apple, fashion, sportswear, hiking',
    url: 'https://www.dealabs.com/groupe/apple',
    describe: (p) => p.length + ' items from 4 feeds' },
);

// Google Shopping is part of the Deals source: 2 searches a day, reused by a rebuild the same day.
// If it fails or is skipped, Dealabs is shown as usual and the Deals detail says so.
let shopping = null;
let shopNote = null;
if (ran('SerpApi · shopping')) {
  const asked = $('Products to search').all().map((i) => i.json);
  const got = $('SerpApi · shopping').all().map((i) => i.json);
  const products = {};
  const failed = [];
  asked.forEach((a, k) => {
    const g = got[k] || {};
    if (!Array.isArray(g.shopping_results)) {
      const e = g.error || 'no results';
      failed.push(typeof e === 'string' ? e.slice(0, 40) : 'HTTP ' + (e.httpCode || (String(e.message || '').match(/[1-5][0-9][0-9]/) || [])[0] || '?'));
      return;
    }
    products[a.label] = g.shopping_results.filter((r) => r.extracted_price > 0).map((r) => ({ title: r.title, price: r.extracted_price,
      merchant: r.source || null, used: r.second_hand_condition || null, link: r.product_link || null }));
  });
  if (Object.keys(products).length) {
    shopping = { date: ctx.date, products };
    updates.push({ source: 'shopping', fetched_at: ctx.startedAt, payload: JSON.stringify(shopping) });
  }
  shopNote = 'Google Shopping: ' + (Object.keys(products).length + ' of ' + asked.length + ' searches') +
    (failed.length ? ' (' + failed[0] + (shopping ? ')' : '), Dealabs only') : '');
  log.push({ t: ctx.time, msg: shopNote, ...(failed.length ? { bad: true } : {}) });
} else if (cache.shopping && cache.shopping.fetched_at.slice(0, 10) === ctx.date) {
  shopping = cached('shopping');
  shopNote = 'Google Shopping searched at ' + cache.shopping.fetched_at.slice(11, 16) + ' today, reused';
} else if (plan && plan.due && plan.due.shopping) {
  shopNote = 'Google Shopping skipped by the quota guard, Dealabs only';
}
if (shopNote && deals.status.status === 'ok') deals.status.detail += ' · ' + shopNote;

// Sources that are planned but not connected yet. The page shows them as "not connected".
const off = (key, short, name) => ({ key, short, name, status: 'off', detail: 'Not connected yet', code: null, note: 'Not connected yet.', cachedAt: null, fetched: null, url: null });
for (const x of [aihot, deals, zeus, gmail, market, travel].filter(Boolean)) delete x.status.describe;
const sources = [
  zeus ? zeus.status : off('zeus', 'Zeus', 'Zeus timetable (ICS link)'),
  gmail ? gmail.status : off('gmail', 'Gmail', 'Gmail, last 24 hours (read only)'),
  market ? market.status : off('market', 'Twelve Data (watchlist)', 'Twelve Data daily candles for the watchlist codes'),
  aihot.status,
  deals.status,
  travel ? travel.status : off('travel', 'SerpApi', 'SerpApi Google Flights and Hotels'),
];

const data = { aihot: aihot.payload, deals: deals.payload, shopping };
for (const [k, v] of Object.entries({ zeus, gmail, market, travel })) data[k] = v ? v.payload : null;
return [{ json: { sources, data, cacheUpdates: updates, log } }];
