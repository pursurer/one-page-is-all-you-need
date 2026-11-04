// TEST ONLY. Stands in for SerpApi Google Shopping (gl=fr, hl=fr), in its shape, with titles seen on 11-01.
// Each list has offers the rules must leave out: no touch screen, M5 Max, 16-inch, used or refurbished,
// women's, Beta LT/SL, another colour ("Black Sapphire" is a blue), and too cheap to be the product.
const offer = (title, price, source, used) => ({ title, extracted_price: price, price: price + ' €', source,
  ...(used ? { second_hand_condition: used } : {}), product_link: 'https://www.google.com/shopping/product/test' });
const lists = {
  'MacBook Pro 14 PROLED': [
    offer('Apple MacBook Pro M5 Pro 14" 24Go/2To Noir', 3449, 'Darty.com'),
    offer('Apple MacBook Pro M5 Pro 14" Argent 24 Go/2 To', 3099, 'Veepee'),
    offer('Apple Pro 14" Écran PROLED XDR 1 To SSD 24 Go RAM Puce M5 Pro CPU 15 cœurs GPU 16 cœurs Noir sidéral MacBook', 3299, 'Apple'),
    offer('Apple Pro 14" Écran PROLED XDR 1 To SSD 24 Go RAM Puce M5 Pro CPU 15 cœurs GPU 16 cœurs Argent MacBook', 3249, 'Boulanger'),
    offer('Apple Pro 14" Écran PROLED XDR 2 To SSD 36 Go RAM Puce M5 Max CPU 18 cœurs GPU 32 cœurs Noir sidéral MacBook', 5199, 'Apple'),
    offer('Apple MacBook Pro 16" Écran PROLED XDR M5 Pro', 3799, 'Fnac'),
    offer('MacBook Pro 14 Écran PROLED XDR M5 Pro - coque de protection', 39, 'Amazon.fr'),
    offer('Apple Pro 14" Écran PROLED XDR M5 Pro MacBook', 2799, 'Back Market', 'reconditionné'),
  ],
  'Beta AR Jacket': [
    offer("Arc'teryx Beta AR Homme Veste", 649.9, 'Snowleader.com'),
    offer("Arc'teryx - BLACK BETA AR JACKET", 650, 'lelabostore.com'),
    offer("Arc'teryx Beta AR Jacket (SS24) Black Sapphire - XXL", 610, 'Geturbrick'),
    offer("Arc'teryx Beta AR Femme Veste", 583.95, 'Bergtopia'),
    offer("Veste Arc'teryx Beta LT Homme Jacket", 500, 'Station-store.com'),
    offer('[S] Arc\'teryx Beta AR Jacket Black', 415.92, 'NaturaBuy', 'occasion'),
    offer("Arc'teryx Beta AR Jacket Men's Black", 620, 'Test Shop'),
    // Under the 520 target, but neither colour nor men's/women's is stated: it must stay "know".
    offer("Arc'teryx Beta AR Jacket", 499, 'Test Outlet'),
  ],
};
return $input.all().map((i) => ({ json: { search_metadata: { status: 'Success' }, shopping_results: lists[i.json.label] || [] } }));
