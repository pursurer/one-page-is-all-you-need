// TEST ONLY. Stands in for the Gmail read call: same shape as users.messages.get with format=metadata.
const mails = {
  'fixture-m1': ['EPITA Scolarité <scolarite@epita.fr>', 'Exam timetable: confirm your slot by Fri 6 Nov', 'Please confirm your exam slot on the intranet before Friday 6 November, 18:00.', 'CATEGORY_PERSONAL'],
  'fixture-m2': ['"Automation with n8n" <teacher@example.edu>', 'Defense day: book your 12-minute slot', 'Book a slot for the 13 November defense in the shared sheet.', 'CATEGORY_PERSONAL'],
  'fixture-m3': ['GitHub <noreply@github.com>', 'ThariqS/ai-newtab published a new release', 'Release v0.4.0 is out.', 'CATEGORY_UPDATES'],
  'fixture-m4': ['Fnac <news@fnac.com>', 'Black Friday early access', 'Up to 40% off.', 'CATEGORY_PROMOTIONS'],
  // A one-time code: it must never reach the agent, the EDITION or the cache (the code here is made up).
  'fixture-m5': ['Uber <noreply@uber.com>', 'Ne pas partager : 482913', 'Votre code Uber est 482913. Ne le partagez avec personne.', 'CATEGORY_UPDATES'],
};
return $input.all().map((i) => {
  const [from, subject, snippet, category] = mails[i.json.id];
  return { json: { id: i.json.id, threadId: i.json.id, labelIds: ['INBOX', category], snippet,
    payload: { headers: [{ name: 'From', value: from }, { name: 'Subject', value: subject }] } } };
});
