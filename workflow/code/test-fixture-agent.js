// TEST ONLY. Stands in for the editor agent while no model credential exists.
// It returns the same shape as the real agent, built from the real candidates, with no model call.
const c = $('Prepare agent input').first().json.candidates;
const picks = [];
for (const d of c.deals.filter((x) => x.underTarget && !x.memberOnly).slice(0, 2)) {
  picks.push({
    kind: 'act', title: d.label + ' at ' + d.price + ' €, ' + (d.vsLow7 || 'no 7-day low yet'), key: d.price + ' €',
    from: ['Deals'], ref: { block: 'deals', key: d.title }, tool: 'none',
    input: 'Dealabs: ' + d.title + ', ' + d.merchant + '.', why: 'Test fixture: no model call.',
    call: 'No tool call.', result: '—', decision: 'Test fixture.',
  });
}
for (const m of (c.mail || []).filter((x) => /confirm|book/i.test(x.subject)).slice(0, 1)) {
  picks.push({
    kind: 'act', title: m.subject, from: ['Mail'], ref: { block: 'mail', key: m.subject }, tool: 'none',
    input: 'Mail from ' + m.from + '.', why: 'Test fixture: no model call.', call: 'No tool call.', result: '—', decision: 'Test fixture.',
  });
}
for (const n of c.news.slice(0, 5 - picks.length)) {
  picks.push({
    kind: 'know', title: n.title, from: ['AI news'], ref: { block: 'ai', key: n.title }, tool: 'none',
    input: 'AIHOT: ' + n.title, why: 'Test fixture: no model call.', call: 'No tool call.', result: '—', decision: 'Test fixture.',
  });
}
// Mail: a plain keyword rule instead of the model's judgement.
const mail = (c.mail || []).map((m) => ({ id: m.id, need: /confirm|book|reply|pay|due/i.test(m.subject) ? 'act' : 'later' }));
return [{ json: { output: { picks, mail }, intermediateSteps: [] } }];
