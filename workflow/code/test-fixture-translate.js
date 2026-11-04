// TEST ONLY. Stands in for the translation call, in its answer format (numbered lines, one per text).
// Chinese characters become "~", so the plumbing and the number check run without a model call.
const strings = $('Text to translate').first().json.strings;
return [{ json: { text: strings.map((s, k) => (k + 1) + '. [EN] ' + s.replace(/[㐀-鿿＀-￯]+/g, '~')).join('\n') } }];
