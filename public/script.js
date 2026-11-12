/* ===========================
   Quality N Comfort storefront
   Talks to the Express API (see /server). Products, accounts, saved carts and
   orders live in the database. Guests keep a cart in localStorage until they
   log in, then it is merged into their saved cart.
   =========================== */

/* Hero image on the Home view. Set to a local file (e.g. "images/hero-home.jpg")
   to swap it; if it fails to load, the dark campaign tile is shown instead. */
const HERO_IMAGE = "https://images.pexels.com/photos/32739300/pexels-photo-32739300.jpeg?auto=compress&cs=tinysrgb&w=1600";

/* ===========================
   API helper
   =========================== */
class ApiError extends Error {
  constructor(status, data) {
    super((data && data.error) || "Something went wrong. Please try again.");
    this.status = status;
    this.data = data || {};
  }
}

async function api(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch (err) {
    throw new ApiError(0, { error: "Can't reach the server. Check your connection and try again." });
  }

  let data = null;
  try { data = await res.json(); } catch { /* empty or non-JSON body */ }

  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

/* ===========================
   Toast (network / session problems)
   =========================== */
const toastEl = document.getElementById("toast");
let toastTimer = null;

function showToast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 5000);
}

/* ===========================
   State
   =========================== */
let products = [];            // loaded from /api/products
let shopStatus = "loading";   // "loading" | "error" | "ready"
let cart = [];                // [{ productId, size, quantity }]
let currentUser = null;       // { id, fullName, phone } or null
let accountFlash = "";        // one-time message shown on the account panel
let pendingCheckout = false;  // user tried to check out while logged out

function getProduct(productId) {
  return products.find(p => p.id === Number(productId)) || null;
}

/* ===========================
   Guest cart (localStorage, only while logged out)
   Cart item shape: { productId, size, quantity }. Name and price are always
   looked up from the product list, never stored.
   =========================== */
const GUEST_CART_KEY = "qnc_cart";

function readStored(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error(`Failed to read "${key}" from localStorage:`, err);
    return null;
  }
}

function writeGuestCart() {
  try {
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(cart));
  } catch (err) {
    console.error("Failed to save cart to localStorage:", err);
  }
}

function clearGuestCart() {
  try { localStorage.removeItem(GUEST_CART_KEY); } catch { /* ignore */ }
}

/* Accounts used to live in this browser (with plain-text passwords). Accounts
   are now stored on the server, so remove the old local copies. Old guest carts
   are kept. */
function purgeLegacyStorage() {
  try {
    const legacyCart = localStorage.getItem("plainwear_cart");
    if (legacyCart !== null && localStorage.getItem(GUEST_CART_KEY) === null) {
      localStorage.setItem(GUEST_CART_KEY, legacyCart);
    }
    const doomed = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (/^plainwear_/.test(key) || key === "qnc_users" || key === "qnc_current_user" || /^qnc_cart_/.test(key)) {
        doomed.push(key);
      }
    }
    doomed.forEach(key => localStorage.removeItem(key));
  } catch (err) {
    console.error("Legacy storage cleanup failed:", err);
  }
}

function sanitizeCart(items) {
  if (!Array.isArray(items)) return [];

  const clean = [];
  items.forEach(raw => {
    if (!raw) return;
    const product = getProduct(raw.productId);
    const quantity = Math.floor(Number(raw.quantity));
    if (!product || !(quantity > 0)) return;

    let size = raw.size;
    if (!product.sizes.includes(size)) {
      size = product.sizes.length === 1 ? product.sizes[0] : null;
    }
    if (!size) return;

    const existing = clean.find(i => i.productId === product.id && i.size === size);
    if (existing) {
      existing.quantity += quantity;
    } else {
      clean.push({ productId: product.id, size, quantity });
    }
  });
  return clean;
}

function readGuestCart() {
  return sanitizeCart(readStored(GUEST_CART_KEY));
}

/* ===========================
   Cart persistence
   Logged out: localStorage. Logged in: saved to the server, one request at a
   time so rapid clicks can't arrive out of order.
   =========================== */
let syncChain = Promise.resolve();

function expireSession() {
  currentUser = null;
  cart = readGuestCart();
  updateAccountNavLabel();
  updateCartCount();
  renderCart();
  showToast("Your session expired. Please log in again.");
}

function persistCart() {
  if (!currentUser) {
    writeGuestCart();
    return;
  }

  const snapshot = cart.map(i => ({ ...i }));
  syncChain = syncChain
    .then(() => api("/api/cart", { method: "PUT", body: { items: snapshot } }))
    .catch(err => {
      if (err.status === 401) expireSession();
      else showToast("Couldn't save your cart. Check your connection.");
    });
}

/* After login/signup: bring in the saved cart, merging anything added as a guest */
async function adoptSessionCart() {
  const guest = readGuestCart();
  try {
    const res = guest.length
      ? await api("/api/cart/merge", { method: "POST", body: { items: guest } })
      : await api("/api/cart");
    cart = sanitizeCart(res.items);
    clearGuestCart();
  } catch (err) {
    cart = guest;
    showToast("Couldn't load your saved cart. Please refresh.");
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

  if (viewName !== "account") pendingCheckout = false;

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
   Hero image
   =========================== */
function applyHeroImage() {
  const hero = document.getElementById("hero-image");
  if (!hero) return;

  if (!HERO_IMAGE) {
    hero.remove();
    return;
  }

  hero.addEventListener("error", () => hero.remove()); // dark tile remains
  hero.src = HERO_IMAGE;
}

/* ===========================
   Product rendering
   =========================== */
const productGrid = document.getElementById("product-grid");
const shopEmptyMessage = document.getElementById("shop-empty-message");
const categoryFilterGroup = document.getElementById("category-filter-group");
let activeCategory = "all";

function showImagePlaceholder(imageWrap, product) {
  imageWrap.textContent = "";
  imageWrap.classList.add("image-missing");
  imageWrap.textContent = product.name;
}

function renderProducts(filterCategory = activeCategory) {
  activeCategory = filterCategory;
  productGrid.innerHTML = "";

  if (shopStatus === "loading") {
    shopEmptyMessage.hidden = false;
    shopEmptyMessage.textContent = "Loading products...";
    return;
  }
  if (shopStatus === "error") {
    shopEmptyMessage.hidden = false;
    shopEmptyMessage.textContent = "Couldn't load products. Please refresh the page.";
    return;
  }

  const filtered = filterCategory === "all"
    ? products
    : products.filter(p => p.category === filterCategory);

  shopEmptyMessage.textContent = "No products in this category yet.";
  shopEmptyMessage.hidden = filtered.length > 0;

  filtered.forEach(product => {
    const card = document.createElement("div");
    card.className = "product-card";

    const imageWrap = document.createElement("div");
    imageWrap.className = "product-placeholder";

    if (product.image) {
      const image = document.createElement("img");
      image.alt = product.name;
      image.loading = "lazy";
      image.addEventListener("error", () => showImagePlaceholder(imageWrap, product));
      image.src = product.image;
      imageWrap.appendChild(image);
    } else {
      showImagePlaceholder(imageWrap, product);
    }

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

    let getSelectedSize;

    if (product.sizes.length > 1) {
      const sizeSelect = document.createElement("select");
      sizeSelect.setAttribute("aria-label", `Size for ${product.name}`);
      product.sizes.forEach(size => {
        const option = document.createElement("option");
        option.value = size;
        option.textContent = size;
        sizeSelect.appendChild(option);
      });
      controls.appendChild(sizeSelect);
      getSelectedSize = () => sizeSelect.value;
    } else {
      const fixedSize = document.createElement("div");
      fixedSize.className = "size-fixed";
      fixedSize.textContent = product.sizes[0];
      controls.appendChild(fixedSize);
      getSelectedSize = () => product.sizes[0];
    }

    const addBtn = document.createElement("button");
    addBtn.className = "btn btn-primary btn-small";
    addBtn.textContent = "Add to Cart";
    addBtn.addEventListener("click", () => {
      addToCart(product, getSelectedSize());
    });

    controls.appendChild(addBtn);

    card.appendChild(imageWrap);
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
    if (existing.quantity >= 99) return;
    existing.quantity += 1;
  } else {
    cart.push({
      productId: product.id,
      size: size,
      quantity: 1
    });
  }

  persistCart();
  updateCartCount();
  renderCart();
}

function changeQuantity(productId, size, delta) {
  const item = cart.find(i => i.productId === productId && i.size === size);
  if (!item) return;

  item.quantity = Math.min(99, item.quantity + delta);

  if (item.quantity <= 0) {
    cart = cart.filter(i => !(i.productId === productId && i.size === size));
  }

  persistCart();
  updateCartCount();
  renderCart();
}

function removeFromCart(productId, size) {
  cart = cart.filter(i => !(i.productId === productId && i.size === size));
  persistCart();
  updateCartCount();
  renderCart();
}

function getCartTotals() {
  const subtotal = cart.reduce((sum, item) => {
    const product = getProduct(item.productId);
    return product ? sum + product.price * item.quantity : sum;
  }, 0);
  // No tax/shipping logic included -- total equals subtotal for this store.
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
    const product = getProduct(item.productId);
    if (!product) return;

    const row = document.createElement("tr");

    const nameCell = document.createElement("td");
    nameCell.textContent = product.name;

    const sizeCell = document.createElement("td");
    sizeCell.textContent = item.size;

    const priceCell = document.createElement("td");
    priceCell.textContent = formatCurrency(product.price);

    const qtyCell = document.createElement("td");
    const qtyWrapper = document.createElement("div");
    qtyWrapper.className = "qty-controls";

    const decBtn = document.createElement("button");
    decBtn.textContent = "-";
    decBtn.setAttribute("aria-label", `Decrease quantity of ${product.name}`);
    decBtn.addEventListener("click", () => changeQuantity(item.productId, item.size, -1));

    const qtyValue = document.createElement("span");
    qtyValue.textContent = item.quantity;

    const incBtn = document.createElement("button");
    incBtn.textContent = "+";
    incBtn.setAttribute("aria-label", `Increase quantity of ${product.name}`);
    incBtn.addEventListener("click", () => changeQuantity(item.productId, item.size, 1));

    qtyWrapper.appendChild(decBtn);
    qtyWrapper.appendChild(qtyValue);
    qtyWrapper.appendChild(incBtn);
    qtyCell.appendChild(qtyWrapper);

    const lineTotalCell = document.createElement("td");
    lineTotalCell.textContent = formatCurrency(product.price * item.quantity);

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
const accountFlashEl = document.getElementById("account-flash");

const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");

// Phone numbers are sent to the server in international format (+260...), so
// 0977 123 456 and +260 977 123 456 are the same account. The server checks again.
const PHONE_REGEX = /^\+[1-9][0-9]{7,14}$/;

function normalizePhone(raw) {
  let p = String(raw).replace(/[\s\-().]/g, "");
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (p.startsWith("+")) return p;
  if (/^0[0-9]{9}$/.test(p)) return "+260" + p.slice(1);   // 0977123456
  if (/^260[0-9]{9}$/.test(p)) return "+" + p;             // 260977123456
  if (/^[0-9]{9}$/.test(p)) return "+260" + p;             // 977123456
  return p; // anything else fails validation
}

function isValidPhone(phone) {
  if (!PHONE_REGEX.test(phone)) return false;
  // Zambian numbers are +260 followed by exactly 9 digits
  return !phone.startsWith("+260") || phone.length === 13;
}

const PHONE_ERROR_MESSAGE = "Enter a valid phone number, e.g. 0977 123 456 or +260 977 123 456.";

function renderAccountView() {
  if (currentUser) {
    authFormsWrapper.hidden = true;
    accountPanel.hidden = false;
    document.getElementById("account-welcome").textContent = `Logged in as ${currentUser.fullName}`;
    document.getElementById("account-phone").textContent = `Phone: ${currentUser.phone}`;

    // One-time confirmation (e.g. "Logged in successfully!"), visible in the panel
    accountFlashEl.hidden = !accountFlash;
    accountFlashEl.textContent = accountFlash;
    accountFlash = "";

    loadOrders();
  } else {
    authFormsWrapper.hidden = false;
    accountPanel.hidden = true;
    accountFlashEl.hidden = true;
    accountFlashEl.textContent = "";
  }
  updateAccountNavLabel();
}

function updateAccountNavLabel() {
  accountNavBtn.textContent = currentUser ? `Hi, ${currentUser.fullName.split(" ")[0]}` : "Login";
}

/* --- Order history --- */
const ordersSection = document.getElementById("orders-section");
const ordersList = document.getElementById("orders-list");

async function loadOrders() {
  try {
    const { orders } = await api("/api/orders");
    if (!currentUser) return;

    ordersList.innerHTML = "";
    ordersSection.hidden = orders.length === 0;

    orders.forEach(order => {
      const card = document.createElement("div");
      card.className = "order-card";

      const head = document.createElement("div");
      head.className = "order-head";
      const title = document.createElement("span");
      title.textContent = `Order #${order.id}`;
      const total = document.createElement("span");
      total.textContent = formatCurrency(order.total);
      head.appendChild(title);
      head.appendChild(total);

      const meta = document.createElement("div");
      meta.className = "order-meta";
      const date = new Date(order.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      meta.textContent = `${date} \u00b7 `;
      const status = document.createElement("span");
      status.className = "order-status";
      status.textContent = order.status;
      meta.appendChild(status);

      const items = document.createElement("div");
      items.className = "order-items";
      items.textContent = order.items
        .map(i => `${i.quantity}\u00d7 ${i.name}${i.size === "One Size" ? "" : ` (${i.size})`}`)
        .join(", ");

      card.appendChild(head);
      card.appendChild(meta);
      card.appendChild(items);
      ordersList.appendChild(card);
    });
  } catch (err) {
    if (err.status === 401) expireSession();
    else ordersSection.hidden = true;
  }
}

/* --- Tab switching between Log In / Sign Up --- */
function showAuthTab(tab) {
  document.querySelectorAll(".auth-tab-btn").forEach(b => {
    b.classList.toggle("active", b.getAttribute("data-auth-tab") === tab);
  });

  document.querySelectorAll(".auth-form").forEach(f => f.classList.remove("active"));
  document.getElementById(`${tab}-form`).classList.add("active");

  clearFormMessage("login-form-message");
  clearFormMessage("signup-form-message");
}

document.querySelectorAll(".auth-tab-btn").forEach(tabBtn => {
  tabBtn.addEventListener("click", () => {
    showAuthTab(tabBtn.getAttribute("data-auth-tab"));
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

// Show per-field errors returned by the server
function applyServerErrors(prefix, errors, fieldMap) {
  Object.entries(fieldMap).forEach(([serverField, inputSuffix]) => {
    setFieldError(`${prefix}-${inputSuffix}`, `${prefix}-${inputSuffix}-error`, errors[serverField] || "");
  });
}

/* --- Start a session (shared by Sign Up and Log In) --- */
async function startSession(user, flashMessage) {
  currentUser = user;
  await adoptSessionCart();
  updateCartCount();
  renderCart();

  const resumeCheckout = pendingCheckout;

  if (resumeCheckout) {
    updateAccountNavLabel();
    showView("cart");
    const checkoutMessage = document.getElementById("checkout-message");
    checkoutMessage.hidden = false;
    checkoutMessage.textContent = `${flashMessage} Review your order and press Checkout.`;
  } else {
    accountFlash = flashMessage;
    renderAccountView();
  }
}

function setSubmitting(form, submitting) {
  const btn = form.querySelector('button[type="submit"]');
  if (btn) btn.disabled = submitting;
}

/* --- Sign Up --- */
signupForm.addEventListener("submit", async (e) => {
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

  if (!phoneInput.value.trim()) {
    setFieldError("signup-phone", "signup-phone-error", "Phone number is required.");
    hasError = true;
  } else if (!isValidPhone(phone)) {
    setFieldError("signup-phone", "signup-phone-error", PHONE_ERROR_MESSAGE);
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

  setSubmitting(signupForm, true);
  try {
    const { user } = await api("/api/auth/signup", { method: "POST", body: { fullName, phone, password } });
    signupForm.reset();
    await startSession(user, "Account created successfully!");
  } catch (err) {
    if (err.data && err.data.errors) {
      applyServerErrors("signup", err.data.errors, { fullName: "name", phone: "phone", password: "password" });
    } else {
      showFormMessage("signup-form-message", err.message, "error");
    }
  } finally {
    setSubmitting(signupForm, false);
  }
});

/* --- Log In --- */
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearFormMessage("login-form-message");

  const phoneInput = document.getElementById("login-phone");
  const passwordInput = document.getElementById("login-password");

  const phone = normalizePhone(phoneInput.value.trim());
  const password = passwordInput.value;

  let hasError = false;

  if (!phoneInput.value.trim()) {
    setFieldError("login-phone", "login-phone-error", "Phone number is required.");
    hasError = true;
  } else if (!isValidPhone(phone)) {
    setFieldError("login-phone", "login-phone-error", PHONE_ERROR_MESSAGE);
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

  setSubmitting(loginForm, true);
  try {
    const { user } = await api("/api/auth/login", { method: "POST", body: { phone, password } });
    loginForm.reset();
    await startSession(user, "Logged in successfully!");
  } catch (err) {
    if (err.data && err.data.errors) {
      applyServerErrors("login", err.data.errors, { phone: "phone", password: "password" });
    } else {
      showFormMessage("login-form-message", err.message, "error");
    }
  } finally {
    setSubmitting(loginForm, false);
  }
});

/* --- Log Out --- */
document.getElementById("logout-btn").addEventListener("click", async () => {
  await syncChain; // let any pending cart save finish while still logged in
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch (err) {
    console.error("Logout request failed:", err);
  }

  currentUser = null;
  accountFlash = "";
  ordersList.innerHTML = "";
  ordersSection.hidden = true;

  // Back to the (empty) guest cart so the next person doesn't see this user's items
  cart = readGuestCart();
  updateCartCount();
  renderCart();

  renderAccountView();
  showView("home");
});

/* ===========================
   Checkout
   Prices are recalculated on the server from the database.
   Payment is not processed yet.
   =========================== */
const checkoutBtn = document.getElementById("checkout-btn");

checkoutBtn.addEventListener("click", async () => {
  const checkoutMessage = document.getElementById("checkout-message");

  if (cart.length === 0) {
    checkoutMessage.hidden = false;
    checkoutMessage.textContent = "Your cart is empty. Add items before checking out.";
    return;
  }

  // Checkout requires an account; send guests to log in and bring them back
  if (!currentUser) {
    showAuthTab("login");
    showView("account");
    pendingCheckout = true;
    showFormMessage("login-form-message", "Please log in or sign up to check out. Your cart will be kept.", "info");
    return;
  }

  checkoutBtn.disabled = true;
  try {
    // Make sure the server has exactly the cart on screen, then place the order
    await syncChain;
    await api("/api/cart", { method: "PUT", body: { items: cart } });
    const { order } = await api("/api/orders", { method: "POST" });

    cart = [];
    updateCartCount();
    renderCart();

    // renderCart() hides the message, so show the confirmation after it runs
    checkoutMessage.hidden = false;
    checkoutMessage.textContent = `Order #${order.id} confirmed! Thank you for your purchase of ${formatCurrency(order.total)}. (Payment is not processed yet -- we'll contact you to arrange it.)`;
  } catch (err) {
    if (err.status === 401) {
      expireSession();
    } else {
      checkoutMessage.hidden = false;
      checkoutMessage.textContent = err.message;
    }
  } finally {
    checkoutBtn.disabled = false;
  }
});

/* ===========================
   Utilities
   =========================== */
function formatCurrency(amount) {
  return `K${Number(amount).toFixed(2)}`;
}

/* ===========================
   Init
   =========================== */
async function init() {
  purgeLegacyStorage();
  applyHeroImage();
  showView("home");
  renderProducts();
  renderCart();
  updateCartCount();
  updateAccountNavLabel();

  const [productsRes, meRes] = await Promise.allSettled([
    api("/api/products"),
    api("/api/auth/me")
  ]);

  if (productsRes.status === "fulfilled") {
    products = productsRes.value.products;
    shopStatus = "ready";
  } else {
    shopStatus = "error";
  }

  currentUser = meRes.status === "fulfilled" ? meRes.value.user : null;
  updateAccountNavLabel();

  if (shopStatus === "ready") {
    if (currentUser) {
      await adoptSessionCart();
    } else {
      cart = readGuestCart();
    }
  }

  renderProducts();
  renderCart();
  updateCartCount();
}

init();
