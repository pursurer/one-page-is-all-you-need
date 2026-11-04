// One item per mail ID from the list call. No mail in 24 hours: nothing to read, the branch ends here.
const list = $input.first().json;
if (list.error) return [];
return (list.messages || []).slice(0, 40).map((m) => ({ json: { id: m.id } }));
