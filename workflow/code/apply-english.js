// The agent and the page see English: the checked translations replace the Chinese and French texts that
// "Pick candidates" chose. The original wording is kept beside them (titleOriginal, subjectOriginal).
const ctx = $('Run context').first().json;
const picked = $('Pick candidates').first().json;
const ran = (n) => { try { return $(n).isExecuted; } catch (e) { return false; } };
const tr = ran('English text') ? $('English text').first().json : { map: {}, summary: null };
const en = (s) => (typeof s === 'string' && tr.map[s]) || s;
const c = JSON.parse(JSON.stringify(picked.candidates));
c.news = (c.news || []).map((n) => (en(n.title) !== n.title ? { ...n, title: en(n.title), titleOriginal: n.title } : n));
c.deals = (c.deals || []).map((d) => (en(d.title) !== d.title ? { ...d, title: en(d.title), titleOriginal: d.title } : d));
if (c.mail) c.mail = c.mail.map((m) => (en(m.subject) !== m.subject ? { ...m, subject: en(m.subject), subjectOriginal: m.subject } : m));
if (c.courses) c.courses = { ...c.courses, today: (c.courses.today || []).map((x) => ({ ...x, title: en(x.title) })), next: en(c.courses.next) };
c.codex = en(c.codex);
// The agent gets only the English texts: an original beside them could end up as a pick's ref key.
// It does not get the deals: Today's five never comes from Deals (the user's rule, 11-02). The page still lists them.
const { deals, ...agentCandidates } = c;
const forAgent = JSON.stringify(agentCandidates, (k, v) => (k === 'titleOriginal' || k === 'subjectOriginal' ? undefined : v), 1);
const prompt = `Today is ${ctx.date} in Paris. Choose today's picks from these candidates.

Candidates (JSON):
${forAgent}`;
return [{ json: { ...picked, prompt, candidates: c, courses: c.courses, mail: c.mail, codex: c.codex, translation: tr.summary } }];
