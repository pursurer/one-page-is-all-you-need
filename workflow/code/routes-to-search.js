// One SerpApi flight search per route: 5 a day, about 150 a month on the free plan's 250.
const t = $('My watchlist').first().json.travel;
return t.routes.map((r) => ({ json: { city: r.city, code: r.code, from: t.origin, out: t.out, back: t.back } }));
