// The cities to search for hotels now: chosen by SerpApi plan (once a week per city, within the monthly quota).
// It also runs when the flights were already searched today.
return $('SerpApi plan').first().json.hotels.map((r) => ({ json: r }));
