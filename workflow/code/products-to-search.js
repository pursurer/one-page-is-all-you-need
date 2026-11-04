// One Google Shopping search per watchlist item (2 a day), in France and in French.
const watch = $('My watchlist').first().json;
return watch.deals.filter((d) => d.query).map((d) => ({ json: { label: d.label, q: d.query } }));
