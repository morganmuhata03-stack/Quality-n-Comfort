// Starting catalogue. Inserted only when a product id doesn't exist yet,
// so edits you make later in the database are never overwritten on restart.
const CLOTHING_SIZES = ["S", "M", "L", "XL"];
const ONE_SIZE = ["One Size"];
const px = (id, w = 900) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}`;

module.exports = [
  { id: 1,  name: "Ankara Print Shirt",       price: 320, category: "tops",        sizes: CLOTHING_SIZES, image: px(36673279) },
  { id: 2,  name: "Kitenge Print Shirt",      price: 380, category: "tops",        sizes: CLOTHING_SIZES, image: px(14197777) },
  { id: 3,  name: "Dashiki Shirt",            price: 420, category: "tops",        sizes: CLOTHING_SIZES, image: px(34735729) },
  { id: 4,  name: "Traditional Kaftan",       price: 650, category: "tops",        sizes: CLOTHING_SIZES, image: px(32919050) },
  { id: 5,  name: "African Print Trousers",   price: 520, category: "bottoms",     sizes: CLOTHING_SIZES, image: px(29133970) },
  { id: 6,  name: "Kitenge Wrap Skirt",       price: 460, category: "bottoms",     sizes: CLOTHING_SIZES, image: px(35549954) },
  { id: 7,  name: "Ankara Casual Trousers",   price: 490, category: "bottoms",     sizes: CLOTHING_SIZES, image: px(34647283) },
  { id: 8,  name: "Patterned Relaxed Shorts", price: 280, category: "bottoms",     sizes: CLOTHING_SIZES, image: px(37633515) },
  { id: 9,  name: "Woven Statement Belt",     price: 180, category: "accessories", sizes: CLOTHING_SIZES, image: px(31809999) },
  { id: 10, name: "Traditional Pattern Cap",  price: 160, category: "accessories", sizes: ONE_SIZE,       image: px(32668005) },
  { id: 11, name: "African Print Scarf",      price: 220, category: "accessories", sizes: ONE_SIZE,       image: px(29433617) },
  { id: 12, name: "Kitenge Tote Bag",         price: 240, category: "accessories", sizes: ONE_SIZE,       image: px(36866087) }
];
