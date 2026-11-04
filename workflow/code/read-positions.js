// The market board shows the 8 watchlist codes (the user's choice, 11-01). The IBKR statement is still read,
// but its positions are only counted: no code, weight, quantity or amount leaves this node,
// so nothing from the account is cached, logged, shown or sent to the model.
const watch = $('My watchlist').first().json;
const ran = (n) => { try { return $(n).isExecuted; } catch (e) { return false; } };
const ibkr = { connected: ran('IBKR · request statement'), positions: null, error: null };
if (ibkr.connected) {
  const text = (n) => String(($(n).first().json || {}).data || '');
  const statement = text(ran('IBKR · get statement (retry)') ? 'IBKR · get statement (retry)' : 'IBKR · get statement');
  const errorCode = (s) => (s.match(/<ErrorCode>(\d+)<\/ErrorCode>/) || [])[1];
  ibkr.error = errorCode(text('IBKR · request statement')) || errorCode(statement) ||
    (/<FlexQueryResponse/.test(statement) ? null : 'no statement');
  if (!ibkr.error) {
    // A query can list one row per lot as well as the summary; count each code once.
    const codes = new Set();
    for (const m of statement.matchAll(/<OpenPosition\b([^>]*?)\/?>/g)) {
      const a = {};
      for (const x of m[1].matchAll(/(\w+)="([^"]*)"/g)) a[x[1]] = x[2];
      if (a.symbol && (!a.levelOfDetail || a.levelOfDetail === 'SUMMARY')) codes.add(a.symbol);
    }
    ibkr.positions = codes.size;
  }
}
return watch.marketSymbols.slice(0, 8).map((symbol) => ({ json: { symbol, name: (watch.marketNames || {})[symbol] || null, ibkr } }));
