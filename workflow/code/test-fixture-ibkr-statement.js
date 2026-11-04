// TEST ONLY. Stands in for the second GetStatement: open positions, including quantity and value
// attributes, so the test shows that "Watchlist codes (IBKR counted)" drops them.
const row = (s, w, qty, value) => `<OpenPosition accountId="U0000000" currency="USD" assetCategory="STK" symbol="${s}" description="${s}" position="${qty}" markPrice="1" positionValue="${value}" percentOfNAV="${w}" levelOfDetail="SUMMARY" />`;
return [{ json: { data: '<FlexQueryResponse queryName="daily-page-positions" type="AF"><FlexStatements count="1"><FlexStatement accountId="U0000000"><OpenPositions>' +
  [row('AAPL', 31.5, 40, 9200), row('NVDA', 24.2, 50, 7100), row('QQQ', 22.8, 12, 6700), row('TSLA', 12.1, 15, 3550)].join('') +
  '</OpenPositions></FlexStatement></FlexStatements></FlexQueryResponse>' } }];
