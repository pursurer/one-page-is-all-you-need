// "Pick candidates": turn raw source data into a short list of candidates for the editor agent.
// Plain rules do the filtering; the agent only judges what is left.
const ctx = $('Run context').first().json;
const checked = $('Check sources and use cache').first().json;
const watch = $('My watchlist').first().json;
const yesterday = $("Load yesterday's edition").first().json;

// News already shown yesterday is not new today.
const seen = new Set();
if (yesterday && yesterday.edition) {
  try {
    for (const a of (JSON.parse(yesterday.edition).ai || {}).watch || []) seen.add(a.url);
  } catch (e) { /* ignore a broken old row */ }
}

const keywordRe = new RegExp('(' + watch.newsKeywords.join('|') + ')', 'i');
const aihot = checked.data.aihot || { hot: [], items: [], codex: null };
const news = [];
const byUrl = new Set();
for (const h of aihot.hot) {
  const url = h.links && h.links.aihot;
  if (!keywordRe.test(h.title) || byUrl.has(url)) continue;
  byUrl.add(url);
  // Two heat scales: the hot list counts participants, the 24-hour list has an editor score. "list" says which.
  news.push({ title: h.title, url, list: 'hot', heat: h.participantCount || h.sourceCount || 0, hotRank: h.rank, isNew: !seen.has(url) });
}
for (const i of aihot.items) {
  if (!keywordRe.test(i.title + ' ' + i.summary) || byUrl.has(i.url)) continue;
  byUrl.add(i.url);
  news.push({ title: i.title, url: i.url, list: '24h', heat: i.score || 0, summary: i.summary, isNew: !seen.has(i.url) });
}
const quietKeywords = watch.newsKeywords.filter((k) => !news.some((n) => new RegExp(k, 'i').test(n.title + ' ' + (n.summary || ''))));

// The 7-day low (the user's rule, 11-01: every price is compared with the lowest price of the week before).
// It is the lowest logged price of the 7 calendar days before today, by Paris date; today never counts.
const weekAgo = DateTime.fromISO(ctx.date).minus({ days: 7 }).toISODate();
const priceLog = $('Load price log').all().map((i) => i.json).filter((r) => r.day >= weekAgo && r.day < ctx.date);
const logged = (item) => priceLog.filter((r) => r.item === item).sort((a, b) => (a.day < b.day ? -1 : 1)).map((r) => r.price);
const vsLow = (price, low) => {
  if (price == null || low == null) return null;
  const pct = Math.round((Math.abs(price - low) / low) * 1000) / 10;
  return price === low ? 'equal to the low' : pct + (price < low ? ' % below the low' : ' % above the low');
};

// Deals: the cheapest matching item per watchlist entry.
const parsePrice = (t) => {
  if (!t) return null;
  const n = Number(String(t).replace(/[^0-9,.]/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const deals = [];
const noDeal = [];
// The watchlist's offers come from Dealabs and Google Shopping. An offer counts when its title matches every "must"
// pattern and no "exclude" pattern, it is new (not used or refurbished), and its price is not under minPrice.
// Accessories and refurbished items match product names too; dealExclude leaves them out for every item.
const excludeRe = new RegExp(watch.dealExclude || '^$', 'i');
// Club or subscription prices (for example "[Club+/Infinity]") are not open to everyone.
const memberRe = new RegExp(watch.memberOnly || '^$', 'i');
const shop = (checked.data.shopping || {}).products || {};
for (const w of watch.deals) {
  const must = (w.must || [w.pattern]).map((x) => new RegExp(x, 'i'));
  const own = new RegExp(w.exclude || '^$', 'i');
  const colour = w.colour ? { want: new RegExp(w.colour.want, 'i'), other: new RegExp(w.colour.other, 'i') } : null;
  const fits = (o) => o.price != null && o.price >= (w.minPrice || 0) && !o.used && must.every((re) => re.test(o.title)) &&
    !own.test(o.title) && !excludeRe.test(o.title) && !(colour && colour.other.test(o.title));
  const offers = (checked.data.deals || [])
    .map((d) => ({ title: d.title, merchant: d.merchant, price: parsePrice(d.priceText), link: d.link, from: 'Dealabs' }))
    .concat((shop[w.label] || []).map((r) => ({ ...r, from: 'Google Shopping' })))
    .filter(fits)
    .sort((a, b) => a.price - b.price);
  if (!offers.length) { noDeal.push(w.label); continue; }
  const best = offers[0];
  const memberOnly = memberRe.test(best.title);
  // Only prices open to everyone are logged and count for the low; a member price can still be shown.
  const open = offers.find((m) => !memberRe.test(m.title));
  const before = logged(w.label);
  const low7 = before.length ? Math.min(...before) : null;
  deals.push({ label: w.label, title: best.title, merchant: best.merchant, price: best.price,
    // "from" is where today's lowest public price was found; listPrice is the official price.
    from: (open || best).from, listPrice: w.listPrice || null, target: w.target, underTarget: best.price < w.target, memberOnly,
    publicPrice: open ? open.price : null, publicMerchant: open ? open.merchant : null,
    // A member price is not compared with the low (the low has only public prices); the public price is.
    low7, lowDays: before.length, vsLow7: vsLow(memberOnly ? (open ? open.price : null) : best.price, low7),
    // A title without a colour, or without men's or women's, is kept and marked, never guessed.
    note: [colour && !colour.want.test(best.title) ? 'colour not stated' : null,
      w.gender && !new RegExp(w.gender, 'i').test(best.title) ? "men's or women's not stated" : null].filter(Boolean).join('; ') || null,
    link: best.link });
}

// Codex quota, from AIHOT's reset monitor.
const codexEvents = (aihot.codex && aihot.codex.events) || [];
// The label in brackets is left out when the title already says it ("… 重置卡 (重置卡发放)").
const codexLabel = codexEvents.length ? String(codexEvents[0].displayLabel || codexEvents[0].label || codexEvents[0].status || '') : '';
const codexSame = codexLabel && (codexEvents[0].title.includes(codexLabel) || codexEvents[0].title.includes(codexLabel.slice(0, 3)));
const codex = codexEvents.length
  ? codexEvents[0].title + (codexLabel && !codexSame ? ' (' + codexLabel + ')' : '') + ', ' + String(codexEvents[0].createdAt || '').slice(0, 10) + '.'
  : 'No Codex reset in the last days.';

// Classes: today's list for the page; later days stay in the timetable table for lookup_courses.
const classes = checked.data.zeus;
let courses = null;
if (classes) {
  const later = classes.find((c) => c.day > ctx.date);
  const when = later && DateTime.fromISO(later.start).setZone('Europe/Paris').setLocale('en');
  courses = {
    today: classes.filter((c) => c.day === ctx.date).map((c) => ({ time: c.time, title: c.title, where: c.where })),
    next: later ? when.toFormat(when.diff($now.setZone('Europe/Paris').startOf('day'), 'days').days < 6 ? 'cccc' : 'ccc d LLL') + ', ' + later.time.slice(0, 5) + ': ' + later.title : null,
  };
}

// Mail: newsletters and promotions are only counted. The agent sees sender, subject and a short snippet of the rest.
const mails = checked.data.gmail;
// Mails with a one-time code are never sent to the agent; the page only counts them.
const mail = mails ? mails.filter((m) => !m.bulk && !m.code).slice(0, 20).map(({ id, from, subject, snippet, isNew }) => ({ id, from, subject, snippet, isNew })) : null;
const hiddenMail = mails ? mails.filter((m) => m.bulk && !m.code).length : 0;
const codesHidden = mails ? mails.filter((m) => m.code).length : 0;

// Portfolio: the agent gets codes and percentages only (daily change, weight). Never quantities or amounts.
// The 1-month high and low: the highest and lowest close of the 21 trading days before the last close
// (closes 9 to 29 of 30; the last day is not in it). The page computes the same text from "closes".
const pct1 = (x) => (Math.round(x * 1000) / 10).toFixed(1);
function month(closes) {
  const last = closes[closes.length - 1];
  const before = closes.slice(Math.max(0, closes.length - 22), closes.length - 1);
  if (!before.length) return { high1m: null, low1m: null, vs1m: null };
  const high = Math.max(...before);
  const low = Math.min(...before);
  const vs1m = last < low ? pct1((low - last) / low) + ' % under 1-month low'
    : last > high ? pct1((last - high) / high) + ' % over 1-month high'
    // Inside the range: say which end is nearer.
    : (last - low) / low <= (high - last) / high ? pct1((last - low) / low) + ' % above 1-month low'
    : pct1((high - last) / high) + ' % below 1-month high';
  return { high1m: high, low1m: low, vs1m };
}
const held = checked.data.market;
const market = held ? {
  codesFrom: 'watchlist',
  codesAre: 'a watchlist, not holdings',
  lastClose: held.lastClose ? held.lastClose + ' (' + DateTime.fromISO(held.lastClose).setLocale('en').toFormat('cccc') + ')' : null,
  codes: held.holdings.map((h) => ({ symbol: h.symbol, name: h.name || undefined, changePct: h.pct,
    bigMove: Math.abs(h.pct) >= watch.marketThreshold, ...month(h.closes) })),
  notAvailable: (held.missing || []).map((m) => m.symbol + ': ' + m.reason),
} : null;

// Travel: Christmas round-trip fares. low7 is the lowest fare of the 7 days before today:
// Google's own history first, and our price log when Google gives none (CDG-HND).
const trip = checked.data.travel;
const travel = trip ? trip.routes.map((r) => {
  const h = r.history || [];
  // A copy searched before this change (11-01) stored plain fares ending with today; drop that last fare.
  const google = typeof h[0] === 'number' ? h.slice(0, -1).slice(-7) : h.filter((x) => x.day >= weekAgo && x.day < ctx.date).map((x) => x.price);
  const item = 'Flight CDG-' + r.code;
  const before = google.length ? google : logged(item);
  const low7 = before.length ? Math.min(...before) : null;
  return { city: r.city, code: r.code, fare: r.fare, low7, lowDays: before.length,
    lowFrom: google.length ? 'google' : before.length ? 'log' : null, vsLow7: vsLow(r.fare, low7), before,
    typicalRange: r.typical, hotelPerNight: ((trip.hotels || {})[r.code] || {}).perNight || null, priceLogItem: item };
}) : null;

const notConnected = checked.sources.filter((s) => s.status === 'off').map((s) => s.short);
const stale = checked.sources.filter((s) => s.status === 'stale').map((s) => s.short + ' (' + s.code + ')');

// "before" (the fares behind low7) is for the page's curve; the agent gets low7 and vsLow7 instead.
const candidates = { date: ctx.date, weekday: $now.setZone('Europe/Paris').setLocale('en').toFormat('cccc'), courses, mail, news: news.slice(0, 12), deals, market,
  travel: travel && travel.map(({ before, ...r }) => r), codex, notConnected, stale };
// The prompt is written by "Prepare agent input", after the Chinese and French texts are translated.
return [{ json: { candidates, courses, mail, hiddenMail, codesHidden, travel, quietKeywords, noDeal, codex } }];
