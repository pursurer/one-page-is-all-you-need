// Log today's best price per watchlist item, so get_price_history can compare across days.
const ctx = $('Run context').first().json;
// Flights are logged too ("Flight CDG-HND"), so the agent can compare a fare with earlier days.
const input = $('Prepare agent input').first().json;
// Only prices open to everyone are logged, so a member price never becomes the 7-day low.
return input.candidates.deals.filter((d) => d.publicPrice != null || !d.memberOnly)
  .map((d) => ({ json: { item: d.label, day: ctx.date, price: d.memberOnly ? d.publicPrice : d.price, source: d.memberOnly ? d.publicMerchant : d.merchant } }))
  .concat((input.travel || []).filter((r) => r.fare).map((r) => ({ json: { item: r.priceLogItem, day: ctx.date, price: r.fare, source: 'Google Flights' } })));
