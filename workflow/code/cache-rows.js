// One row per source that answered today. Failed sources keep their old cache row.
return $('Check sources and use cache').first().json.cacheUpdates.map((row) => ({ json: row }));
