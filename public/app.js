let currentUser = null;
let allProducts = [];

// ================== Utilities ==================
async function api(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const res = await fetch(path, {
    headers: isFormData ? {} : { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
  return data;
}

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById('view-' + name).classList.remove('hidden');
  closeSettings();
  if (name === 'shop') loadShop();
  if (name === 'cart') loadCart();
  if (name === 'orders') loadOrders();
  if (name === 'wallet') loadWallet();
  if (name === 'admin') loadAdmin();
  if (name === 'reviews') loadReviews();
  if (name === 'contact') loadContactInfo();
}

const typeLabels = { item: 'ไอเท็มเกม', code: 'โค้ดเกม', account: 'ไอดีเกม' };

// ================== Sidebar ==================
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-overlay').classList.remove('hidden');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.add('hidden');
}

// ================== Settings dropdown ==================
function toggleSettings() {
  document.getElementById('settings-menu').classList.toggle('hidden');
}
function closeSettings() {
  document.getElementById('settings-menu').classList.add('hidden');
}

// ================== Auth ==================
async function refreshMe() {
  const me = await api('/api/me');
  currentUser = me.loggedIn ? me : null;
  updateAuthUI();
}

function updateAuthUI() {
  const loggedIn = !!currentUser;
  const isAdmin = loggedIn && currentUser.isAdmin;

  // Sidebar
  document.getElementById('sidebar-login').classList.toggle('hidden', loggedIn);
  document.getElementById('sidebar-register').classList.toggle('hidden', loggedIn);
  document.getElementById('sidebar-orders').classList.toggle('hidden', !loggedIn);
  document.getElementById('sidebar-wallet').classList.toggle('hidden', !loggedIn);
  document.getElementById('sidebar-admin').classList.toggle('hidden', !isAdmin);
  document.getElementById('sidebar-logout').classList.toggle('hidden', !loggedIn);
  document.getElementById('sidebar-account-label').textContent = loggedIn ? ('สวัสดี ' + currentUser.username) : 'เข้าสู่ระบบ / สมัครสมาชิก';

  // Settings dropdown
  document.getElementById('settings-login').classList.toggle('hidden', loggedIn);
  document.getElementById('settings-register').classList.toggle('hidden', loggedIn);
  document.getElementById('settings-wallet').classList.toggle('hidden', !loggedIn);
  document.getElementById('settings-orders').classList.toggle('hidden', !loggedIn);
  document.getElementById('settings-logout').classList.toggle('hidden', !loggedIn);
  document.getElementById('settings-account').textContent = loggedIn
    ? `${currentUser.username} · ${currentUser.walletBalanceBaht} ฿`
    : 'ยังไม่ได้เข้าสู่ระบบ';
}

async function login(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = '';
  try {
    await api('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    await refreshMe();
    showView('shop');
  } catch (err) {
    errorEl.textContent = err.message;
  }
  return false;
}

async function register(e) {
  e.preventDefault();
  const username = document.getElementById('register-username').value.trim();
  const password = document.getElementById('register-password').value;
  const errorEl = document.getElementById('register-error');
  errorEl.textContent = '';
  try {
    await api('/api/register', { method: 'POST', body: JSON.stringify({ username, password }) });
    await refreshMe();
    showView('shop');
  } catch (err) {
    errorEl.textContent = err.message;
  }
  return false;
}

async function logout() {
  await api('/api/logout', { method: 'POST' });
  currentUser = null;
  updateAuthUI();
  showView('shop');
}

// ================== Shop (หน้าหลัก) ==================
async function loadShop() {
  await Promise.all([loadStats(), loadProductsAndCategories(), loadBannerCarousel()]);
}

// -------- Banner carousel --------
let carouselTimer = null;
let carouselIndex = 0;
let carouselBanners = [];

async function loadBannerCarousel() {
  try {
    carouselBanners = await api('/api/banners');
  } catch (err) {
    carouselBanners = [];
  }
  carouselIndex = 0;
  renderCarousel();
  if (carouselTimer) clearInterval(carouselTimer);
  if (carouselBanners.length > 1) {
    carouselTimer = setInterval(() => {
      carouselIndex = (carouselIndex + 1) % carouselBanners.length;
      renderCarousel();
    }, 4500);
  }
}

function renderCarousel() {
  const container = document.getElementById('banner-carousel');
  if (!carouselBanners.length) {
    container.innerHTML = `
      <div class="hero-banner">
        <div class="hero-ribbon">YURI STORE</div>
        <h1>ร้าน Yuri</h1>
        <p>ไอเท็มเกม โค้ดเกม ไอดีเกม ของแท้ 100% ส่งไว ปลอดภัย มีรับประกันทุกชิ้น</p>
      </div>
    `;
    return;
  }
  const b = carouselBanners[carouselIndex];
  const isImage = !!b.image_url;
  const dotsHtml = carouselBanners.length > 1
    ? `<div class="banner-dots">${carouselBanners.map((_, i) => `<span class="${i === carouselIndex ? 'active' : ''}" onclick="goToCarousel(${i})"></span>`).join('')}</div>`
    : '';
  container.innerHTML = `
    <div class="hero-banner ${isImage ? 'image-banner' : ''} ${b.link_url ? 'clickable' : ''}"
         ${isImage ? `style="background-image:url('${b.image_url}')"` : ''}
         ${b.link_url ? `onclick="window.open('${b.link_url.replace(/'/g, "\\'")}', '_blank')"` : ''}>
      ${isImage ? '<div class="banner-overlay"></div>' : ''}
      <div class="hero-ribbon">YURI STORE</div>
      <h1>${escapeHtml(b.title)}</h1>
      ${b.subtitle ? `<p>${escapeHtml(b.subtitle)}</p>` : ''}
    </div>
    ${dotsHtml}
  `;
}

function goToCarousel(i) {
  carouselIndex = i;
  renderCarousel();
  if (carouselTimer) clearInterval(carouselTimer);
  if (carouselBanners.length > 1) {
    carouselTimer = setInterval(() => {
      carouselIndex = (carouselIndex + 1) % carouselBanners.length;
      renderCarousel();
    }, 4500);
  }
}

async function loadStats() {
  try {
    const stats = await api('/api/stats');
    document.getElementById('stat-users').textContent = stats.users.toLocaleString('th-TH');
    document.getElementById('stat-revenue').textContent = Number(stats.revenueBaht).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    document.getElementById('stat-stock').textContent = stats.stock.toLocaleString('th-TH');
    document.getElementById('stat-sales').textContent = stats.salesCount.toLocaleString('th-TH');
  } catch (err) {
    console.error(err);
  }
}

function productCardHtml(p) {
  const outOfStock = p.stock < 1;
  const discountBaht = p.compareAtPriceBaht ? (parseFloat(p.compareAtPriceBaht) - parseFloat(p.priceBaht)).toFixed(0) : null;
  const placeholderEmoji = { item: '💎', code: '🎟️', account: '🪪' }[p.type] || '🎮';
  return `
    <div class="product-card">
      ${p.is_hot ? '<span class="hot-badge">🔥 HOT</span>' : ''}
      ${p.image_url ? `<img class="thumb" src="${p.image_url}" alt="${escapeHtml(p.name)}" />` : `<div class="thumb-placeholder">${placeholderEmoji}</div>`}
      <span class="tag">${typeLabels[p.type] || p.type}</span>${p.subcategory ? ` <span class="tag tag-sub">${escapeHtml(p.subcategory)}</span>` : ''}
      <h3>${escapeHtml(p.name)}</h3>
      <div class="game">เกม: ${escapeHtml(p.game)}</div>
      <div class="desc">${escapeHtml(p.description || '')}</div>
      <div class="stock">📦 คงเหลือ ${p.stock} ชิ้น</div>
      <div class="price-row">
        <span class="price">${p.priceBaht} ฿</span>
        ${p.compareAtPriceBaht ? `<span class="compare-price">${p.compareAtPriceBaht} ฿</span>` : ''}
      </div>
      ${discountBaht ? `<span class="discount-tag">ประหยัด ${discountBaht} ฿</span>` : ''}
      <button class="btn-primary" ${outOfStock ? 'disabled' : ''} onclick="addToCart(${p.id})">
        ${outOfStock ? 'สินค้าหมด' : '🛒 สั่งซื้อ'}
      </button>
    </div>
  `;
}

async function loadProductsAndCategories() {
  const q = document.getElementById('search-box').value;
  const type = document.getElementById('filter-type').value;
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (type) params.set('type', type);
  allProducts = await api('/api/products?' + params.toString());

  // สินค้าแนะนำ = สินค้าที่เป็น HOT (หรือถ้าไม่มีเลยก็เอา 4 อันแรก)
  const featured = allProducts.filter(p => p.is_hot);
  const featuredList = featured.length ? featured : allProducts.slice(0, 4);
  document.getElementById('featured-grid').innerHTML = featuredList.length
    ? featuredList.map(productCardHtml).join('')
    : emptyStateHtml();

  // จัดกลุ่มตามเกม/หมวดหมู่
  const byGame = {};
  for (const p of allProducts) {
    if (!byGame[p.game]) byGame[p.game] = [];
    byGame[p.game].push(p);
  }

  const container = document.getElementById('category-sections');
  container.innerHTML = Object.entries(byGame).map(([game, products]) => {
    const prices = products.map(p => parseFloat(p.priceBaht));
    const min = Math.min(...prices).toFixed(0);
    const max = Math.max(...prices).toFixed(0);
    const subcategoryCount = new Set(products.map(p => (p.subcategory || '').trim()).filter(Boolean)).size;
    return `
      <div class="category-banner">
        <div>
          <div class="cat-name">🎮 ${escapeHtml(game)}</div>
          <div class="cat-meta">${subcategoryCount} หมวดหมู่ · ${products.length} สินค้า</div>
        </div>
        <div class="cat-meta">${min} - ${max} ฿</div>
      </div>
      <div class="product-grid">
        ${products.map(productCardHtml).join('')}
      </div>
    `;
  }).join('') || '';
}

function emptyStateHtml() {
  const isAdmin = currentUser && currentUser.isAdmin;
  return `
    <div class="empty-state">
      <div class="emoji">🛍️</div>
      <h4>ยังไม่มีสินค้าในร้าน</h4>
      <p>${isAdmin ? 'เพิ่มสินค้าชิ้นแรกได้เลยที่แผงแอดมิน' : 'ร้านนี้กำลังเตรียมสินค้า แวะมาดูใหม่อีกครั้งนะ'}</p>
      ${isAdmin ? '<button class="btn-primary" onclick="showView(\'admin\')">➕ เพิ่มสินค้าใหม่</button>' : ''}
    </div>
  `;
}

let searchDebounce;
function onSearchInput() {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(loadProductsAndCategories, 250);
}

async function addToCart(productId) {
  if (!currentUser) { alert('กรุณาเข้าสู่ระบบก่อนสั่งซื้อ'); showView('login'); return; }
  try {
    await api('/api/cart/add', { method: 'POST', body: JSON.stringify({ productId, qty: 1 }) });
    await loadCartCount();
    alert('เพิ่มลงตะกร้าแล้ว');
  } catch (err) {
    alert(err.message);
  }
}

async function loadCartCount() {
  if (!currentUser) { document.getElementById('cart-count').textContent = '0'; return; }
  const cart = await api('/api/cart');
  const count = cart.items.reduce((sum, i) => sum + i.qty, 0);
  document.getElementById('cart-count').textContent = count;
}

// ================== Cart ==================
async function loadCart() {
  if (!currentUser) { showView('login'); return; }
  const cart = await api('/api/cart');
  const list = document.getElementById('cart-list');
  list.innerHTML = cart.items.map(i => `
    <div class="cart-row">
      <div class="name">${escapeHtml(i.name)} <div class="game" style="display:inline">(${typeLabels[i.type] || i.type})</div></div>
      <div>${i.priceBaht} ฿</div>
      <input type="number" min="0" value="${i.qty}" onchange="updateCartQty(${i.productId}, this.value)" />
      <div>${i.lineTotalBaht} ฿</div>
      <button onclick="removeFromCart(${i.productId})">ลบ</button>
    </div>
  `).join('') || '<div class="info-card">ตะกร้าว่างเปล่า ไปเลือกสินค้าที่ถูกใจกันเถอะ 🛍️</div>';
  document.getElementById('cart-total').textContent = cart.totalBaht + ' ฿';
  loadCartCount();
}

async function updateCartQty(productId, qty) {
  try {
    await api('/api/cart/update', { method: 'POST', body: JSON.stringify({ productId, qty }) });
    loadCart();
  } catch (err) {
    alert(err.message);
    loadCart();
  }
}

async function removeFromCart(productId) {
  await api('/api/cart/remove', { method: 'POST', body: JSON.stringify({ productId }) });
  loadCart();
}

// ================== Checkout ==================
async function checkout(paymentMethod) {
  try {
    const result = await api('/api/checkout', { method: 'POST', body: JSON.stringify({ paymentMethod }) });
    loadCartCount();
    if (result.paymentMethod === 'wallet') {
      alert('ชำระเงินด้วยกระเป๋าเงินสำเร็จ! ดูโค้ด/รายละเอียดสินค้าได้ที่หน้า "คำสั่งซื้อของฉัน"');
      await refreshMe();
      showView('orders');
      return;
    }
    const qrInfo = await api(`/api/orders/${result.orderId}/promptpay-qr`);
    document.getElementById('pay-box').innerHTML = `
      <p>ยอดชำระ: <strong>${qrInfo.amountBaht} ฿</strong></p>
      <img src="${qrInfo.qrDataUrl}" alt="พร้อมเพย์ QR" />
      <p>สแกน QR นี้ด้วยแอปธนาคารเพื่อชำระเงิน</p>
      <p style="color:#736f8c;font-size:13px">หลังโอนเงินแล้ว ระบบจะยืนยันออเดอร์ให้เมื่อแอดมินตรวจสอบยอดเงินเรียบร้อย คุณสามารถดูสถานะได้ที่หน้า "คำสั่งซื้อของฉัน"</p>
      <button class="btn-primary" onclick="showView('orders')">ไปหน้าคำสั่งซื้อของฉัน</button>
    `;
    showView('pay');
  } catch (err) {
    alert(err.message);
  }
}

// ================== Orders ==================
const statusLabels = { paid: 'ชำระเงินแล้ว', pending: 'รอตรวจสอบการชำระเงิน', cancelled: 'ยกเลิก' };

async function loadOrders() {
  if (!currentUser) { showView('login'); return; }
  const orders = await api('/api/orders');
  const list = document.getElementById('orders-list');
  list.innerHTML = orders.map(o => `
    <div class="order-card">
      <div>ออเดอร์ #${o.id} — <span class="status-${o.status}">${statusLabels[o.status] || o.status}</span></div>
      <div>ยอดรวม: ${o.totalBaht} ฿ | ช่องทาง: ${o.payment_method === 'promptpay' ? 'พร้อมเพย์' : 'กระเป๋าเงิน'}</div>
      <ul>
        ${o.items.map(i => `<li>${escapeHtml(i.product_name)} x${i.qty} — ${(i.unit_price * i.qty / 100).toFixed(2)} ฿</li>`).join('')}
      </ul>
      ${o.codes.length ? `
        <div><strong>ข้อมูล/โค้ดของคุณ:</strong>
        ${o.codes.map(c => `<div class="code-item">${escapeHtml(c.payload)}</div>`).join('')}
        </div>
      ` : ''}
    </div>
  `).join('') || '<div class="info-card">ยังไม่มีคำสั่งซื้อ</div>';
}

// ================== Wallet ==================
async function loadWallet() {
  if (!currentUser) { showView('login'); return; }
  await refreshMe();
  document.getElementById('wallet-balance-full').textContent = currentUser.walletBalanceBaht + ' ฿';
  const topups = await api('/api/wallet/topups');
  const topupLabels = { pending: 'รอตรวจสอบ', confirmed: 'สำเร็จ', rejected: 'ถูกปฏิเสธ' };
  document.getElementById('topup-history').innerHTML = topups.map(t => `
    <div class="admin-row">
      <div>#${t.id} — ${t.amountBaht} ฿</div>
      <div>${topupLabels[t.status] || t.status}</div>
    </div>
  `).join('') || '<div class="info-card">ยังไม่มีประวัติ</div>';
  resetTopupWizard();
}

// -------- Top-up wizard (เลือกช่องทาง → จำนวนเงิน → ชำระเงิน → ยืนยัน → สำเร็จ) --------
let wizardLastTopup = null;

function wizardGoTo(step) {
  document.querySelectorAll('.wizard-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById('wizard-panel-' + step).classList.remove('hidden');
  document.querySelectorAll('.wizard-step').forEach(el => {
    const s = parseInt(el.dataset.step, 10);
    el.classList.toggle('active', s === step);
    el.classList.toggle('done', s < step);
  });
}

function setTopupAmount(v) {
  document.getElementById('topup-amount').value = v;
}

async function wizardGoToPayment() {
  const errEl = document.getElementById('wizard-amount-error');
  errEl.textContent = '';
  const amountBaht = document.getElementById('topup-amount').value;
  if (!amountBaht || parseFloat(amountBaht) < 20) { errEl.textContent = 'กรุณาระบุจำนวนเงินอย่างน้อย 20 บาท'; return; }
  try {
    const info = await api('/api/wallet/topup', { method: 'POST', body: JSON.stringify({ amountBaht }) });
    wizardLastTopup = info;
    document.getElementById('topup-qr-box').innerHTML = `
      <div class="pay-box">
        <p>เติมเงิน: <strong>${info.amountBaht} ฿</strong></p>
        <img src="${info.qrDataUrl}" alt="พร้อมเพย์ QR" />
        <p class="muted">สแกน QR นี้ด้วยแอปธนาคารเพื่อโอนเงิน</p>
      </div>
    `;
    wizardGoTo(3);
  } catch (err) {
    errEl.textContent = err.message;
  }
}

function confirmTopupSubmitted() {
  const info = wizardLastTopup;
  document.getElementById('wizard-success-msg').textContent = info
    ? `แจ้งเติมเงิน #${info.topupId} จำนวน ${info.amountBaht} ฿ เรียบร้อย รอแอดมินตรวจสอบและเพิ่มยอดให้ครับ`
    : 'แจ้งเติมเงินเรียบร้อย รอแอดมินตรวจสอบและเพิ่มยอดให้ครับ';
  wizardGoTo(5);
  loadWallet();
}

function resetTopupWizard() {
  wizardLastTopup = null;
  document.getElementById('topup-amount').value = '';
  document.getElementById('topup-qr-box').innerHTML = '';
  const errEl = document.getElementById('wizard-amount-error');
  if (errEl) errEl.textContent = '';
  wizardGoTo(1);
}

// ================== Admin ==================
async function loadAdmin() {
  if (!currentUser || !currentUser.isAdmin) { showView('shop'); return; }
  loadAdminBanners();
  const orders = await api('/api/admin/orders');
  document.getElementById('admin-orders').innerHTML = orders.filter(o => o.status === 'pending').map(o => `
    <div class="admin-row">
      <div>#${o.id} — ${escapeHtml(o.username)} — ${o.totalBaht} ฿</div>
      <div>
        <button class="btn-secondary" onclick="confirmOrder(${o.id})">ยืนยันชำระเงิน</button>
        <button onclick="cancelOrder(${o.id})">ยกเลิก</button>
      </div>
    </div>
  `).join('') || '<p>ไม่มีออเดอร์ค้างชำระ</p>';

  const topups = await api('/api/admin/topups');
  document.getElementById('admin-topups').innerHTML = topups.filter(t => t.status === 'pending').map(t => `
    <div class="admin-row">
      <div>#${t.id} — ${escapeHtml(t.username)} — ${t.amountBaht} ฿</div>
      <div>
        <button class="btn-secondary" onclick="confirmTopup(${t.id})">ยืนยันรับเงิน</button>
        <button onclick="rejectTopup(${t.id})">ปฏิเสธ</button>
      </div>
    </div>
  `).join('') || '<p>ไม่มีรายการเติมเงินค้างอยู่</p>';
}

async function confirmOrder(id) { await api(`/api/admin/orders/${id}/confirm`, { method: 'POST' }); loadAdmin(); loadShop(); }
async function cancelOrder(id) { await api(`/api/admin/orders/${id}/cancel`, { method: 'POST' }); loadAdmin(); }
async function confirmTopup(id) { await api(`/api/admin/topups/${id}/confirm`, { method: 'POST' }); loadAdmin(); }
async function rejectTopup(id) { await api(`/api/admin/topups/${id}/reject`, { method: 'POST' }); loadAdmin(); }

async function addProduct(e) {
  e.preventDefault();
  const msgEl = document.getElementById('admin-product-msg');
  msgEl.textContent = '';
  msgEl.classList.remove('error');
  const codes = document.getElementById('p-codes').value.split('\n').map(s => s.trim()).filter(Boolean);
  const imageFile = document.getElementById('p-image').files[0];

  const formData = new FormData();
  formData.append('name', document.getElementById('p-name').value);
  formData.append('type', document.getElementById('p-type').value);
  formData.append('game', document.getElementById('p-game').value);
  formData.append('subcategory', document.getElementById('p-subcategory').value);
  formData.append('priceBaht', document.getElementById('p-price').value);
  formData.append('compareAtPriceBaht', document.getElementById('p-compare-price').value);
  formData.append('isHot', document.getElementById('p-hot').checked ? 'true' : 'false');
  formData.append('description', document.getElementById('p-description').value);
  formData.append('codes', JSON.stringify(codes));
  if (imageFile) formData.append('image', imageFile);

  try {
    await api('/api/admin/products', { method: 'POST', body: formData });
    msgEl.textContent = 'เพิ่มสินค้าสำเร็จ';
    e.target.reset();
    document.getElementById('p-image-preview').classList.add('hidden');
    loadShop();
  } catch (err) {
    msgEl.textContent = err.message;
    msgEl.classList.add('error');
  }
  return false;
}

document.addEventListener('DOMContentLoaded', () => {
  const imageInput = document.getElementById('p-image');
  if (imageInput) {
    imageInput.addEventListener('change', () => {
      const preview = document.getElementById('p-image-preview');
      const file = imageInput.files[0];
      if (file) {
        preview.src = URL.createObjectURL(file);
        preview.classList.remove('hidden');
      } else {
        preview.classList.add('hidden');
      }
    });
  }
});

// ================== Reviews ==================
let selectedRating = 0;

async function loadReviews() {
  const data = await api('/api/reviews');
  const summaryEl = document.getElementById('review-summary');
  summaryEl.innerHTML = data.count ? `
    <div class="avg-score">${data.average.toFixed(1)}</div>
    <div>
      <div class="avg-stars">${'★'.repeat(Math.round(data.average))}${'☆'.repeat(5 - Math.round(data.average))}</div>
      <div class="avg-count">จาก ${data.count} รีวิว</div>
    </div>
  ` : `<div class="muted">ยังไม่มีรีวิว เป็นคนแรกที่รีวิวร้านนี้กันเถอะ!</div>`;

  document.getElementById('reviews-list').innerHTML = data.reviews.map(r => `
    <div class="review-card">
      <div class="review-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>
      <div class="review-user">${escapeHtml(r.username)} <span class="review-date">· ${new Date(r.created_at.replace(' ', 'T') + 'Z').toLocaleDateString('th-TH')}</span></div>
      ${r.comment ? `<div>${escapeHtml(r.comment)}</div>` : ''}
    </div>
  `).join('') || '<div class="info-card">ยังไม่มีรีวิว</div>';

  const formBox = document.getElementById('review-form-box');
  const loginHint = document.getElementById('review-login-hint');
  if (currentUser) {
    formBox.classList.remove('hidden');
    loginHint.classList.add('hidden');
  } else {
    formBox.classList.add('hidden');
    loginHint.classList.remove('hidden');
  }
  selectedRating = 0;
  updateStarPicker();
  document.getElementById('review-comment').value = '';
  document.getElementById('review-msg').textContent = '';
}

function updateStarPicker() {
  document.querySelectorAll('#star-picker span').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.star, 10) <= selectedRating);
  });
}

document.addEventListener('click', (e) => {
  if (e.target && e.target.closest('#star-picker') && e.target.dataset.star) {
    selectedRating = parseInt(e.target.dataset.star, 10);
    updateStarPicker();
  }
});

async function submitReview(e) {
  e.preventDefault();
  const msgEl = document.getElementById('review-msg');
  msgEl.textContent = ''; msgEl.classList.remove('error');
  if (!selectedRating) { msgEl.textContent = 'กรุณาเลือกจำนวนดาว'; msgEl.classList.add('error'); return false; }
  try {
    await api('/api/reviews', { method: 'POST', body: JSON.stringify({ rating: selectedRating, comment: document.getElementById('review-comment').value }) });
    msgEl.textContent = 'ขอบคุณสำหรับรีวิว!';
    loadReviews();
  } catch (err) {
    msgEl.textContent = err.message;
    msgEl.classList.add('error');
  }
  return false;
}

// ================== Contact ==================
async function loadContactInfo() {
  const s = await api('/api/settings');
  const cards = [];
  if (s.lineId) cards.push({ icon: '💬', label: 'LINE', value: escapeHtml(s.lineId) });
  if (s.facebookUrl) cards.push({ icon: '📘', label: 'Facebook', value: `<a href="${s.facebookUrl}" target="_blank" rel="noopener">${escapeHtml(s.facebookUrl)}</a>` });
  if (s.phone) cards.push({ icon: '📞', label: 'โทรศัพท์', value: escapeHtml(s.phone) });
  if (s.businessHours) cards.push({ icon: '🕒', label: 'เวลาทำการ', value: escapeHtml(s.businessHours) });

  document.getElementById('contact-info').innerHTML = cards.length
    ? cards.map(c => `
        <div class="contact-card">
          <div class="contact-icon">${c.icon}</div>
          <div><div class="contact-label">${c.label}</div><div class="contact-value">${c.value}</div></div>
        </div>
      `).join('')
    : '<div class="info-card">ร้านยังไม่ได้ตั้งค่าข้อมูลติดต่อ (แอดมินตั้งค่าได้ที่แผงแอดมิน)</div>';
}

async function saveContactSettings(e) {
  e.preventDefault();
  const msgEl = document.getElementById('admin-contact-msg');
  msgEl.textContent = '';
  try {
    await api('/api/admin/settings', {
      method: 'POST',
      body: JSON.stringify({
        lineId: document.getElementById('s-line').value,
        facebookUrl: document.getElementById('s-facebook').value,
        phone: document.getElementById('s-phone').value,
        businessHours: document.getElementById('s-hours').value
      })
    });
    msgEl.textContent = 'บันทึกข้อมูลติดต่อแล้ว';
  } catch (err) {
    msgEl.textContent = err.message;
    msgEl.classList.add('error');
  }
  return false;
}

// ================== Admin: banners ==================
async function loadAdminBanners() {
  const banners = await api('/api/admin/banners');
  document.getElementById('admin-banners-list').innerHTML = banners.map(b => `
    <div class="admin-banner-row">
      ${b.image_url ? `<img src="${b.image_url}" alt="${escapeHtml(b.title)}" />` : '<div class="thumb-placeholder" style="width:70px;height:40px;margin:0;">🖼️</div>'}
      <div class="banner-title">${escapeHtml(b.title)}</div>
      <button onclick="deleteBanner(${b.id})">ลบ</button>
    </div>
  `).join('') || '<p class="muted">ยังไม่มีแบนเนอร์ — ถ้าไม่เพิ่มเลย หน้าแรกจะโชว์แบนเนอร์เริ่มต้นแทน</p>';

  const settings = await api('/api/settings');
  document.getElementById('s-line').value = settings.lineId || '';
  document.getElementById('s-facebook').value = settings.facebookUrl || '';
  document.getElementById('s-phone').value = settings.phone || '';
  document.getElementById('s-hours').value = settings.businessHours || '';
}

async function addBanner(e) {
  e.preventDefault();
  const msgEl = document.getElementById('admin-banner-msg');
  msgEl.textContent = ''; msgEl.classList.remove('error');
  const imageFile = document.getElementById('b-image').files[0];
  const formData = new FormData();
  formData.append('title', document.getElementById('b-title').value);
  formData.append('subtitle', document.getElementById('b-subtitle').value);
  formData.append('linkUrl', document.getElementById('b-link').value);
  if (imageFile) formData.append('image', imageFile);
  try {
    await api('/api/admin/banners', { method: 'POST', body: formData });
    msgEl.textContent = 'เพิ่มแบนเนอร์แล้ว';
    e.target.reset();
    loadAdminBanners();
    loadBannerCarousel();
  } catch (err) {
    msgEl.textContent = err.message;
    msgEl.classList.add('error');
  }
  return false;
}

async function deleteBanner(id) {
  await api(`/api/admin/banners/${id}/delete`, { method: 'POST' });
  loadAdminBanners();
  loadBannerCarousel();
}

// ================== Helpers ==================
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ================== Init ==================
(async function init() {
  await refreshMe();
  showView('shop');
  loadCartCount();
})();
