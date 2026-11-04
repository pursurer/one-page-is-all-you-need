// Each translation is checked before it is used: one numbered line per text, no Chinese left, and every number
// of the original still in it (Chinese amounts in 万/亿 and dates such as 12月 may change form).
// A text that fails keeps its original wording; a failed call keeps them all. The run never stops here.
const asked = $('Text to translate').first().json.strings;
const out = $('Translate to English').first().json || {};
const lines = {};
for (const l of String(out.text || '').split('\n')) {
  const m = l.match(/^\s*(\d+)[.)]\s+(.+?)\s*$/);
  if (m) lines[Number(m[1])] = m[2];
}
const digits = (s) => String(s).replace(/\D/g, '');
const map = {};
let kept = 0;
asked.forEach((orig, k) => {
  const t = lines[k + 1];
  const have = digits(t || '');
  const needed = [...String(orig).matchAll(/\d+(?:[.,]\d+)*(?=\s*([万亿千百月日号年时点分秒])?)/g)].filter((m) => !m[1]).map((m) => digits(m[0]));
  if (!t || /[㐀-鿿]/.test(t) || needed.some((n) => !have.includes(n))) { kept += 1; return; }
  map[orig] = t;
});
const error = out.error ? String(out.error.message || out.error).slice(0, 80) : null;
return [{ json: { map, summary: { asked: asked.length, translated: Object.keys(map).length, kept, error } } }];
