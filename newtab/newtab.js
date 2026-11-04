// Open today's page from the local n8n. /healthz answers without starting a workflow,
// so this check adds no execution to n8n's history.
const N8N = 'http://127.0.0.1:5678';

fetch(N8N + '/healthz', { mode: 'no-cors', cache: 'no-store' })
  .then(() => location.replace(N8N + '/webhook/today'))
  .catch(() => { document.getElementById('down').hidden = false; });
