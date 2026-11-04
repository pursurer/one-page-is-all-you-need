// The page is in English (the user's rule, 11-01). The Chinese and French texts it will show are collected here:
// news titles, the Codex line, deal titles, mail subjects and class titles. Only these few go to the model.
// Mails with a one-time code were already left out by "Check sources and use cache".
const picked = $('Pick candidates').first().json;
const c = picked.candidates;
const foreign = (s) => /[㐀-鿿＀-￯]/.test(s) || /[àâçéèêëîïôûùüÿœæ]/i.test(s) ||
  /\b(le|la|les|des|du|au|aux|pour|avec|votre|vos|sur|une|et|est|pas|dans|par|nouveau|nouvelle|homme|femme|veste|noir|noire|blanc|taille|commande|cours|salle|examen|rappel|bienvenue)\b/i.test(s);
const strings = new Set();
const add = (s) => { if (typeof s === 'string' && s.trim() && foreign(s)) strings.add(s); };
for (const n of c.news || []) add(n.title);
add(c.codex);
for (const d of c.deals || []) add(d.title);
for (const m of c.mail || []) add(m.subject);
if (c.courses) {
  for (const x of c.courses.today || []) add(x.title);
  add(c.courses.next);
}
return [{ json: { strings: [...strings] } }];
