// TEST ONLY. A small Zeus-like ICS file around today's date, served at /webhook/zeus-fixture.
// The real build reads the user's own Zeus link from the private config table instead.
const day = (n) => $now.setZone('Europe/Paris').startOf('day').plus({ days: n });
const at = (n, hm) => day(n).set({ hour: Number(hm.slice(0, 2)), minute: Number(hm.slice(3)) }).toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
const classes = [
  [0, '09:30', '12:30', 'Network Security', 'KB-412', 'GR1'],
  [0, '14:00', '17:00', 'Automation with n8n', 'KB-301', 'GR1'],
  [1, '09:00', '12:00', 'Project Management Principles', 'VJ-210', 'GR1'],
  [3, '13:30', '16:30', 'Business Management', 'KB-108', 'GR1'],
];
const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Daily Page//Zeus fixture//EN'];
classes.forEach(([d, s, e, title, room, group], i) => lines.push(
  'BEGIN:VEVENT', 'UID:fixture-' + i, 'DTSTAMP:' + at(0, '00:00'), 'DTSTART:' + at(d, s), 'DTEND:' + at(d, e),
  'SUMMARY:' + title, 'LOCATION:' + room, 'DESCRIPTION:Group: ' + group, 'END:VEVENT'));
lines.push('END:VCALENDAR');
return [{ json: { ics: lines.join('\r\n') + '\r\n' } }];
