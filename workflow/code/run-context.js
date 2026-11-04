// Who started this run, and which day it is in Paris.
const now = $now.setZone('Europe/Paris').setLocale('en');
const byRebuild = $('POST /rebuild').isExecuted;
return [{
  json: {
    trigger: byRebuild ? 'rebuild' : 'schedule',
    // The page sends reason=page-open when it builds a missed 08:00 edition.
    reason: byRebuild && ($('POST /rebuild').first().json.query || {}).reason === 'page-open' ? 'page-open' : null,
    date: now.toFormat('yyyy-MM-dd'),
    yesterday: now.minus({ days: 1 }).toFormat('yyyy-MM-dd'),
    startedAt: now.toISO(),
    time: now.toFormat('HH:mm:ss'),
  },
}];
