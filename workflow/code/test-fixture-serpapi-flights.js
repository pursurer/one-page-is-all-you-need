// TEST ONLY. Stands in for SerpApi Google Flights: prices and price_insights per route.
const fares = { JFK: 640, ZRH: 210, LHR: 165, HND: 812, TPE: 905 };
return $input.all().map((i) => {
  const fare = fares[i.json.code];
  // Like Google: one fare per Paris day, ending with today (the last point is today's fare).
  const today = DateTime.now().setZone('Europe/Paris').startOf('day');
  const history = Array.from({ length: 10 }, (_, d) => [today.minus({ days: 9 - d }).toSeconds(), d === 9 ? fare : Math.round(fare * (1.12 - d * 0.01))]);
  // Google gives no price_insights for CDG-HND (seen on 11-01), so the test covers that case too.
  const insights = i.json.code === 'HND' ? {} : { price_insights: { lowest_price: fare, price_level: 'typical',
    typical_price_range: [Math.round(fare * 0.9), Math.round(fare * 1.2)], price_history: history } };
  return { json: { best_flights: [{ price: fare }], other_flights: [{ price: fare + 40 }], ...insights } };
});
