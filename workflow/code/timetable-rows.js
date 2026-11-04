// One row per day for the next 14 days, so lookup_courses can answer "which classes are on <date>?".
// A day with no class gets an empty list, so a cancelled class disappears on the next fetch.
// Only after a successful fetch: a stale run keeps the rows from the last good one.
const ctx = $('Run context').first().json;
const checked = $('Check sources and use cache').first().json;
const zeus = checked.sources.find((s) => s.key === 'zeus');
if (!zeus || zeus.status !== 'ok') return [];
const first = $now.setZone('Europe/Paris').startOf('day');
return Array.from({ length: 14 }, (_, i) => {
  const day = first.plus({ days: i }).toFormat('yyyy-MM-dd');
  const classes = checked.data.zeus.filter((c) => c.day === day).map(({ time, title, where }) => ({ time, title, where }));
  return { json: { day, classes: JSON.stringify(classes), fetched_at: ctx.startedAt } };
});
