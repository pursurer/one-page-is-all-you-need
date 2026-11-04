"""Generate the n8n workflow JSON files from readable sources.

Code node bodies live in code/*.js, so they can be read and diffed as JavaScript.
Run: python3 -I build.py   (writes the JSON files next to this file)

The test files (*-test.json, 05-setup-test-tables.json, 90-clean-test.json) use their own t1_* tables,
so a test run never touches the real editions, cache, timetable, prices or config.
"""
import json
import os
import pathlib
import uuid

HERE = pathlib.Path(__file__).resolve().parent
TEMPLATE_PATH = "/home/node/.n8n-files/page/template.html"
# n8n credential ids. An id is not a secret: it only names a credential stored inside n8n.
# Fill one in after the user has created that credential. Until then the model node runs without it,
# and the other sources stay off the canvas, so the page shows them as "not connected".
CREDENTIALS = {
    "anthropic": {"type": "anthropicApi", "id": "YOUR_ANTHROPIC_CREDENTIAL_ID", "name": "Anthropic (own)"},  # 2026-10-31
    "gmail": {"type": "googleOAuth2Api", "id": "YOUR_GMAIL_CREDENTIAL_ID", "name": "Gmail read-only (own)"},  # 2026-11-01, gmail.readonly
    # 1020 on the first try: the parameter name had been autofilled as "n8n" instead of "t"; fixed 2026-11-01.
    "ibkr": {"type": "httpQueryAuth", "id": "YOUR_IBKR_CREDENTIAL_ID", "name": "IBKR Flex (own)"},
    "twelvedata": {"type": "httpQueryAuth", "id": "YOUR_TWELVEDATA_CREDENTIAL_ID", "name": "Twelve Data (own)"},  # 2026-11-01
    "serpapi": {"type": "httpQueryAuth", "id": "YOUR_SERPAPI_CREDENTIAL_ID", "name": "SerpApi (own)"},  # 2026-11-01
}
# Test build only. Set ZEUS_TEST_URL=http://127.0.0.1:5678/webhook/zeus-revoked to rehearse a revoked link (404).
ZEUS_TEST_URL = os.environ.get("ZEUS_TEST_URL", "http://127.0.0.1:5678/webhook/zeus-fixture")
# Real page only, to test the page-open build without touching real editions:
# SERVE_FORCE_BUILD=1 treats today's edition as missing, SERVE_TEST_BUILD_URL replaces the build call,
# SERVE_MARKER_KEY uses its own "last attempt" row in the config table.
SERVE_FORCE_BUILD = os.environ.get("SERVE_FORCE_BUILD") == "1"
SERVE_BUILD_URL = os.environ.get("SERVE_TEST_BUILD_URL", "http://127.0.0.1:5678/webhook/rebuild?reason=page-open")
SERVE_MARKER_KEY = os.environ.get("SERVE_MARKER_KEY", "page_build_started_at")
SETTINGS = {"executionOrder": "v1", "timezone": "Europe/Paris", "saveManualExecutions": True}
# Data Table ids. The node's "by name" lookup is a fuzzy search that takes the first match: with tables named
# "editions_test" present, "editions" resolved to the test table (execution 274). So tables are picked by id,
# and test table names never contain a real table name.
TABLE_IDS = {"editions": "YOUR_EDITIONS_TABLE_ID", "source_cache": "YOUR_SOURCE_CACHE_TABLE_ID", "config": "YOUR_CONFIG_TABLE_ID", "price_history": "YOUR_PRICE_HISTORY_TABLE_ID", "timetable": "YOUR_TIMETABLE_TABLE_ID", "t1_ed": "YOUR_T1_ED_TABLE_ID", "t1_sc": "YOUR_T1_SC_TABLE_ID", "t1_cf": "YOUR_T1_CF_TABLE_ID", "t1_ph": "YOUR_T1_PH_TABLE_ID", "t1_tt": "YOUR_T1_TT_TABLE_ID"}
TEST_NAMES = {"editions": "t1_ed", "source_cache": "t1_sc", "config": "t1_cf", "price_history": "t1_ph", "timetable": "t1_tt"}
TABLES = {"editions": [("date", "string"), ("version", "number"), ("updated_at", "string"), ("edition", "string")],
          "source_cache": [("source", "string"), ("fetched_at", "string"), ("payload", "string")],
          "config": [("key", "string"), ("value", "string")],
          "price_history": [("item", "string"), ("day", "string"), ("price", "number"), ("source", "string")],
          "timetable": [("day", "string"), ("classes", "string"), ("fetched_at", "string")]}


def code(name):
    return (HERE / "code" / f"{name}.js").read_text(encoding="utf-8")


def node_id(workflow, name):
    # Stable ids, so re-imports update the same nodes.
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"daily-page/{workflow}/{name}"))


def cred(key):
    c = CREDENTIALS[key]
    return {c["type"]: {"id": c["id"], "name": c["name"]}}


class Flow:
    def __init__(self, wid, name, test=False):
        self.wid, self.name, self.test = wid, name, test
        self.nodes, self.connections = [], {}
        self.shift = None  # (from_x, dx): move later nodes right to make room on the canvas

    def add(self, name, type_, version, pos, params=None, **extra):
        if self.shift and pos[0] >= self.shift[0]:
            pos = (pos[0] + self.shift[1], pos[1])
        node = {"id": node_id(self.wid, name), "name": name, "type": type_, "typeVersion": version,
                "position": list(pos), "parameters": params or {}}
        node.update(extra)
        if type_ == "n8n-nodes-base.webhook":
            node["webhookId"] = node_id(self.wid, name + "/webhook")
        self.nodes.append(node)
        return name

    def table(self, name):
        full = TEST_NAMES[name] if self.test else name
        return {"__rl": True, "mode": "id", "value": TABLE_IDS[full], "cachedResultName": full}

    def link(self, src, dst, out=0, kind="main"):
        outs = self.connections.setdefault(src, {}).setdefault(kind, [])
        while len(outs) <= out:
            outs.append([])
        outs[out].append({"node": dst, "type": kind, "index": 0})

    def chain(self, *names):
        for a, b in zip(names, names[1:]):
            self.link(a, b)

    def write(self, filename):
        data = {"id": self.wid, "name": self.name, "active": False, "settings": SETTINGS,
                "nodes": self.nodes, "connections": self.connections, "pinData": {}}
        (HERE / filename).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print("wrote", filename, len(self.nodes), "nodes")


def cond_true(expr):
    """An IF node that is true when the expression is true."""
    return {"conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose", "version": 2},
                           "conditions": [{"id": "c1", "leftValue": "={{ " + expr + " }}", "rightValue": "",
                                           "operator": {"type": "boolean", "operation": "true", "singleValue": True}}],
                           "combinator": "and"},
            "looseTypeValidation": True, "options": {}}


def html_response(body, status=200):
    return {"respondWith": "text", "responseBody": body,
            "options": {"responseCode": status,
                        "responseHeaders": {"entries": [{"name": "content-type", "value": "text/html; charset=utf-8"}]}}}


# ---------------------------------------------------------------- serve
def serve_flow(test=False):
    wid, name, path = (("DailyPageServeT1", "Daily Page · test page (test tables)", "today-test") if test
                       else ("DailyPageServe01", "Daily Page · 2 Serve page", "today"))
    s = Flow(wid, name, test)
    build_url = "http://127.0.0.1:5678/webhook/rebuild-test?reason=page-open" if test else SERVE_BUILD_URL
    s.add("GET /" + path, "n8n-nodes-base.webhook", 2, (0, 0),
          {"httpMethod": "GET", "path": path, "responseMode": "responseNode", "options": {}},
          notes="The page you open every morning: http://localhost:5678/webhook/" + path)
    s.add("Load latest edition", "n8n-nodes-base.dataTable", 1.1, (220, 0),
          {"resource": "row", "operation": "get", "dataTableId": s.table("editions"),
           "returnAll": False, "limit": 1, "orderBy": True, "orderByColumn": "date", "orderByDirection": "DESC"},
          alwaysOutputData=True,
          notes="Newest row first. If today's run has not happened yet, this is yesterday's edition.")
    # The laptop may be asleep at 08:00, and n8n does not catch up a missed schedule.
    # So the first time the page is opened after 08:05 without today's edition, it builds one first.
    # A failed build leaves no edition, so a "last attempt" time in the config table stops a retry on every open.
    missing = ("true" if SERVE_FORCE_BUILD and not test else
               "$json.date !== $now.setZone('Europe/Paris').toFormat('yyyy-MM-dd') && "
               "$now.setZone('Europe/Paris').hour * 60 + $now.setZone('Europe/Paris').minute >= 485")
    s.add("Today's edition missing?", "n8n-nodes-base.if", 2.2, (440, 0),
          cond_true(missing), executeOnce=True,
          notes="After 08:05 with no edition for today: the 08:00 run was missed.")
    s.add("Load last page build", "n8n-nodes-base.dataTable", 1.1, (660, -160),
          {"resource": "row", "operation": "get", "dataTableId": s.table("config"), "matchType": "allConditions",
           "filters": {"conditions": [{"keyName": "key", "condition": "eq", "keyValue": SERVE_MARKER_KEY}]},
           "returnAll": False, "limit": 1},
          executeOnce=True, alwaysOutputData=True)
    s.add("Tried in the last 10 min?", "n8n-nodes-base.if", 2.2, (880, -160),
          cond_true("!!$json.value && ($now.toMillis() - DateTime.fromISO($json.value).toMillis()) < 600000"),
          executeOnce=True, notes="A failed build is not retried on every open: at most once per 10 minutes.")
    s.add("Note this build attempt", "n8n-nodes-base.dataTable", 1.1, (1100, -320),
          {"resource": "row", "operation": "upsert", "dataTableId": s.table("config"), "matchType": "allConditions",
           "filters": {"conditions": [{"keyName": "key", "condition": "eq", "keyValue": SERVE_MARKER_KEY}]},
           "columns": {"mappingMode": "defineBelow", "value": {"key": SERVE_MARKER_KEY, "value": "={{ $now.toISO() }}"}},
           "options": {}}, executeOnce=True)
    s.add("Build today's edition now", "n8n-nodes-base.httpRequest", 4.2, (1320, -320), {
        "method": "POST", "url": build_url,
        "options": {"timeout": 150000, "redirect": {"redirect": {"followRedirects": False}},
                    "response": {"response": {"neverError": True}}}},
          executeOnce=True, onError="continueRegularOutput",
          notes="Runs the build workflow and waits for it (about 15 to 35 seconds). If it fails, the last edition is shown.")
    s.add("Load latest edition (after build)", "n8n-nodes-base.dataTable", 1.1, (1540, -320),
          {"resource": "row", "operation": "get", "dataTableId": s.table("editions"),
           "returnAll": False, "limit": 1, "orderBy": True, "orderByColumn": "date", "orderByDirection": "DESC"},
          executeOnce=True, alwaysOutputData=True)
    s.add("Read page template", "n8n-nodes-base.readWriteFile", 1.1, (1760, 0),
          {"operation": "read", "fileSelector": TEMPLATE_PATH, "options": {"dataPropertyName": "template"}},
          executeOnce=True, onError="continueErrorOutput",
          notes="The design lives in a file, so the page can change without re-importing this workflow.")
    s.add("Inject EDITION into page", "n8n-nodes-base.code", 2, (1980, -80), {"jsCode": code("inject-edition")})
    s.add("Return page", "n8n-nodes-base.respondToWebhook", 1.5, (2200, -80), html_response("={{ $json.html }}"))
    s.add("Template missing", "n8n-nodes-base.respondToWebhook", 1.5, (1980, 120),
          html_response(f"<p>The page template is missing: {TEMPLATE_PATH}</p>", 500))
    s.chain("GET /" + path, "Load latest edition", "Today's edition missing?")
    s.link("Today's edition missing?", "Load last page build", 0)
    s.link("Today's edition missing?", "Read page template", 1)
    s.link("Load last page build", "Tried in the last 10 min?")
    s.link("Tried in the last 10 min?", "Read page template", 0)
    s.link("Tried in the last 10 min?", "Note this build attempt", 1)
    s.chain("Note this build attempt", "Build today's edition now", "Load latest edition (after build)", "Read page template")
    s.link("Read page template", "Inject EDITION into page", 0)
    s.link("Read page template", "Template missing", 1)
    s.link("Inject EDITION into page", "Return page")
    s.write("10-serve-test.json" if test else "10-serve.json")


serve_flow()
serve_flow(test=True)


# ---------------------------------------------------------------- build
UA = {"parameters": [{"name": "User-Agent", "value": "aihot-api/2.0.0"}]}
FETCH = {"retryOnFail": True, "maxTries": 2, "waitBetweenTries": 2000, "onError": "continueRegularOutput",
         "executeOnce": True, "alwaysOutputData": True}
FETCH_EACH = {k: v for k, v in FETCH.items() if k != "executeOnce"}  # one request per input item
ONCE = {"executeOnce": True, "alwaysOutputData": True}

SYSTEM = """You are the editor of a one-page morning briefing for Song Haojie, an engineering student in Paris.
From the candidates, choose the 5 picks that matter most to the user today. Take them from AI news, Mail, Portfolio and Travel; today's classes can support a pick. Shopping is never one of the 5, so the candidates have no deals. There is big AI news most days, so 2 or 3 of the 5 come from AI news when the candidates have enough of it. Keep a place for a mail that needs action today and for a fare below its 7-day low. Mark a pick "act" only when it needs an action today, for example a mail that asks for a reply today. Otherwise mark it "know".
Compare every fare with its 7-day low. "low7" is the lowest price of the 7 days before today (today never counts), "lowDays" is how many of those days have a price, and "vsLow7" is the comparison, already computed: copy it, do not compute your own. When lowDays is under 7, write "N-day low" (for example "3-day low"); when low7 is null, write "no 7-day low yet". In a title, write the comparison with the low, for example "Tokyo round trip at €812, 3.1 % below its 7-day low".
Before you rank a news item that is not already a top story, you may call search_ai_news with one keyword to look for follow-ups or context. Skip the tool when it adds nothing.
Today's classes are in the candidates. When a pick depends on another date (a deadline, a sale day, an event), call lookup_courses with that date to check whether it clashes with a class.
Sort every mail candidate into "mail": need "act" when it asks the reader to do something soon (confirm, reply, book, pay), otherwise "later". Add "deadline" as a short date such as "Fri 6 Nov" only when the mail states one. A mail can also be a pick; its ref key is the exact subject. Mails with "isNew": false were already seen in the last run.
Market: 8 codes from the user's watchlist ("codesAre"); they are not holdings, so never call them holdings or "your" stocks. You see each code with its change at the last close, never amounts. The change is from the trading day in "lastClose": when that is not today, write "on Friday" (its weekday) or "at the last close", never "today". A code is a ticker, and "name" is the company or the index. "vs1m" compares the last close with the highest and lowest close of the 21 trading days before it, already computed: in a market pick, copy it as it is, never compute your own. Give at most 2 market picks, only for codes with "bigMove": true, the biggest moves first; call search_ai_news with the company name to look for a reason. Never give buy or sell advice.
Travel: Christmas round-trip fares from Paris, compared with "low7" and "vsLow7" in the same way ("lowFrom": "google" is the daily history from Google Flights, "log" is our own daily log). A fare below its low is worth a pick; call get_price_history with its "priceLogItem" to see the logged fares.
Report each pick honestly. "tool" is the tool you called for this pick, or "none". "result" is what the tool returned, in one sentence. The workflow records the exact call itself from n8n's execution log.
Use only facts from the candidates and the tool results. Never invent a URL, a price or a number.
"from" lists the blocks the pick relies on, using only these names: "AI news", "Courses", "Mail", "Portfolio", "Travel".
"ref" points to the item: {"block": "ai", "mail", "market" or "travel", "key": the exact candidate title, the mail subject, the stock code or the airport code}.
Give every pick a "key": a short phrase copied exactly from your title, such as a price, a date or a name; the page highlights it.
Titles are plain English, at most 12 words.
Call the tools you need first. Call format_final_json_response only once, as your last step, after you have every tool result.
In format_final_json_response, "output" is a JSON object, never a string. Every pick has at least kind, title, ref, tool and why. Give 5 picks."""

# The page is in English (the user's rule, 11-01): Chinese and French texts are translated before the agent sees them.
# No curly braces here: the chain reads them as template variables.
TRANSLATE_SYSTEM = """You translate short texts for an English morning briefing page. You get numbered lines in Chinese, French or English.
Translate each line into short, natural English.
Keep exactly as written: names of people, companies, brands and product models, merchants, accounts and room codes, and every number with its digits. Only Chinese amounts in 万 or 亿 may change form, for example 200 亿美元 becomes $20 billion and 1.25 万亿 becomes 1.25 trillion.
In a product title, translate the describing words around the brand and model, for example Écran becomes Display, To becomes TB, Go becomes GB, Puce becomes chip, cœurs becomes cores, Noir sidéral becomes Space Black, Veste becomes Jacket and Homme becomes Men's.
A line that is already English stays unchanged. Do not add, explain or leave out anything.
Answer with the same numbered lines, one per line, in the same order, and nothing else."""

# Only five fields are required: with a long required list, Claude Haiku 5.5 kept leaving one out and the
# parser rejected the whole answer (execution 257: 5 retries). The rest get defaults in Assemble EDITION.
# There is no "call" field: Assemble EDITION writes the call from the real tool calls in the execution.
# "deals" stays in the ref enum although the agent no longer sees deals (11-02): a stray deal pick is then
# dropped by Assemble EDITION instead of failing the parser.
PICKS_SCHEMA = json.dumps({
    "type": "object",
    "properties": {"picks": {"type": "array", "items": {
        "type": "object",
        "properties": {
            "kind": {"type": "string", "enum": ["act", "know"], "description": "act: needs an action today; know: worth knowing"},
            "title": {"type": "string", "description": "Plain English, at most 12 words"},
            "key": {"type": "string", "description": "A short phrase copied exactly from title, such as a price or a date"},
            "from": {"type": "array", "items": {"type": "string"}, "description": "Blocks the pick relies on"},
            "ref": {"type": "object", "properties": {"block": {"type": "string", "enum": ["ai", "deals", "mail", "market", "travel"]},
                                                     "key": {"type": "string", "description": "The exact candidate title, mail subject, stock code or airport code"}},
                    "required": ["block", "key"]},
            "tool": {"type": "string", "description": "search_ai_news, get_price_history, lookup_courses or none"},
            "why": {"type": "string", "description": "One sentence: why it matters today"},
            "input": {"type": "string", "description": "The candidate facts this pick starts from"},
            "result": {"type": "string", "description": "What the tool returned, in one sentence"},
            "decision": {"type": "string", "description": "What you decided from it"}},
        "required": ["kind", "title", "ref", "tool", "why"]}},
        "mail": {"type": "array", "items": {
            "type": "object",
            "properties": {"id": {"type": "string"}, "need": {"type": "string", "enum": ["act", "later"]},
                           "deadline": {"type": "string"}},
            "required": ["id", "need"]}}},
    "required": ["picks"]}, indent=1)

WATCHLIST = json.dumps({
    "newsKeywords": ["OpenAI", "Claude", "Anthropic", "Apple", "Tesla", "SpaceX", "Codex"],
    "memberOnly": "club\\+|infinity|membres|adhérent",
    "dealExclude": "coque|etui|étui|housse|protection|verre|film|câble|cable|chargeur|adaptateur|support|bracelet|reconditionn",
    # The user's watchlist since 11-01: two items. A title must match every "must" pattern and no "exclude" pattern,
    # and the price must be at least "minPrice" (accessories). "query" is the daily Google Shopping search (gl=fr).
    # "target" is the price under which buying is worth it; "listPrice" is the official price.
    "deals": [
        # The 14-inch with the touch PROLED XDR screen, M5 Pro. Google Shopping writes "Apple Pro 14" … MacBook", so
        # "macbook" and "pro" are matched apart. Earlier M5 Pro models have no PROLED screen. Target = the student price.
        {"label": "MacBook Pro 14 PROLED", "query": "MacBook Pro 14 M5 Pro PROLED",
         "must": ["macbook", "\\bpro\\b", "proled|oled|tactile|touch"],
         "exclude": "\\bm\\d+\\s*max\\b|\\b16\\s*(\"|''|”|pouces|po\\b|inch)|\\bm6\\b|occasion|sacoche|clavier",
         "minPrice": 2500, "target": 3129, "listPrice": 3299},
        # Men's jacket in black. "Black Sapphire" is a blue, so another colour word wins over "black". A title without
        # a colour, or without men's or women's, is kept and marked in "note"; such a row is never "act".
        # Target 520 = 20 % under the official 650 (the user's choice, 11-01).
        {"label": "Beta AR Jacket", "query": "Arc'teryx Beta AR Jacket homme noir",
         "must": ["beta\\s*ar\\b"],
         "exclude": "pant|pantalon|femme|women|\\bw'?s\\b|beta\\s*(lt|sl|sv)\\b|occasion",
         "colour": {"want": "noir|black",
                    "other": "sapphire|saphir|blanc|white|bleu|blue|rouge|red|vert|green|jaune|yellow|orange|gris|grey|gray|beige|marron|brown|violet|purple|rose|pink|kaki|khaki|navy|marine|olive|void|stone|solitude|dynasty|tatsu|forage|eden|euphoria|lodestar|délavé|bicolore"},
         "gender": "homme|\\bmen'?s?\\b|\\bm'?s\\b",
         "minPrice": 300, "target": 520, "listPrice": 650}],
    # The market board: 8 watchlist codes (the user's choice, 11-01), 8 being the free Twelve Data limit per minute.
    # The IBKR account is still read, but its one position is not shown. A move of 3 % or more is a big move.
    # SPCX = SpaceX, listed on Nasdaq on 2026-06-12. The names are for news searches; Twelve Data does not give them.
    "marketSymbols": ["QQQ", "AAPL", "MSFT", "GOOGL", "NVDA", "META", "TSLA", "SPCX"],
    "marketNames": {"QQQ": "Nasdaq-100 (Invesco QQQ)", "AAPL": "Apple", "MSFT": "Microsoft", "GOOGL": "Alphabet (Google)",
                    "NVDA": "Nvidia", "META": "Meta", "TSLA": "Tesla", "SPCX": "SpaceX"},
    "marketThreshold": 3,
    # Hotel price = the median nightly rate of 3-star+, 4.0+ hotels, hostels left out: the cheapest "3-star" results
    # were hostel beds (execution 300). Changing "tag" makes every city be searched again on the next run.
    "travel": {"origin": "CDG", "out": "2026-12-24", "back": "2027-01-03",
               "hotelFilter": {"minClass": 3, "minRating": 4, "tag": "median of 3-star+, 4.0+, no hostels"},
               "routes": [{"city": "New York", "code": "JFK"}, {"city": "Zurich", "code": "ZRH"},
                          {"city": "London", "code": "LHR"}, {"city": "Tokyo", "code": "HND"},
                          {"city": "Taipei", "code": "TPE"}]}}, indent=1)


def cond(left, op, right="", single=False, cid="c1"):
    operator = {"type": op[0], "operation": op[1]}
    if single:
        operator["singleValue"] = True
    return {"conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose", "version": 2},
                           "conditions": [{"id": cid, "leftValue": left, "rightValue": right, "operator": operator}],
                           "combinator": "and"},
            "looseTypeValidation": True, "options": {}}


def date_filter(expr, extra=None):
    conditions = [{"keyName": "date", "condition": "eq", "keyValue": expr}]
    return {"matchType": "allConditions", "filters": {"conditions": conditions + (extra or [])}}


def build_flow(test=False):
    wid, name, rebuild_path = (("DailyPageBuildT1", "Daily Page · test build (no model, test tables)", "rebuild-test") if test
                               else ("DailyPageBuild01", "Daily Page · 1 Build edition", "rebuild"))
    f = Flow(wid, name, test)
    # The test build waits 1 minute instead of 10, so several test runs fit in one sitting. The guard itself is the same.
    GUARD_MS = 60000 if test else 600000
    on = {k: test or bool(CREDENTIALS[k]) for k in ("gmail", "ibkr", "twelvedata", "serpapi")}
    sticky = lambda title, text, pos, w, h, color: f.add(title, "n8n-nodes-base.stickyNote", 1, pos,
                                                          {"content": f"## {title}\n{text}", "width": w, "height": h, "color": color})
    sticky("1 Trigger", "08:00 every day, or the Rebuild button. A rebuild within 10 minutes is refused (it costs model credit).", (-60, -260), 760, 560, 7)
    sticky("2 Fetch", "Each source retries once. A failed source never stops the run.", (740, -260), 2640, 560, 5)
    sticky("3 Decide", "Rules filter; the agent judges and calls tools per candidate.", (3420, -260), 760, 820, 4)
    sticky("4 Save and answer", "One row per day: a rebuild replaces it, never adds a second one.", (4220, -260), 1000, 820, 6)
    if any(on.values()):
        sticky("2 Fetch: my own accounts", "Each branch runs only when its credential exists. They sit above the main line: "
               "n8n runs the upper branch first, so their results are ready when the sources are checked.", (1100, -1180), 2480, 860, 5)

    if not test:
        f.add("Every day 08:00", "n8n-nodes-base.scheduleTrigger", 1.2, (0, -60), {"rule": {"interval": [{"triggerAtHour": 8}]}})
    f.add("POST /rebuild", "n8n-nodes-base.webhook", 2, (0, 120),
          {"httpMethod": "POST", "path": rebuild_path, "responseMode": "responseNode", "options": {}},
          notes="Called by the Rebuild button on the page (a plain form post).")
    f.add("Run context", "n8n-nodes-base.code", 2, (220, 40), {"jsCode": code("run-context")})
    f.add("My watchlist", "n8n-nodes-base.set", 3.4, (420, 40), {"mode": "raw", "jsonOutput": WATCHLIST, "options": {}},
          executeOnce=True, notes="News keywords, deal targets, chart codes and Christmas routes. Edit them here.")
    f.add("Load today's edition", "n8n-nodes-base.dataTable", 1.1, (620, 40),
          {"resource": "row", "operation": "get", "dataTableId": f.table("editions"),
           **date_filter("={{ $('Run context').first().json.date }}"), "returnAll": False, "limit": 1}, **ONCE)
    f.add("Rebuilt in the last 10 min?", "n8n-nodes-base.if", 2.2, (820, 40), cond(
        "={{ $('Run context').first().json.trigger === 'rebuild' && !!$json.updated_at && ($now.toMillis() - DateTime.fromISO($json.updated_at).toMillis()) < " + str(GUARD_MS) + " }}",
        ("boolean", "true"), single=True))
    f.add("Answer: too soon", "n8n-nodes-base.respondToWebhook", 1.5, (1020, -120), html_response(
        '<p>Today\'s page was rebuilt less than 10 minutes ago. <a href="/webhook/today">Back to the page</a></p>', 429))

    # Zeus: the ICS link works like a password, so it lives in the private config table, not on the canvas.
    zeus_url = (f"'{ZEUS_TEST_URL}'" if test else
                "(($('Load private config').all().find(i => i.json.key === 'zeus_ics_url') || {}).json || {}).value || ''")
    f.add("Load private config", "n8n-nodes-base.dataTable", 1.1, (1020, 60),
          {"resource": "row", "operation": "get", "dataTableId": f.table("config"), "returnAll": True}, **ONCE,
          notes="Private settings: the Zeus link (zeus_ics_url) and the IBKR Flex query ID (ibkr_flex_query_id).")
    f.add("Zeus link set?", "n8n-nodes-base.if", 2.2, (1220, 60),
          cond("={{ !!(" + zeus_url + ") }}", ("boolean", "true"), single=True), executeOnce=True)
    f.add("Zeus · timetable (ICS)", "n8n-nodes-base.httpRequest", 4.2, (1420, -60), {
        "url": "={{ " + zeus_url + " }}",
        "options": {"timeout": 15000, "response": {"response": {"responseFormat": "file", "outputPropertyName": "data"}}}}, **FETCH)
    f.add("Read Zeus events", "n8n-nodes-base.extractFromFile", 1.1, (1620, -60),
          {"operation": "fromIcs", "binaryPropertyName": "data", "destinationKey": "data", "options": {}},
          executeOnce=True, alwaysOutputData=True, onError="continueRegularOutput",
          notes="Extract From ICS. A login page instead of a calendar fails here.")

    # ---- my own accounts: one branch per source, each a dead end that the source check reads later.
    def fixture_or(name_, pos, fixture, real_params, cred_key, each=False, **extra):
        if test:
            # To rehearse a failed source (E6), put the node names in the test config table: key test_fail.
            failing = ("const failing = String((($('Load private config').all().find((i) => i.json.key === 'test_fail') || {}).json || {}).value || '')"
                       ".split(',').map((s) => s.trim());\n"
                       "if (failing.includes(" + json.dumps(name_) + ")) return [{ json: { error: { message: 'Request failed with status code 401', httpCode: '401' } } }];\n")
            return f.add(name_, "n8n-nodes-base.code", 2, pos, {"jsCode": failing + code(fixture)},
                         notes="TEST ONLY: fixed data in the API's shape, or HTTP 401 when named in test_fail.")
        return f.add(name_, "n8n-nodes-base.httpRequest", 4.2, pos, real_params, credentials=cred(cred_key),
                     **(FETCH_EACH if each else FETCH), **extra)
    query_auth = {"authentication": "genericCredentialType", "genericAuthType": "httpQueryAuth"}
    if on["gmail"]:
        gmail_api = "https://gmail.googleapis.com/gmail/v1/users/me/messages"
        fixture_or("Gmail · list last 24h", (1220, -1000), "test-fixture-gmail-list", {
            "url": gmail_api, "authentication": "predefinedCredentialType", "nodeCredentialType": "googleOAuth2Api",
            "sendQuery": True, "queryParameters": {"parameters": [{"name": "q", "value": "newer_than:1d"}, {"name": "maxResults", "value": "40"}]},
            "options": {"timeout": 15000}}, "gmail",
            notes="My own Google account, scope gmail.readonly only.")
        f.add("Mail ids", "n8n-nodes-base.code", 2, (1420, -1000), {"jsCode": code("mail-ids")})
        fixture_or("Gmail · read headers", (1620, -1000), "test-fixture-gmail-read", {
            "url": "={{ '" + gmail_api + "/' + $json.id + '?format=metadata&metadataHeaders=From&metadataHeaders=Subject' }}",
            "authentication": "predefinedCredentialType", "nodeCredentialType": "googleOAuth2Api",
            "options": {"timeout": 15000}}, "gmail", each=True,
            notes="Sender and subject only, never the body.")
    if on["twelvedata"]:
        if on["ibkr"]:
            flex = "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/"
            text = {"timeout": 20000, "response": {"response": {"responseFormat": "text", "outputPropertyName": "data"}}}
            ua = {"sendHeaders": True, "headerParameters": {"parameters": [{"name": "User-Agent", "value": "daily-page-n8n/1.0"}]}}
            fixture_or("IBKR · request statement", (1220, -800), "test-fixture-ibkr-send", {
                "url": flex + "SendRequest", **query_auth, "sendQuery": True,
                "queryParameters": {"parameters": [
                    {"name": "q", "value": "={{ (($('Load private config').all().find(i => i.json.key === 'ibkr_flex_query_id') || {}).json || {}).value || '' }}"},
                    {"name": "v", "value": "3"}]}, **ua, "options": text}, "ibkr",
                notes="Flex Web Service, read-only token. The query ID is in the config table (ibkr_flex_query_id).")
            wait = 1 if test else 10
            f.add("IBKR · wait for report", "n8n-nodes-base.wait", 1.1, (1420, -800), {"amount": wait, "unit": "seconds"})
            get_params = {"url": flex + "GetStatement", **query_auth, "sendQuery": True,
                          "queryParameters": {"parameters": [
                              {"name": "q", "value": "={{ ($('IBKR · request statement').first().json.data || '').match(/<ReferenceCode>(\\d+)</)?.[1] || '' }}"},
                              {"name": "v", "value": "3"}]}, **ua, "options": text}
            fixture_or("IBKR · get statement", (1620, -800), "test-fixture-ibkr-pending", get_params, "ibkr")
            f.add("Still generating?", "n8n-nodes-base.if", 2.2, (1820, -800), cond_true(
                "/<ErrorCode>(1001|1004|1005|1006|1007|1008|1009|1018|1019|1021)<\\/ErrorCode>/.test(String($json.data || ''))"),
                  executeOnce=True, notes="IBKR answers 1019 (and a few other codes) while the report is being made: wait and ask once more.")
            f.add("IBKR · wait again", "n8n-nodes-base.wait", 1.1, (2020, -900), {"amount": 2 if test else 20, "unit": "seconds"})
            fixture_or("IBKR · get statement (retry)", (2220, -900), "test-fixture-ibkr-statement", get_params, "ibkr")
        f.add("Watchlist codes (IBKR counted)", "n8n-nodes-base.code", 2, (2420, -800), {"jsCode": code("read-positions")},
              notes="The 8 watchlist codes to chart. IBKR positions are only counted: no code, weight, quantity or amount goes further.")
        fixture_or("Twelve Data · daily candles", (2620, -800), "test-fixture-twelvedata", {
            "url": "https://api.twelvedata.com/time_series", **query_auth, "sendQuery": True,
            "queryParameters": {"parameters": [{"name": "symbol", "value": "={{ $json.symbol }}"},
                                               {"name": "interval", "value": "1day"}, {"name": "outputsize", "value": "30"}]},
            "options": {"timeout": 15000}}, "twelvedata", each=True,
            notes="One request per code, at most 8: the free plan allows 8 a minute.")
    if on["serpapi"]:
        for n_, key_, x_ in (("Load travel cache", "travel", 1220), ("Load shopping cache", "shopping", 1420)):
            f.add(n_, "n8n-nodes-base.dataTable", 1.1, (x_, -600),
                  {"resource": "row", "operation": "get", "dataTableId": f.table("source_cache"), "matchType": "allConditions",
                   "filters": {"conditions": [{"keyName": "source", "condition": "eq", "keyValue": key_}]},
                   "returnAll": False, "limit": 1}, **ONCE)
        fixture_or("SerpApi · this month", (1620, -600), "test-fixture-serpapi-usage", {
            "url": "https://serpapi.com/account.json", **query_auth, "options": {"timeout": 15000}}, "serpapi",
            notes="Searches left this month, read before any search (free call). This run's searches are added to the count.")
        f.add("SerpApi plan", "n8n-nodes-base.code", 2, (1820, -600), {"jsCode": code("serpapi-plan")},
              notes="250 searches a month. Flights, then Google Shopping, then hotels; at least 15 are kept for later. "
                    "A search made earlier today is never repeated, so a rebuild costs 0 searches.")
        f.add("Search flights?", "n8n-nodes-base.if", 2.2, (2020, -600),
              cond_true("$('SerpApi plan').first().json.flights === true"), executeOnce=True)
        f.add("Routes to search", "n8n-nodes-base.code", 2, (2220, -680), {"jsCode": code("routes-to-search")})
        serp = {"url": "https://serpapi.com/search.json", **query_auth, "sendQuery": True}
        fixture_or("SerpApi · flights", (2420, -680), "test-fixture-serpapi-flights", {**serp,
            "queryParameters": {"parameters": [
                {"name": "engine", "value": "google_flights"}, {"name": "departure_id", "value": "={{ $json.from }}"},
                {"name": "arrival_id", "value": "={{ $json.code }}"}, {"name": "outbound_date", "value": "={{ $json.out }}"},
                {"name": "return_date", "value": "={{ $json.back }}"}, {"name": "currency", "value": "EUR"},
                {"name": "hl", "value": "en"}]}, "options": {"timeout": 30000}}, "serpapi", each=True)
        f.add("Search shopping?", "n8n-nodes-base.if", 2.2, (2620, -600),
              cond_true("$('SerpApi plan').first().json.shopping === true"), executeOnce=True)
        f.add("Products to search", "n8n-nodes-base.code", 2, (2820, -680), {"jsCode": code("products-to-search")})
        fixture_or("SerpApi · shopping", (3020, -680), "test-fixture-serpapi-shopping", {**serp,
            "queryParameters": {"parameters": [
                {"name": "engine", "value": "google_shopping"}, {"name": "q", "value": "={{ $json.q }}"},
                {"name": "gl", "value": "fr"}, {"name": "hl", "value": "fr"}]}, "options": {"timeout": 30000}}, "serpapi", each=True,
            notes="One search per watchlist item, once a day. New prices only: used and refurbished offers are left out later.")
        f.add("Hotels due this week", "n8n-nodes-base.code", 2, (3220, -600), {"jsCode": code("hotels-due")})
        fixture_or("SerpApi · hotels", (3420, -600), "test-fixture-serpapi-hotels", {**serp,
            "queryParameters": {"parameters": [
                {"name": "engine", "value": "google_hotels"}, {"name": "q", "value": "={{ $json.city + ' hotels' }}"},
                {"name": "check_in_date", "value": "={{ $json.out }}"}, {"name": "check_out_date", "value": "={{ $json.back }}"},
                {"name": "adults", "value": "1"}, {"name": "currency", "value": "EUR"}, {"name": "hl", "value": "en"},
                {"name": "hotel_class", "value": "3,4,5"}, {"name": "rating", "value": "8"}]},
            "options": {"timeout": 30000}}, "serpapi", each=True,
            notes="3 stars or more, rated 4.0 or more (rating=8), Google's usual order. The price used is the median, hostels left out.")
    f.shift = (1020, 1000)

    http = lambda n, url, q, pos: f.add(n, "n8n-nodes-base.httpRequest", 4.2, pos, {
        "url": url, "sendQuery": bool(q), "queryParameters": {"parameters": [{"name": k, "value": v} for k, v in q]},
        "sendHeaders": True, "headerParameters": UA, "options": {"timeout": 15000}}, **FETCH)
    http("AIHOT · hot topics", "https://aihot.news/api/v1/hot-topics", [], (1020, 60))
    http("AIHOT · last 24h", "https://aihot.news/api/v1/items", [("window", "24h"), ("limit", "100")], (1220, 60))
    http("AIHOT · Codex resets", "https://aihot.news/api/v1/codex-resets/recent", [], (1420, 60))
    feeds = [("Dealabs · Apple", "apple"), ("Dealabs · sportswear", "vetements-de-sport"),
             ("Dealabs · fashion", "mode"), ("Dealabs · hiking", "randonnee")]
    for i, (n, g) in enumerate(feeds):
        f.add(n, "n8n-nodes-base.rssFeedRead", 1.2, (1620 + 200 * i, 60),
              {"url": f"https://www.dealabs.com/rss/groupe/{g}", "options": {"customFields": "pepper:merchant"}}, **FETCH)
    f.add("Load source cache", "n8n-nodes-base.dataTable", 1.1, (1620, 300),
          {"resource": "row", "operation": "get", "dataTableId": f.table("source_cache"), "returnAll": True}, **ONCE)
    f.add("Load yesterday's edition", "n8n-nodes-base.dataTable", 1.1, (1820, 300),
          {"resource": "row", "operation": "get", "dataTableId": f.table("editions"),
           **date_filter("={{ $('Run context').first().json.yesterday }}"), "returnAll": False, "limit": 1}, **ONCE)
    # The whole price log (about 10 rows a day): the "day" column is text, so the 7-day window is cut in code.
    f.add("Load price log", "n8n-nodes-base.dataTable", 1.1, (1920, 460),
          {"resource": "row", "operation": "get", "dataTableId": f.table("price_history"), "returnAll": True}, **ONCE)
    f.add("Check sources and use cache", "n8n-nodes-base.code", 2, (2020, 300), {"jsCode": code("check-sources")},
          notes="Failure case: a source that failed twice is shown from cache and marked stale.")
    f.add("Cache rows", "n8n-nodes-base.code", 2, (2220, 460), {"jsCode": code("cache-rows")})
    f.add("Save source cache", "n8n-nodes-base.dataTable", 1.1, (2420, 460),
          {"resource": "row", "operation": "upsert", "dataTableId": f.table("source_cache"), "matchType": "allConditions",
           "filters": {"conditions": [{"keyName": "source", "condition": "eq", "keyValue": "={{ $json.source }}"}]},
           "columns": {"mappingMode": "autoMapInputData", "value": None}, "options": {}})
    # Placed above "Pick candidates": n8n runs the upper branch first, so the timetable is saved before the agent asks.
    f.add("Timetable rows", "n8n-nodes-base.code", 2, (2220, -120), {"jsCode": code("timetable-rows")})
    f.add("Save timetable (upsert by day)", "n8n-nodes-base.dataTable", 1.1, (2420, -120),
          {"resource": "row", "operation": "upsert", "dataTableId": f.table("timetable"), "matchType": "allConditions",
           "filters": {"conditions": [{"keyName": "day", "condition": "eq", "keyValue": "={{ $json.day }}"}]},
           "columns": {"mappingMode": "autoMapInputData", "value": None}, "options": {}},
          notes="Next 14 days, one row per day. lookup_courses reads this table.")

    f.add("Pick candidates", "n8n-nodes-base.code", 2, (2240, 40), {"jsCode": code("prepare-agent-input")},
          notes="Plain rules: keyword match, cheapest deal per watchlist item, news already seen yesterday.")
    f.add("Text to translate", "n8n-nodes-base.code", 2, (2240, 180), {"jsCode": code("text-to-translate")},
          notes="The Chinese and French texts the page will show: news titles, Codex line, deal titles, mail subjects, classes.")
    f.add("Anything to translate?", "n8n-nodes-base.if", 2.2, (2360, 180), cond_true("$json.strings.length > 0"), executeOnce=True)
    if test:
        f.add("Translate to English", "n8n-nodes-base.code", 2, (2480, 180), {"jsCode": code("test-fixture-translate")},
              notes="TEST ONLY: fixed answer in the model's format, no model call.")
    else:
        f.add("Translate to English", "@n8n/n8n-nodes-langchain.chainLlm", 1.7, (2480, 180), {
            "promptType": "define",
            "text": "={{ $json.strings.map((s, k) => (k + 1) + '. ' + s.replace(/[{}]/g, ' ').replace(/\\s+/g, ' ')).join('\\n') }}",
            "messages": {"messageValues": [{"type": "SystemMessagePromptTemplate", "message": TRANSLATE_SYSTEM}]}},
              retryOnFail=True, maxTries=2, waitBetweenTries=3000, onError="continueRegularOutput", alwaysOutputData=True,
              notes="One model call translates every Chinese and French text the page shows. A failed call keeps the originals.")
        f.add("Claude Haiku 5.5 (translate)", "@n8n/n8n-nodes-langchain.lmChatAnthropic", 1.6, (2480, 340),
              {"model": {"__rl": True, "mode": "id", "value": "claude-haiku-5-5"},
               "options": {"maxTokensToSample": 4096, "thinkingMode": "disabled"}},
              credentials=cred("anthropic"), notes="Used only to translate.")
        f.link("Claude Haiku 5.5 (translate)", "Translate to English", kind="ai_languageModel")
    f.add("English text", "n8n-nodes-base.code", 2, (2600, 180), {"jsCode": code("english-text")},
          notes="Checks each translation: one line per text, no Chinese left, every number kept. Otherwise the original stays.")
    f.add("Prepare agent input", "n8n-nodes-base.code", 2, (2560, 40), {"jsCode": code("apply-english")},
          notes="Puts the English texts into the candidates (originals kept beside them) and writes the agent's prompt.")
    f.add("Price rows", "n8n-nodes-base.code", 2, (2680, 300), {"jsCode": code("price-rows")})
    f.add("Save today's prices", "n8n-nodes-base.dataTable", 1.1, (2880, 300),
          {"resource": "row", "operation": "upsert", "dataTableId": f.table("price_history"), "matchType": "allConditions",
           "filters": {"conditions": [{"keyName": "item", "condition": "eq", "keyValue": "={{ $json.item }}"},
                                      {"keyName": "day", "condition": "eq", "keyValue": "={{ $json.day }}"}]},
           "columns": {"mappingMode": "autoMapInputData", "value": None}, "options": {}})
    if test:
        f.add("Editor agent", "n8n-nodes-base.code", 2, (2680, 40), {"jsCode": code("test-fixture-agent")},
              notes="TEST ONLY: fixed picks, no model call.")
        # A Zeus-like calendar served by this test workflow, so the real HTTP and ICS nodes run without the user's link.
        f.add("GET /zeus-fixture", "n8n-nodes-base.webhook", 2, (0, 700),
              {"httpMethod": "GET", "path": "zeus-fixture", "responseMode": "responseNode", "options": {}})
        f.add("Fixture timetable", "n8n-nodes-base.code", 2, (220, 700), {"jsCode": code("test-fixture-timetable")})
        f.add("Return fixture ICS", "n8n-nodes-base.respondToWebhook", 1.5, (440, 700),
              {"respondWith": "text", "responseBody": "={{ $json.ics }}",
               "options": {"responseHeaders": {"entries": [{"name": "content-type", "value": "text/calendar; charset=utf-8"}]}}})
        f.chain("GET /zeus-fixture", "Fixture timetable", "Return fixture ICS")
    else:
        f.add("Editor agent", "@n8n/n8n-nodes-langchain.agent", 3.1, (2680, 40), {
            "promptType": "define", "text": "={{ $json.prompt }}", "hasOutputParser": True,
            "options": {"systemMessage": SYSTEM, "maxIterations": 10, "returnIntermediateSteps": True}},
              retryOnFail=True, maxTries=2, waitBetweenTries=3000, onError="continueErrorOutput",
              notes="Decides the five picks and which check each candidate needs. Retries once if the answer has the wrong format.")
        # Thinking is off on purpose: on a parallel tool call, n8n replays Claude's thinking block once per tool call,
        # and Claude Haiku 5.5 rejects edited history that carries thinking blocks (accounts created from 2026-08-31).
        # No temperature: Claude Haiku 5.5 rejects non-default sampling values.
        f.add("Claude Haiku 5.5", "@n8n/n8n-nodes-langchain.lmChatAnthropic", 1.6, (2560, 300),
              {"model": {"__rl": True, "mode": "id", "value": "claude-haiku-5-5"},
               "options": {"maxTokensToSample": 8192, "thinkingMode": "disabled"}},
              credentials=cred("anthropic"),
              notes="My own Anthropic key (credential Anthropic (own)), with a spend limit set in the Anthropic Console.")
        f.add("search_ai_news", "n8n-nodes-base.httpRequestTool", 4.2, (2700, 300), {
            "toolDescription": "Search AI and tech news from the last 24 hours on AIHOT. Input: one keyword such as a company or product name. Returns up to 5 items with title and summary.",
            "url": "https://aihot.news/api/v1/items", "sendQuery": True,
            "queryParameters": {"parameters": [
                {"name": "q", "value": "={{ $fromAI('keyword', 'One company, product or topic name, for example Tesla', 'string') }}"},
                {"name": "window", "value": "24h"}, {"name": "limit", "value": "5"}]},
            "sendHeaders": True, "headerParameters": UA, "options": {"timeout": 15000}})
        f.add("get_price_history", "n8n-nodes-base.dataTableTool", 1.1, (2840, 300), {
            "descriptionType": "manual",
            "toolDescription": "Return the logged daily prices for one item, newest first. Each row is the lowest price found that day and the merchant that had it (source); the merchant can change from one day to the next. Input: a flight such as Flight CDG-HND.",
            "resource": "row", "operation": "get", "dataTableId": f.table("price_history"), "matchType": "allConditions",
            "filters": {"conditions": [{"keyName": "item", "condition": "eq",
                                        "keyValue": "={{ $fromAI('item', 'Watchlist label or flight, for example AirPods or Flight CDG-HND', 'string') }}"}]},
            "returnAll": False, "limit": 30, "orderBy": True, "orderByColumn": "day", "orderByDirection": "DESC"})
        f.add("lookup_courses", "n8n-nodes-base.dataTableTool", 1.1, (3120, 460), {
            "descriptionType": "manual",
            "toolDescription": "Return the classes on one date from the Zeus timetable. Input: the date as yyyy-MM-dd. The classes field is a JSON list of {time, title, where}; an empty list means no class that day. No row means the date is outside the next 14 days.",
            "resource": "row", "operation": "get", "dataTableId": f.table("timetable"), "matchType": "allConditions",
            "filters": {"conditions": [{"keyName": "day", "condition": "eq",
                                        "keyValue": "={{ $fromAI('date', 'The date to check, as yyyy-MM-dd, for example 2026-11-03', 'string') }}"}]},
            "returnAll": False, "limit": 1})
        # Auto-fix: when the answer has the wrong format (most often "output" given as a JSON string), the parser
        # asks a model once to repair it, instead of the whole agent running again (CONTRACT §8.11).
        f.add("Picks format", "@n8n/n8n-nodes-langchain.outputParserStructured", 1.3, (2980, 300),
              {"schemaType": "manual", "inputSchema": PICKS_SCHEMA, "autoFix": True},
              notes="Checks the agent's answer against the picks schema. Wrong format: one repair call, then the agent retries.")
        f.add("Claude Haiku 5.5 (fix format)", "@n8n/n8n-nodes-langchain.lmChatAnthropic", 1.6, (2980, 460),
              {"model": {"__rl": True, "mode": "id", "value": "claude-haiku-5-5"},
               "options": {"maxTokensToSample": 8192, "thinkingMode": "disabled"}},
              credentials=cred("anthropic"), notes="Used only when the answer's format is wrong.")
        f.link("Claude Haiku 5.5", "Editor agent", kind="ai_languageModel")
        f.link("search_ai_news", "Editor agent", kind="ai_tool")
        f.link("get_price_history", "Editor agent", kind="ai_tool")
        f.link("lookup_courses", "Editor agent", kind="ai_tool")
        f.link("Picks format", "Editor agent", kind="ai_outputParser")
        f.link("Claude Haiku 5.5 (fix format)", "Picks format", kind="ai_languageModel")

    f.add("Has picks?", "n8n-nodes-base.if", 2.2, (3280, 40), cond(
        "={{ ((($json.output || {}).picks) || ((($json.output || {}).output || {}).picks) || []).length }}", ("number", "gt"), 0))
    f.add("Assemble EDITION", "n8n-nodes-base.code", 2, (3480, -60), {"jsCode": code("assemble-edition")})
    f.add("Save edition (upsert by date)", "n8n-nodes-base.dataTable", 1.1, (3680, -60),
          {"resource": "row", "operation": "upsert", "dataTableId": f.table("editions"), **date_filter("={{ $json.date }}"),
           "columns": {"mappingMode": "autoMapInputData", "value": None}, "options": {}},
          notes="Upsert by date: running twice still leaves one row for today.")
    f.add("Started by Rebuild?", "n8n-nodes-base.if", 2.2, (3880, -60),
          cond("={{ $('Run context').first().json.trigger === 'rebuild' }}", ("boolean", "true"), single=True))
    f.add("Answer: back to the page", "n8n-nodes-base.respondToWebhook", 1.5, (4080, -60),
          {"respondWith": "redirect",
           # n8n turns a relative Location into "https:///...", so build an absolute URL from the request's Host.
           "redirectURL": "={{ 'http://' + $('POST /rebuild').first().json.headers.host + '/webhook/" + ("today-test" if test else "today") + "' }}",
           "options": {"responseCode": 303}})
    f.add("Keep the last edition", "n8n-nodes-base.code", 2, (3480, 200), {"jsCode": code("keep-last-edition")},
          notes="Never publish an empty page: if the agent fails or picks nothing, yesterday's page stays.")
    f.add("Started by Rebuild? (no edition)", "n8n-nodes-base.if", 2.2, (3680, 200),
          cond("={{ $('Run context').first().json.trigger === 'rebuild' }}", ("boolean", "true"), single=True))
    f.add("Answer: why nothing changed", "n8n-nodes-base.respondToWebhook", 1.5, (3880, 200), html_response("={{ $json.html }}", 502))

    if not test:
        f.link("Every day 08:00", "Run context")
    f.link("POST /rebuild", "Run context")
    f.chain("Run context", "My watchlist", "Load today's edition", "Rebuilt in the last 10 min?")
    f.link("Rebuilt in the last 10 min?", "Answer: too soon", 0)
    f.link("Rebuilt in the last 10 min?", "Load private config", 1)
    # Branches for my own accounts start here too; each ends on its own, and the main line reads them later.
    if on["gmail"]:
        f.link("Load private config", "Gmail · list last 24h")
        f.chain("Gmail · list last 24h", "Mail ids", "Gmail · read headers")
    if on["twelvedata"]:
        if on["ibkr"]:
            f.link("Load private config", "IBKR · request statement")
            f.chain("IBKR · request statement", "IBKR · wait for report", "IBKR · get statement", "Still generating?")
            f.link("Still generating?", "IBKR · wait again", 0)
            f.link("Still generating?", "Watchlist codes (IBKR counted)", 1)
            f.chain("IBKR · wait again", "IBKR · get statement (retry)", "Watchlist codes (IBKR counted)")
        else:
            f.link("Load private config", "Watchlist codes (IBKR counted)")
        f.link("Watchlist codes (IBKR counted)", "Twelve Data · daily candles")
    if on["serpapi"]:
        f.link("Load private config", "Load travel cache")
        f.chain("Load travel cache", "Load shopping cache", "SerpApi · this month", "SerpApi plan", "Search flights?")
        f.link("Search flights?", "Routes to search", 0)
        f.link("Search flights?", "Search shopping?", 1)
        f.chain("Routes to search", "SerpApi · flights", "Search shopping?")
        f.link("Search shopping?", "Products to search", 0)
        f.link("Search shopping?", "Hotels due this week", 1)
        f.chain("Products to search", "SerpApi · shopping", "Hotels due this week", "SerpApi · hotels")
    f.link("Load private config", "Zeus link set?")
    f.link("Zeus link set?", "Zeus · timetable (ICS)", 0)
    f.link("Zeus link set?", "AIHOT · hot topics", 1)
    f.chain("Zeus · timetable (ICS)", "Read Zeus events", "AIHOT · hot topics")
    f.chain("AIHOT · hot topics", "AIHOT · last 24h", "AIHOT · Codex resets", *[n for n, _ in feeds],
            "Load source cache", "Load yesterday's edition", "Load price log", "Check sources and use cache")
    f.link("Check sources and use cache", "Timetable rows")
    f.chain("Timetable rows", "Save timetable (upsert by day)")
    f.link("Check sources and use cache", "Cache rows")
    f.link("Check sources and use cache", "Pick candidates")
    f.chain("Pick candidates", "Text to translate", "Anything to translate?")
    f.link("Anything to translate?", "Translate to English", 0)
    f.link("Anything to translate?", "Prepare agent input", 1)
    f.chain("Translate to English", "English text", "Prepare agent input")
    f.link("Cache rows", "Save source cache")
    f.link("Prepare agent input", "Price rows")
    f.link("Prepare agent input", "Editor agent")
    f.link("Price rows", "Save today's prices")
    f.link("Editor agent", "Has picks?", 0)
    if not test:
        f.link("Editor agent", "Keep the last edition", 1)
    f.link("Has picks?", "Assemble EDITION", 0)
    f.link("Has picks?", "Keep the last edition", 1)
    f.chain("Assemble EDITION", "Save edition (upsert by date)", "Started by Rebuild?")
    f.link("Started by Rebuild?", "Answer: back to the page", 0)
    f.chain("Keep the last edition", "Started by Rebuild? (no edition)")
    f.link("Started by Rebuild? (no edition)", "Answer: why nothing changed", 0)
    f.write("20-build-test.json" if test else "20-build.json")


build_flow()
build_flow(test=True)


# ---------------------------------------------------------------- test tables
# Creates the test tables (t1_*) once; the test build and test page use only these.
setup = Flow("DailyPageSetupT1", "Daily Page · 0 Setup test tables", test=True)
setup.add("GET /daily-page-setup-test", "n8n-nodes-base.webhook", 2, (0, 0),
          {"httpMethod": "GET", "path": "daily-page-setup-test", "responseMode": "lastNode", "options": {}})
previous = "GET /daily-page-setup-test"
for i, (tname, cols) in enumerate(TABLES.items()):
    n = setup.add(f"Create table {TEST_NAMES[tname]}", "n8n-nodes-base.dataTable", 1.1, (220 + 220 * i, 0),
                  {"resource": "table", "operation": "create", "tableName": TEST_NAMES[tname],
                   "columns": {"column": [{"name": c, "type": t} for c, t in cols]}, "options": {"createIfNotExists": True}})
    setup.link(previous, n)
    previous = n
setup.write("05-setup-test-tables.json")

# Empties every test table (t1_*) after a test. It never touches the real tables.
clean = Flow("DailyPageCleanT1", "Daily Page · test cleanup (test tables only)", test=True)
clean.add("GET /daily-page-clean-test", "n8n-nodes-base.webhook", 2, (0, 0),
          {"httpMethod": "GET", "path": "daily-page-clean-test", "responseMode": "lastNode", "options": {}})
previous = "GET /daily-page-clean-test"
for i, (tname, cols) in enumerate(TABLES.items()):
    n = clean.add(f"Empty {TEST_NAMES[tname]}", "n8n-nodes-base.dataTable", 1.1, (220 + 220 * i, 0),
                  {"resource": "row", "operation": "deleteRows", "dataTableId": clean.table(tname), "matchType": "allConditions",
                   "filters": {"conditions": [{"keyName": cols[0][0], "condition": "isNotEmpty"}]}, "options": {}}, **ONCE)
    clean.link(previous, n)
    previous = n
clean.write("90-clean-test.json")
