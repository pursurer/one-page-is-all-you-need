// TEST ONLY. Stands in for SerpApi Google Hotels: hotels with class and rating, plus a cheap "3-star" hostel
// that the hostel rule must leave out. The price used is the median of the rest.
const night = { JFK: 210, ZRH: 160, LHR: 140, HND: 120, TPE: 85 };
return $input.all().map((i) => ({ json: { properties: [
  { type: 'hotel', name: 'Wise Owl Hostels', extracted_hotel_class: 3, overall_rating: 4.5, rate_per_night: { extracted_lowest: 25 } },
  ...[0, 15, 40].map((d, k) => ({ type: 'hotel', name: 'Hotel ' + k, extracted_hotel_class: 4, overall_rating: 4.3, rate_per_night: { extracted_lowest: night[i.json.code] + d } })),
] } }));
