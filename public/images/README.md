# images/

No local image files are checked in. Product photos are loaded from Pexels; their URLs live in the `products` table (seeded from `server/products-seed.js`). The hero photo is `HERO_IMAGE` in `public/script.js`.

If an image fails to load:
- a product card keeps its soft-grey tile and shows the product name;
- the hero keeps the dark campaign tile.

To switch to your own photography:
1. Drop files in this folder, e.g. `hero-home.jpg`, `ankara-shirt.jpg`.
2. Point a product at its file in the database:
   `UPDATE products SET image = 'images/ankara-shirt.jpg' WHERE id = 1;`
3. For the hero, set `HERO_IMAGE` to `"images/hero-home.jpg"` in `public/script.js`.
