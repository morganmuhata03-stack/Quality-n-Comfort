/* ===========================
   Product data
   =========================== */
const PRODUCTS = [
  { id: 1, name: "Basic Crew Tee",        price: 18.00, category: "tops",        sizes: ["S", "M", "L", "XL"] },
  { id: 2, name: "Long Sleeve Henley",    price: 24.00, category: "tops",        sizes: ["S", "M", "L", "XL"] },
  { id: 3, name: "Flannel Shirt",         price: 32.00, category: "tops",        sizes: ["S", "M", "L", "XL"] },
  { id: 4, name: "Pullover Hoodie",       price: 38.00, category: "tops",        sizes: ["S", "M", "L", "XL"] },
  { id: 5, name: "Straight Leg Jeans",    price: 45.00, category: "bottoms",     sizes: ["S", "M", "L", "XL"] },
  { id: 6, name: "Chino Trousers",        price: 40.00, category: "bottoms",     sizes: ["S", "M", "L", "XL"] },
  { id: 7, name: "Jogger Sweatpants",     price: 30.00, category: "bottoms",     sizes: ["S", "M", "L", "XL"] },
  { id: 8, name: "Cargo Shorts",          price: 28.00, category: "bottoms",     sizes: ["S", "M", "L", "XL"] },
  { id: 9, name: "Canvas Belt",           price: 14.00, category: "accessories", sizes: ["S", "M", "L", "XL"] },
  { id: 10, name: "Wool Beanie",          price: 12.00, category: "accessories", sizes: ["S", "M", "L", "XL"] },
  { id: 11, name: "Crew Socks (3-pack)",  price: 10.00, category: "accessories", sizes: ["S", "M", "L", "XL"] },
  { id: 12, name: "Canvas Tote Bag",      price: 16.00, category: "accessories", sizes: ["S", "M", "L", "XL"] }
];

/* ===========================
   Cart state (persisted to localStorage)
   Cart item shape: { productId, name, price, size, quantity }
   =========================== */
const CART_STORAGE_KEY = "plainwear_cart";

let cart = loadCart();

function loadCart() {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error("Failed to load cart from localStorage:", err);
    return [];
  }
}

function saveCart() {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  } catch (err) {
    console.error("Failed to save cart to localStorage:", err);
  }
}

/* ===========================
   View navigation
   =========================== */
function showView(viewName) {
  document.querySelectorAll(".view").forEach(el => el.classList.remove("active"));
  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.add("active");
}

document.querySelectorAll("[data-view]").forEach(el => {
  el.addEventListener("click", () => {
    showView(el.getAttribute("data-view"));
  });
});

/* ===========================
   Product rendering
   =========================== */
const productGrid = document.getElementById("product-grid");
const categoryFilter = document.getElementById("category-filter");

function renderProducts(filterCategory = "all") {
  productGrid.innerHTML = "";

  const filtered = filterCategory === "all"
    ? PRODUCTS
    : PRODUCTS.filter(p => p.category === filterCategory);

  filtered.forEach(product => {
    const card = document.createElement("div");
    card.className = "product-card";

    const placeholder = document.createElement("div");
    placeholder.className = "product-placeholder";
    placeholder.textContent = product.name;

    const name = document.createElement("div");
    name.className = "product-name";
    name.textContent = product.name;

    const category = document.createElement("div");
    category.className = "product-category";
    category.textContent = product.category;

    const price = document.createElement("div");
    price.className = "product-price";
    price.textContent = formatCurrency(product.price);

    const controls = document.createElement("div");
    controls.className = "product-controls";

    const sizeSelect = document.createElement("select");
    sizeSelect.setAttribute("aria-label", `Size for ${product.name}`);
    product.sizes.forEach(size => {
      const option = document.createElement("option");
      option.value = size;
      option.textContent = size;
      sizeSelect.appendChild(option);
    });

    const addBtn = document.createElement("button");
    addBtn.className = "btn btn-primary btn-small";
    addBtn.textContent = "Add to Cart";
    addBtn.addEventListener("click", () => {
      addToCart(product, sizeSelect.value);
    });

    controls.appendChild(sizeSelect);
    controls.appendChild(addBtn);

    card.appendChild(placeholder);
    card.appendChild(name);
    card.appendChild(category);
    card.appendChild(price);
    card.appendChild(controls);

    productGrid.appendChild(card);
  });
}

categoryFilter.addEventListener("change", () => {
  renderProducts(categoryFilter.value);
});

/* ===========================
   Cart logic
   =========================== */
function addToCart(product, size) {
  const existing = cart.find(item => item.productId === product.id && item.size === size);

  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({
      productId: product.id,
      name: product.name,
      price: product.price,
      size: size,
      quantity: 1
    });
  }

  saveCart();
  updateCartCount();
  renderCart();
}

function changeQuantity(productId, size, delta) {
  const item = cart.find(i => i.productId === productId && i.size === size);
  if (!item) return;

  item.quantity += delta;

  if (item.quantity <= 0) {
    cart = cart.filter(i => !(i.productId === productId && i.size === size));
  }

  saveCart();
  updateCartCount();
  renderCart();
}

function removeFromCart(productId, size) {
  cart = cart.filter(i => !(i.productId === productId && i.size === size));
  saveCart();
  updateCartCount();
  renderCart();
}

function getCartTotals() {
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  // No tax/shipping logic included -- total equals subtotal for this mock store.
  const total = subtotal;
  return { subtotal, total };
}

function updateCartCount() {
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  document.getElementById("cart-count").textContent = count;
}

/* ===========================
   Cart rendering
   =========================== */
const cartItemsBody = document.getElementById("cart-items-body");
const cartTable = document.getElementById("cart-table");
const cartEmptyMessage = document.getElementById("cart-empty-message");

function renderCart() {
  cartItemsBody.innerHTML = "";

  if (cart.length === 0) {
    cartTable.style.display = "none";
    cartEmptyMessage.style.display = "block";
  } else {
    cartTable.style.display = "table";
    cartEmptyMessage.style.display = "none";
  }

  cart.forEach(item => {
    const row = document.createElement("tr");

    const nameCell = document.createElement("td");
    nameCell.textContent = item.name;

    const sizeCell = document.createElement("td");
    sizeCell.textContent = item.size;

    const priceCell = document.createElement("td");
    priceCell.textContent = formatCurrency(item.price);

    const qtyCell = document.createElement("td");
    const qtyWrapper = document.createElement("div");
    qtyWrapper.className = "qty-controls";

    const decBtn = document.createElement("button");
    decBtn.textContent = "-";
    decBtn.setAttribute("aria-label", `Decrease quantity of ${item.name}`);
    decBtn.addEventListener("click", () => changeQuantity(item.productId, item.size, -1));

    const qtyValue = document.createElement("span");
    qtyValue.textContent = item.quantity;

    const incBtn = document.createElement("button");
    incBtn.textContent = "+";
    incBtn.setAttribute("aria-label", `Increase quantity of ${item.name}`);
    incBtn.addEventListener("click", () => changeQuantity(item.productId, item.size, 1));

    qtyWrapper.appendChild(decBtn);
    qtyWrapper.appendChild(qtyValue);
    qtyWrapper.appendChild(incBtn);
    qtyCell.appendChild(qtyWrapper);

    const lineTotalCell = document.createElement("td");
    lineTotalCell.textContent = formatCurrency(item.price * item.quantity);

    const removeCell = document.createElement("td");
    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => removeFromCart(item.productId, item.size));
    removeCell.appendChild(removeBtn);

    row.appendChild(nameCell);
    row.appendChild(sizeCell);
    row.appendChild(priceCell);
    row.appendChild(qtyCell);
    row.appendChild(lineTotalCell);
    row.appendChild(removeCell);

    cartItemsBody.appendChild(row);
  });

  const { subtotal, total } = getCartTotals();
  document.getElementById("cart-subtotal").textContent = formatCurrency(subtotal);
  document.getElementById("cart-total").textContent = formatCurrency(total);

  // Hide any previous checkout confirmation once the cart changes
  const checkoutMessage = document.getElementById("checkout-message");
  checkoutMessage.hidden = true;
  checkoutMessage.textContent = "";
}

/* ===========================
   Checkout (mock only)
   =========================== */
document.getElementById("checkout-btn").addEventListener("click", () => {
  const checkoutMessage = document.getElementById("checkout-message");

  if (cart.length === 0) {
    checkoutMessage.hidden = false;
    checkoutMessage.textContent = "Your cart is empty. Add items before checking out.";
    return;
  }

  const { total } = getCartTotals();
  checkoutMessage.hidden = false;
  checkoutMessage.textContent = `Order confirmed! Thank you for your purchase of ${formatCurrency(total)}. (This is a demo -- no payment was processed.)`;

  cart = [];
  saveCart();
  updateCartCount();
  renderCart();
});

/* ===========================
   Utilities
   =========================== */
function formatCurrency(amount) {
  return `$${amount.toFixed(2)}`;
}

/* ===========================
   Init
   =========================== */
function init() {
  renderProducts();
  renderCart();
  updateCartCount();
  showView("home");
}

init();