# images/

No image files are checked in yet — see the hand-off summary for why.

To add real photography later:
1. Drop files in here, e.g. `hero-home.jpg`, `product-1-basic-crew-tee.jpg` (one per product id in `script.js`'s `PRODUCTS` array).
2. In `script.js`, set each product's `image` field to `"images/product-N-name.jpg"`, and set `HERO_IMAGE` to `"images/hero-home.jpg"`.
3. That's it — `renderProducts()` and `applyHeroImage()` already handle swapping in the `<img>`/background, lazy loading, alt text, and a fallback to the current placeholder if a file is missing or fails to load.
