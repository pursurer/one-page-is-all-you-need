# newtab/: today's page on every new tab

A tiny Chrome extension (Manifest V3). Every new tab opens today's page from your local n8n, `http://127.0.0.1:5678/webhook/today`. The idea is the same as [ai-newtab](https://github.com/ThariqS/ai-newtab): replace the new tab page. Here n8n makes the content and the extension only redirects.

## Install

1. Open `chrome://extensions` and switch on **Developer mode**.
2. Click **Load unpacked** and pick this `newtab` folder.
3. Open a new tab. If Chrome asks whether to keep the changed new tab page, keep it.

## What a new tab shows

| Situation | New tab |
|---|---|
| n8n is running and today's edition exists | Today's page at once |
| After 08:05 and no edition yet (the computer slept at 08:00) | The page, after n8n builds today's edition (about 12 to 35 seconds) |
| n8n is not running | A short note (in Chinese) that n8n is not running, with a direct link to the page |

- The extension first asks n8n's `/healthz`, which starts no workflow, so the check leaves nothing in n8n's execution list.
- It asks for no permissions, reads no browsing history and stores no key.
