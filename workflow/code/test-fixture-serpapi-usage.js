// TEST ONLY. Stands in for SerpApi account.json (this call is free).
// To rehearse the quota guard, put a number in the test config table: key test_quota_left.
const set = (($('Load private config').all().find((i) => i.json.key === 'test_quota_left') || {}).json || {}).value;
const left = set != null && set !== '' ? Number(set) : 209;
return [{ json: { this_month_usage: 250 - left, searches_per_month: 250, plan_searches_left: left } }];
