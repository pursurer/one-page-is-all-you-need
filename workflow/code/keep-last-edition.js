// The agent failed or chose nothing. Keep the last saved edition; never publish an empty page.
const agent = $('Editor agent').first().json;
const reason = agent.error
  ? 'The editor agent failed: ' + String(agent.error.message || agent.error).slice(0, 200)
  : 'The editor agent returned no picks.';
return [{ json: { reason, html: '<p>' + reason + ' The last edition stays online. <a href="/webhook/today">Back to the page</a></p>' } }];
