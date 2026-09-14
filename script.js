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
   Auth state (persisted to localStorage)
   NOTE: This is a front-end-only demo. Passwords are stored in
   plain text in localStorage because there is no backend/server.
   Do not reuse this pattern for a real production site.
   Users shape: { fullName, phone, password }
   =========================== */
const USERS_STORAGE_KEY = "plainwear_users";
const CURRENT_USER_STORAGE_KEY = "plainwear_current_user";

let users = loadUsers();
let currentUser = loadCurrentUser();

function loadUsers() {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error("Failed to load users from localStorage:", err);
    return [];
  }
}

function saveUsers() {
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  } catch (err) {
    console.error("Failed to save users to localStorage:", err);
  }
}

function loadCurrentUser() {
  try {
    const raw = localStorage.getItem(CURRENT_USER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error("Failed to load current user from localStorage:", err);
    return null;
  }
}

function saveCurrentUser() {
  try {
    if (currentUser) {
      localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(currentUser));
    } else {
      localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
    }
  } catch (err) {
    console.error("Failed to save current user to localStorage:", err);
  }
}

/* ===========================
   View navigation
   =========================== */
function showView(viewName) {
  document.querySelectorAll(".view").forEach(el => el.classList.remove("active"));
  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.add("active");

  document.querySelectorAll(".nav-link[data-view]").forEach(btn => {
    btn.classList.toggle("active-nav", btn.getAttribute("data-view") === viewName);
  });

  if (viewName === "account") {
    renderAccountView();
  }
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
const categoryFilterGroup = document.getElementById("category-filter-group");

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

categoryFilterGroup.querySelectorAll(".filter-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    categoryFilterGroup.querySelectorAll(".filter-chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    renderProducts(chip.getAttribute("data-category"));
  });
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
   Account / Auth logic
   =========================== */
const accountNavBtn = document.getElementById("account-nav-btn");
const authFormsWrapper = document.getElementById("auth-forms");
const accountPanel = document.getElementById("account-panel");

const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");

// Basic phone validation: digits, optional leading +, 7-15 digits total.
const PHONE_REGEX = /^\+?[0-9]{7,15}$/;

function normalizePhone(phone) {
  return phone.replace(/[\s\-().]/g, "");
}

function renderAccountView() {
  if (currentUser) {
    authFormsWrapper.hidden = true;
    accountPanel.hidden = false;
    document.getElementById("account-welcome").textContent = `Logged in as ${currentUser.fullName}`;
    document.getElementById("account-phone").textContent = `Phone: ${currentUser.phone}`;
  } else {
    authFormsWrapper.hidden = false;
    accountPanel.hidden = true;
  }
  updateAccountNavLabel();
}

function updateAccountNavLabel() {
  accountNavBtn.textContent = currentUser ? `Hi, ${currentUser.fullName.split(" ")[0]}` : "Login";
}

/* --- Tab switching between Log In / Sign Up --- */
document.querySelectorAll(".auth-tab-btn").forEach(tabBtn => {
  tabBtn.addEventListener("click", () => {
    const tab = tabBtn.getAttribute("data-auth-tab");

    document.querySelectorAll(".auth-tab-btn").forEach(b => b.classList.remove("active"));
    tabBtn.classList.add("active");

    document.querySelectorAll(".auth-form").forEach(f => f.classList.remove("active"));
    document.getElementById(`${tab}-form`).classList.add("active");

    clearFormMessage("login-form-message");
    clearFormMessage("signup-form-message");
  });
});

/* --- Validation helpers --- */
function setFieldError(inputId, errorId, message) {
  document.getElementById(inputId).classList.toggle("invalid", Boolean(message));
  document.getElementById(errorId).textContent = message || "";
}

function showFormMessage(elementId, message, type) {
  const el = document.getElementById(elementId);
  el.hidden = false;
  el.textContent = message;
  el.className = `form-message ${type}`;
}

function clearFormMessage(elementId) {
  const el = document.getElementById(elementId);
  el.hidden = true;
  el.textContent = "";
  el.className = "form-message";
}

/* --- Sign Up --- */
signupForm.addEventListener("submit", (e) => {
  e.preventDefault();
  clearFormMessage("signup-form-message");

  const nameInput = document.getElementById("signup-name");
  const phoneInput = document.getElementById("signup-phone");
  const passwordInput = document.getElementById("signup-password");

  const fullName = nameInput.value.trim();
  const phone = normalizePhone(phoneInput.value.trim());
  const password = passwordInput.value;

  let hasError = false;

  if (!fullName) {
    setFieldError("signup-name", "signup-name-error", "Full name is required.");
    hasError = true;
  } else {
    setFieldError("signup-name", "signup-name-error", "");
  }

  if (!phone) {
    setFieldError("signup-phone", "signup-phone-error", "Phone number is required.");
    hasError = true;
  } else if (!PHONE_REGEX.test(phone)) {
    setFieldError("signup-phone", "signup-phone-error", "Enter a valid phone number (7-15 digits).");
    hasError = true;
  } else if (users.some(u => u.phone === phone)) {
    setFieldError("signup-phone", "signup-phone-error", "An account with this phone number already exists.");
    hasError = true;
  } else {
    setFieldError("signup-phone", "signup-phone-error", "");
  }

  if (!password) {
    setFieldError("signup-password", "signup-password-error", "Password is required.");
    hasError = true;
  } else if (password.length < 6) {
    setFieldError("signup-password", "signup-password-error", "Password must be at least 6 characters.");
    hasError = true;
  } else {
    setFieldError("signup-password", "signup-password-error", "");
  }

  if (hasError) return;

  const newUser = { fullName, phone, password };
  users.push(newUser);
  saveUsers();

  currentUser = newUser;
  saveCurrentUser();

  signupForm.reset();
  showFormMessage("signup-form-message", "Account created successfully!", "success");
  renderAccountView();
});

/* --- Log In --- */
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  clearFormMessage("login-form-message");

  const phoneInput = document.getElementById("login-phone");
  const passwordInput = document.getElementById("login-password");

  const phone = normalizePhone(phoneInput.value.trim());
  const password = passwordInput.value;

  let hasError = false;

  if (!phone) {
    setFieldError("login-phone", "login-phone-error", "Phone number is required.");
    hasError = true;
  } else if (!PHONE_REGEX.test(phone)) {
    setFieldError("login-phone", "login-phone-error", "Enter a valid phone number.");
    hasError = true;
  } else {
    setFieldError("login-phone", "login-phone-error", "");
  }

  if (!password) {
    setFieldError("login-password", "login-password-error", "Password is required.");
    hasError = true;
  } else {
    setFieldError("login-password", "login-password-error", "");
  }

  if (hasError) return;

  const matchedUser = users.find(u => u.phone === phone && u.password === password);

  if (!matchedUser) {
    showFormMessage("login-form-message", "Incorrect phone number or password.", "error");
    return;
  }

  currentUser = matchedUser;
  saveCurrentUser();

  loginForm.reset();
  showFormMessage("login-form-message", "Logged in successfully!", "success");
  renderAccountView();
});

/* --- Log Out --- */
document.getElementById("logout-btn").addEventListener("click", () => {
  currentUser = null;
  saveCurrentUser();
  renderAccountView();
  showView("home");
});

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
  updateAccountNavLabel();
  showView("home");
}

init();