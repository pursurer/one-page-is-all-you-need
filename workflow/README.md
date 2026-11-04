# workflow/: the n8n workflows

The workflow JSON files are generated. Edit `build.py` (nodes, prompts, watchlist) or `code/*.js` (the Code node bodies), then run:

```bash
python3 -I build.py
```

The ids in `CREDENTIALS` and `TABLE_IDS` are placeholders. Fill in your own n8n credential and Data Table ids first (see the main README). Data Tables are picked by id on purpose: n8n's lookup by name is a fuzzy search, and with a table named `editions_test` it once picked that one for `editions`.

| File | What it is |
|---|---|
| `20-build.json` | **Daily Page · 1 Build edition**: at 08:00, or on `POST /webhook/rebuild`, it builds today's `EDITION` |
| `10-serve.json` | **Daily Page · 2 Serve page**: `GET /webhook/today` returns the page with the latest `EDITION` injected |
| `00-setup-tables.json` | Creates the five Data Tables: `editions`, `source_cache`, `config`, `price_history`, `timetable`. Run it once |
| `20-build-test.json`, `10-serve-test.json` | The same flows on test tables (`t1_*`), with every paid or private source replaced by fixtures in the API's own shape, and no model call |
| `05-setup-test-tables.json`, `90-clean-test.json` | Create and empty the test tables |
| `deploy.sh` | Imports and publishes the files you name, restarts n8n once, and waits until the new version is the one that runs |

`n8n execute` on the command line does not load the Data Table module, so tests go through the running server: deploy, then call the webhook with `curl`. In the test build, add a row `test_fail` = `node name, node name` to the test `config` table and those fixture nodes answer HTTP 401, so you can rehearse a failing source without redeploying.

## Build edition, node by node

| Stage | Nodes | What happens |
|---|---|---|
| 1 Trigger | Every day 08:00 / POST /rebuild → Run context → My watchlist | Who started the run, today and yesterday in Paris time, and the watchlist: news keywords, deal targets, chart codes, routes |
| | Load today's edition → Rebuilt in the last 10 min? | A second rebuild within 10 minutes is refused, because every run spends model credit |
| 2 Fetch | Load private config → Zeus link set? → Zeus · timetable (ICS) → Read Zeus events | The ICS link works like a password, so it lives in the private `config` table, not on the canvas. A revoked link (a login page instead of a calendar) fails here |
| | Gmail · list last 24h → Mail ids → Gmail · read headers | Scope `gmail.readonly`. Sender and subject only. New mail is marked by comparing ids with the last run |
| | IBKR · request statement → wait → get statement → Still generating? | Flex Web Service with a read-only token. While the report is being made (code 1019) it waits 20 s and asks once more |
| | Watchlist codes (IBKR counted) → Twelve Data · daily candles | IBKR positions are only counted. 30 daily candles for each of the 8 watchlist codes (the free plan allows 8 calls a minute); a missing code is listed, the rest still show |
| | SerpApi · this month → SerpApi plan → flights → shopping → hotels | Reads the searches left this month first (a free call). Anything already searched today is reused. Order: flights, then Google Shopping, then hotels; at least 15 searches are kept back |
| | AIHOT, Dealabs | Each request retries once; a failure never stops the run |
| | Check sources and use cache → Save source cache | **Failures are handled here**: a source that failed twice is read from the cache and marked stale |
| | Timetable rows → Save timetable | The next 14 days, one row per day, so a cancelled class disappears on the next run |
| 3 Decide | Text to translate → Translate to English → English text | One model call translates every Chinese or French text the page shows; each line is checked (no Chinese left, every number kept) or the original stays |
| | Prepare agent input → Price rows → Save today's prices | Plain rules filter first: keywords, the cheapest new offer per item, accessories left out, new news marked. Mail goes to the agent as sender, subject and a short snippet |
| | Editor agent (Claude Haiku 5.5; tools `search_ai_news`, `get_price_history`, `lookup_courses`) → Picks format | Picks five, sorts mail into *needs you* and *can wait*, and decides which candidates need a tool call. A wrong answer format gets one repair call, then the agent retries |
| 4 Save | Has picks? → Assemble EDITION → Save edition (upsert by date) | No picks, no page. Each pick's tool calls are checked against the calls n8n actually ran. Running twice on one day still leaves one row |
| | Started by Rebuild? → Answer: back to the page | From the button, a 303 back to the page |
| | Keep the last edition → Answer: why nothing changed | If the agent fails, yesterday's page stays and the browser is told why |
