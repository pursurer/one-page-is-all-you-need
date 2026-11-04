// Put the latest edition into the page template between the EDITION markers.
// Built from parts: n8n treats a slash-star sequence in Code as a comment, even inside a string.
const BEGIN = '/' + '*EDITION:BEGIN*' + '/';
const END = '/' + '*EDITION:END*' + '/';

const template = (await this.helpers.getBinaryDataBuffer(0, 'template')).toString('utf8');
// After a page-open build, read the row that build just saved.
const row = $('Load latest edition (after build)').isExecuted
  ? $('Load latest edition (after build)').first().json
  : $('Load latest edition').first().json;
const today = $now.setZone('Europe/Paris').toFormat('yyyy-MM-dd');

let edition = null;
if (row && row.edition) {
  edition = JSON.parse(row.edition);
  edition.version = row.version;
  // Opened before today's run: show the last edition, and say so.
  edition.staleEdition = row.date !== today;
}

// Data comes from outside sources. Escape "<" so a closing script tag in a title cannot end
// the page script, and escape the two Unicode line separators that break a script literal.
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);
const json = JSON.stringify(edition)
  .split('<').join('\\u003c')
  .split(LS).join('\\u2028')
  .split(PS).join('\\u2029');

const a = template.indexOf(BEGIN);
const b = template.indexOf(END);
if (a < 0 || b < a) {
  throw new Error('The page template has no EDITION:BEGIN ... EDITION:END markers');
}
const html = template.slice(0, a + BEGIN.length) + json + template.slice(b);
return [{ json: { html } }];
