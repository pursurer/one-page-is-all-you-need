// TEST ONLY. Stands in for the Gmail list call: same shape as users.messages.list.
return [{ json: { messages: ['fixture-m1', 'fixture-m2', 'fixture-m3', 'fixture-m4', 'fixture-m5'].map((id) => ({ id, threadId: id })), resultSizeEstimate: 5 } }];
