// SerpApi's free plan has 250 searches a month. This node decides which searches run now.
// A search made earlier today is never repeated, so a rebuild (for example during the defense) costs 0 searches.
// The order is flights, then Google Shopping, then hotels. A search that would leave fewer than 15 searches
// for later is skipped and its cache is used; the log says so in one line.
const MARGIN = 15;
const ctx = $('Run context').first().json;
const watch = $('My watchlist').first().json;
const t = watch.travel;
const searchedToday = (node) => String(($(node).first().json || {}).fetched_at || '').slice(0, 10) === ctx.date;

const acc = $('SerpApi · this month').first().json || {};
const left = Number.isFinite(acc.plan_searches_left) ? acc.plan_searches_left
  : Number.isFinite(acc.searches_per_month) && Number.isFinite(acc.this_month_usage) ? acc.searches_per_month - acc.this_month_usage : null;

// Hotels change slowly: each city once a week, and again when the hotel filter changes.
const cache = $('Load travel cache').first().json;
const hotels = (cache && cache.payload ? JSON.parse(cache.payload).hotels : null) || {};
const weekAgo = $now.setZone('Europe/Paris').minus({ days: 7 }).toFormat('yyyy-MM-dd');
const hotelRoutes = t.routes
  .filter((r) => !hotels[r.code] || hotels[r.code].searchedOn <= weekAgo || hotels[r.code].filter !== t.hotelFilter.tag)
  .map((r) => ({ city: r.city, code: r.code, out: t.out, back: t.back, day: ctx.date }));

const due = { flights: searchedToday('Load travel cache') ? 0 : t.routes.length,
  shopping: searchedToday('Load shopping cache') ? 0 : watch.deals.filter((d) => d.query).length, hotels: hotelRoutes.length };
// When the account call fails, the count is unknown and the searches run as before.
let budget = left == null ? Infinity : left - MARGIN;
const fits = (n) => {
  if (!n || n > budget) return false;
  budget -= n;
  return true;
};
const flights = fits(due.flights);
const shopping = fits(due.shopping);
const hotelCount = Math.max(0, Math.min(due.hotels, budget));
const skipped = [[!flights && due.flights, ' flight'], [!shopping && due.shopping, ' Google Shopping'], [due.hotels - hotelCount, ' hotel']]
  .filter(([n]) => n > 0).map(([n, what]) => n + what + (n > 1 ? ' searches' : ' search'));
const note = skipped.length ? 'SerpApi quota guard: ' + left + ' searches left this month, kept ' + MARGIN + ' for later; skipped ' +
  skipped.join(', ') + ' (cache used)' : null;
return [{ json: { left, margin: MARGIN, due, flights, shopping, hotels: hotelRoutes.slice(0, hotelCount), note } }];
