// Build the EDITION object the page reads (fields: CONTRACT.md section 3).
const ctx = $('Run context').first().json;
const checked = $('Check sources and use cache').first().json;
const input = $('Prepare agent input').first().json;
const today = $("Load today's edition").first().json;
const agentRun = $('Editor agent').first().json;
const parsed = (agentRun.output && agentRun.output.picks) ? agentRun.output : ((agentRun.output || {}).output || {});

const previous = today && today.edition ? JSON.parse(today.edition) : null;
const version = (today && today.version ? Number(today.version) : 0) + 1;
const how = ctx.reason === 'page-open' ? 'opening the page after a missed 08:00 run'
  : ctx.trigger === 'rebuild' ? 'a manual rebuild' : 'the 08:00 schedule';
const now = $now.setZone('Europe/Paris').setLocale('en');

// The agent names the tool it used for each pick. "call" comes from the tool calls n8n actually ran,
// and a tool the agent names but never called is shown as no tool call.
// format_final_json_response is how n8n's output parser receives the answer, not a check, so it is left out.
const steps = (agentRun.intermediateSteps || [])
  .map((s) => ({ tool: (s.action || {}).tool, args: (s.action || {}).toolInput, used: false }))
  .filter((s) => s.tool !== 'format_final_json_response');
const argText = (a) => (a && typeof a === 'object' ? Object.values(a).filter((v) => typeof v !== 'object').join(' ') : String(a || ''));
const showCall = (s) => s.tool + '(' + JSON.stringify(s.args && typeof s.args === 'object' ? s.args : { input: s.args }) + ')';
const unverified = [];
const guarded = [];
const BLOCK_NAMES = { ai: 'AI news', deals: 'Deals', mail: 'Mail', market: 'Portfolio', travel: 'Travel' };
// The user's rule (11-02): Today's five never comes from Deals (it replaces the 11-01 rule "at most one deal, last").
// The agent does not see the deals, and a deal pick is still dropped here. The Deals block lists every deal as before.
const proposed = parsed.picks || [];
const isDeal = (p) => (p.ref || {}).block === 'deals';
const dealsLeftOut = proposed.filter(isDeal).length;
if (dealsLeftOut) {
  guarded.push('Rule applied: Today\'s five never comes from Deals; ' + dealsLeftOut + ' deal pick' + (dealsLeftOut > 1 ? 's' : '') +
    ' left out (still in the Deals block)');
}
const ordered = proposed.filter((p) => !isDeal(p)).slice(0, 5);
const picks = ordered.map((p) => {
  const claimed = p.tool && p.tool !== 'none' ? p.tool : null;
  const pick = {
    kind: p.kind === 'act' ? 'act' : 'know',
    title: p.title,
    // The page highlights key inside the title, so a key that is not in the title is dropped.
    key: p.key && String(p.title || '').includes(p.key) ? p.key : undefined,
    // Optional fields get defaults, so a short answer from the agent still renders.
    from: Array.isArray(p.from) && p.from.length ? p.from : [BLOCK_NAMES[(p.ref || {}).block]].filter(Boolean),
    ref: p.ref && p.ref.block ? p.ref : undefined,
    tool: claimed,
    input: p.input || p.title,
    why: p.why || p.decision || '',
    call: 'No tool call.',
    result: claimed ? p.result || 'Not stated.' : '—',
    decision: p.decision || p.why || '',
  };
  if (!claimed) return pick;
  // Only a call whose arguments appear in this pick counts (an item label, a keyword or a date).
  // A call of the same tool with other arguments is never borrowed for this pick.
  // A market pick also counts its company name: the agent searches news by name ("Interactive Brokers" for IBKR).
  const holding = ((checked.data.market || {}).holdings || []).find((h) => (p.ref || {}).block === 'market' &&
    h.symbol === String(p.ref.key || '').toUpperCase());
  const text = [p.title, p.input, p.ref && p.ref.key, holding && holding.name].join(' ').toLowerCase();
  const same = steps.filter((s) => s.tool === claimed && !s.used);
  // A call counts when its argument appears in the pick, or the pick's code appears in the argument ("Flight CDG-ZRH" for ZRH).
  const code = String((p.ref && p.ref.key) || '').toLowerCase();
  const match = same.find((s) => argText(s.args) && (text.includes(argText(s.args).toLowerCase()) ||
    (code.length >= 3 && argText(s.args).toLowerCase().includes(code))));
  if (match) {
    match.used = true;
    pick.call = showCall(match);
  } else {
    unverified.push('Editor agent named ' + claimed + ' for "' + p.title + '", but ' +
      (same.length ? 'it was called with other arguments' : 'never called it') + '; shown as no tool call');
    Object.assign(pick, { tool: null, call: 'No tool call.', result: '—' });
  }
  return pick;
});
const toolCalls = steps.length;

const c = input.candidates;
const watch = $('My watchlist').first().json;
// The page finds a pick's row by ref.key, so the key must be the row's exact title or code.
// The agent sometimes writes a short form ("AirPods" for a long Dealabs title); map it to the row.
const norm = (t) => String(t || '').toLowerCase().trim();
for (const pick of picks) {
  const ref = pick.ref;
  if (!ref) continue;
  const k = norm(ref.key);
  if (ref.block === 'ai') {
    const n = c.news.find((x) => norm(x.title) === k || norm(x.url) === k) || c.news.find((x) => k && norm(x.title).includes(k));
    if (n) ref.key = n.title;
  } else if (ref.block === 'mail') {
    const m = (input.mail || []).find((x) => norm(x.subject) === k) || (input.mail || []).find((x) => k && norm(x.subject).includes(k));
    if (m) ref.key = m.subject;
  } else if (ref.block === 'market' || ref.block === 'travel') {
    ref.key = String(ref.key || '').toUpperCase();
  }
}

// Picks the workflow makes itself, from candidates the agent did not pick. They are "know" and have no tool.
const taken = new Set(picks.filter((p) => p.ref).map((p) => p.ref.block + ':' + norm(p.ref.key)));
const codes = ((c.market || {}).codes || []).slice().sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
const freshNews = (c.news || []).filter((n) => !taken.has('ai:' + norm(n.title)));
const made = (x, why) => {
  taken.add(x.block + ':' + norm(x.key));
  return { kind: 'know', title: x.title, key: undefined, from: [x.from], ref: { block: x.block, key: x.key }, tool: null,
    input: x.title, why, call: 'No tool call.', result: '—', decision: why };
};
const newsPick = (n) => ({ block: 'ai', key: n.title, from: 'AI news', title: n.title });
const marketPick = (m) => ({ block: 'market', key: m.symbol, from: 'Portfolio',
  title: m.symbol + ' ' + (m.changePct < 0 ? 'fell ' : 'rose ') + Math.abs(m.changePct) + ' % at the last close' + (m.vs1m ? ', ' + m.vs1m : '') });

// The user's rule (11-02): more AI news in the five, since there is big AI news most days. At least 2 AI news picks
// and at most 2 market picks: the weakest market pick that is not "act" (the smallest move) gives its place,
// in the same position, to the first AI news the agent did not pick.
const count = (block) => picks.filter((p) => (p.ref || {}).block === block).length;
const moveOf = (p) => Math.abs((codes.find((m) => m.symbol === p.ref.key) || {}).changePct || 0);
const swapped = [];
while ((count('ai') < 2 || count('market') > 2) && freshNews.length) {
  const weakest = picks.filter((p) => (p.ref || {}).block === 'market' && p.kind !== 'act').sort((a, b) => moveOf(a) - moveOf(b))[0];
  if (!weakest) break;
  picks[picks.indexOf(weakest)] = made(newsPick(freshNews.shift()),
    'Added by the workflow: Today\'s five has at least 2 AI news, so this took the place of ' + weakest.ref.key + '.');
  swapped.push(weakest.ref.key);
}
if (swapped.length) {
  guarded.push('Rule applied: at least 2 AI news and at most 2 market picks in Today\'s five; ' + swapped.join(', ') +
    (swapped.length > 1 ? ' were' : ' was') + ' replaced by AI news');
}

// Today's five is still five picks (the user's rule, 11-02). When the agent gives fewer, the workflow adds candidates
// it did not pick: the AI news in candidate order first, then the big market moves, then the other codes by size of move.
const added = [];
if (picks.length < 5) {
  const given = picks.length;
  const pool = freshNews.map(newsPick).concat(codes.filter((m) => m.bigMove).map(marketPick))
    .concat(codes.filter((m) => !m.bigMove).map(marketPick));
  for (const x of pool) {
    if (picks.length >= 5) break;
    if (taken.has(x.block + ':' + norm(x.key))) continue;
    picks.push(made(x, 'Added by the workflow: the agent gave ' + given + ' pick' + (given === 1 ? '' : 's') + ' and Today\'s five has 5.'));
    added.push(x.key);
  }
  if (added.length) {
    guarded.push('Rule applied: Today\'s five has 5 picks; the agent gave ' + given + ', so ' + added.length + ' ' +
      (added.length > 1 ? 'were' : 'was') + ' added from the candidates (' + added.join('; ') + ')');
  }
}

// Holdings or watchlist: the agent once called an IBKR holding "on a watchlist". The page data decides the word.
const held = checked.data.market;
if (held) {
  for (const pick of picks) {
    if (!(pick.ref && pick.ref.block === 'market') && !pick.from.includes('Portfolio')) continue;
    const wrong = held.codesFrom === 'ibkr' ? /watch\s?list/i : /\b(your|my)\s+(holdings?|portfolio|positions?|stocks?|shares?)\b/i;
    if (![pick.title, pick.why, pick.decision].some((t) => wrong.test(String(t || '')))) continue;
    const h = held.holdings.find((x) => x.symbol === String((pick.ref || {}).key || '').toUpperCase()) || held.holdings[0];
    const what = held.codesFrom === 'ibkr' ? 'one of your holdings (' + h.weightPct + ' % of the portfolio)' : 'on your watchlist (not a holding)';
    for (const f of ['title', 'why', 'decision']) {
      if (wrong.test(String(pick[f] || ''))) pick[f] = f === 'title' ? h.symbol + ' ' + (h.pct < 0 ? 'fell ' : 'rose ') + Math.abs(h.pct) + ' % at the last close' : h.symbol + ' is ' + what + '.';
    }
    guarded.push('Rule applied: ' + h.symbol + ' comes from ' + (held.codesFrom === 'ibkr' ? 'IBKR, so it is called a holding' : 'the watchlist, so it is not called a holding'));
  }
}

// A low from fewer than 7 days is an "N-day low" (the agent wrote "7-day low" for a 6-day low in execution 369).
const sevenDay = /\b(?:7|seven)[- ]day low\b/i;
for (const pick of picks) {
  const ref = pick.ref || {};
  const row = ref.block === 'travel' ? (input.travel || []).find((r) => r.code === ref.key) : null;
  if (!row || !(row.lowDays > 0 && row.lowDays < 7)) continue;
  const fields = ['title', 'why', 'decision'].filter((f) => sevenDay.test(String(pick[f] || '')));
  for (const f of fields) pick[f] = String(pick[f]).replace(new RegExp(sevenDay.source, 'gi'), row.lowDays + '-day low');
  if (fields.length) guarded.push('Rule applied: ' + row.code + ' has ' + row.lowDays + ' days of prices, so "7-day low" is written "' + row.lowDays + '-day low"');
}

// The page highlights key in the title. Claude Haiku 5.5 rarely gives one (none in executions 295–338),
// so a missing key is taken from the title: a price, a percent, the item's name, a date, then any number.
const inTitle = (title, word) => {
  const i = word ? title.toLowerCase().indexOf(String(word).toLowerCase()) : -1;
  return i < 0 ? null : title.slice(i, i + String(word).length);
};
let keysSet = 0;
for (const pick of picks) {
  if (pick.key && String(pick.title || '').includes(pick.key)) continue;
  const title = String(pick.title || '');
  const ref = pick.ref || {};
  const names = [ref.block === 'market' || ref.block === 'travel' ? ref.key : null]
    .concat(ref.block === 'ai' ? watch.newsKeywords || [] : []);
  const found = (title.match(/[€$£]\s?\d+(?:[.,]\d+)*|\d+(?:[.,]\d+)*\s?(?:€|EUR|USD)/) || [])[0] ||
    (title.match(/[+\-−]?\d+(?:[.,]\d+)?\s?%/) || [])[0] ||
    names.map((n) => inTitle(title, n)).find(Boolean) ||
    (title.match(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\.?\s+\d{1,2}(?:\s+[A-Z][a-z]{2,8})?|\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*/) || [])[0] ||
    (title.match(/\d+(?:[.,]\d+)*/) || [])[0];
  if (found) {
    pick.key = found;
    keysSet += 1;
  }
}

// The agent sorts each mail into "act" (needs you soon) or "later". A mail it skipped counts as "later".
function mailBlock(mails, sorted, hidden) {
  const byId = {};
  for (const m of sorted) byId[m.id] = m;
  const act = [];
  const later = [];
  for (const m of mails) {
    const s = byId[m.id];
    if (s && s.need === 'act') act.push({ from: m.from, subject: m.subject, deadline: s.deadline || null, isNew: m.isNew });
    else later.push({ from: m.from, subject: m.subject, isNew: m.isNew });
  }
  return { act, later, hidden };
}
const blackFriday = $now.setZone('Europe/Paris').set({ year: 2026, month: 11, day: 27 }).startOf('day');
const edition = {
  mode: 'live',
  date: ctx.date,
  day: now.day,
  weekday: now.toFormat('cccc'),
  monthYear: now.toFormat('LLLL yyyy'),
  builtAt: ctx.time,
  demoNote: null,
  version,
  history: ((previous && previous.history) || []).concat([{ v: version, time: ctx.time, how }]),
  log: checked.log.concat([
    ...(input.translation && input.translation.asked ? [{ t: now.toFormat('HH:mm:ss'), msg: 'Translated to English: ' + input.translation.translated + ' of ' +
      input.translation.asked + ' texts' + (input.translation.error ? ' (call failed: ' + input.translation.error + ')' : '') +
      (input.translation.kept ? '; ' + input.translation.kept + ' kept in the original language (check failed)' : ''), ...(input.translation.kept ? { bad: true } : {}) }] : []),
    { t: now.toFormat('HH:mm:ss'), msg: 'Editor agent: ' + picks.length + ' picks' +
      (proposed.length > 5 ? ' (' + proposed.length + ' proposed, 5 kept)' : '') + ', ' + toolCalls + ' tool calls' +
      (keysSet ? '; highlight word taken from the title for ' + keysSet + ' pick' + (keysSet > 1 ? 's' : '') : '') },
    ...unverified.concat(guarded).map((msg) => ({ t: now.toFormat('HH:mm:ss'), msg, bad: true })),
    { t: now.toFormat('HH:mm:ss'), msg: 'Edition ' + ctx.date + (version > 1 ? ' replaced: v' + (version - 1) + ' to v' + version + ', still 1 row' : ' saved as a new row') },
  ]),
  sources: checked.sources,
  picks,
  courses: input.courses,
  // codesHidden: mails with a one-time code, only counted ("1 verification code hidden").
  mail: input.mail ? { ...mailBlock(input.mail, parsed.mail || [], input.hiddenMail), codesHidden: input.codesHidden || 0 } : null,
  // Portfolio on the page: codes, daily change in % and price candles. No quantities or amounts.
  market: checked.data.market ? {
    holdings: checked.data.market.holdings.map((h) => ({ symbol: h.symbol, name: h.name || null, pct: h.pct, closes: h.closes, ohlc: h.ohlc })),
    // A watchlist code Twelve Data gave no candles for, with the reason (the other codes are shown as usual).
    missing: checked.data.market.missing || [],
    threshold: watch.marketThreshold,
    event: null,
    // Always "watchlist" since 11-01: the codes come from My watchlist; the IBKR position is not shown.
    codesFrom: 'watchlist',
    // The trading day of the newest close (a Friday on a weekend), so the page does not say "today".
    lastClose: checked.data.market.lastClose || null,
  } : null,
  travel: checked.data.travel ? {
    dates: checked.data.travel.dates,
    routes: input.travel.map((r) => {
      return { city: r.city, code: r.code, fare: r.fare, low7: r.low7, lowDays: r.lowDays, lowFrom: r.lowFrom, hotel: r.hotelPerNight,
        // Up to 8 points: the days behind low7, then today's fare (the last point is today), so the low is on the curve.
        series: (r.before || []).concat([r.fare]).filter((n) => n != null) };
    }),
    quota: checked.data.travel.usage ? 'SerpApi this month: ' + checked.data.travel.usage.used + ' of ' + checked.data.travel.usage.of + ' searches.' : null,
  } : null,
  ai: checked.data.aihot ? {
    hotCount: (checked.data.aihot.hot || []).length,
    watch: c.news.slice(0, 8).map((n) => ({ title: n.title, titleOriginal: n.titleOriginal, heat: n.heat, list: n.list, url: n.url, isNew: n.isNew })),
    empty: input.quietKeywords.length ? input.quietKeywords.join(', ') + ': nothing in the last 24 hours.' : '',
    codex: input.codex,
  } : null,
  deals: checked.data.deals ? {
    daysToBlackFriday: Math.max(0, Math.ceil(blackFriday.diff(now.startOf('day'), 'days').days)),
    // low7 has only prices open to everyone, so a member-price row is compared through publicPrice (null: none today).
    rows: c.deals.map((d) => ({ item: d.title, label: d.label, merchant: d.merchant, price: d.price, target: d.target, memberOnly: d.memberOnly,
      publicPrice: d.publicPrice, low7: d.low7, lowDays: d.lowDays, listPrice: d.listPrice, from: d.from, note: d.note, link: d.link })),
    empty: input.noDeal.length ? input.noDeal.join(', ') + ': no price today in Dealabs or Google Shopping.' : '',
  } : null,
};

return [{ json: { date: ctx.date, version, updated_at: $now.toISO(), edition: JSON.stringify(edition) } }];
