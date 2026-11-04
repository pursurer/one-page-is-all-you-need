// TEST ONLY. Stands in for Twelve Data time_series: 30 daily candles per code, newest first.
// TSLA closes under its 1-month low and SPCX over its 1-month high, so both texts are tested.
// To rehearse one code failing, put it in the test config table: key test_fail_symbol (Twelve Data's error shape).
const failingSymbols = String((($('Load private config').all().find((i) => i.json.key === 'test_fail_symbol') || {}).json || {}).value || '');
return $input.all().map((i, k) => {
  const symbol = i.json.symbol;
  if (failingSymbols.split(',').map((x) => x.trim()).includes(symbol)) {
    return { json: { code: 404, message: '**symbol** not found: ' + symbol + '. Please specify it correctly', status: 'error' } };
  }
  const base = [690, 345, 520, 280, 205, 615, 400, 135][k % 8];
  const values = Array.from({ length: 30 }, (_, d) => {
    let c = base * (1 + 0.02 * Math.sin((d + k) / 3) - 0.001 * d);
    if (d === 0 && symbol === 'TSLA') c = base * 0.95;
    if (d === 0 && symbol === 'SPCX') c = base * 1.06;
    const day = $now.setZone('Europe/Paris').minus({ days: d + 1 }).toFormat('yyyy-MM-dd');
    return { datetime: day, open: (c * 0.995).toFixed(2), high: (c * 1.01).toFixed(2), low: (c * 0.985).toFixed(2), close: c.toFixed(2), volume: '1000' };
  });
  return { json: { meta: { symbol, interval: '1day' }, values, status: 'ok' } };
});
