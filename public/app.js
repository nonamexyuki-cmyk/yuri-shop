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
  await Promise.all([loadStats(), loadProductsAndCategories()]);
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
      <span class="tag">${typeLabels[p.type] || p.type}</span>
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
    return `
      <div class="category-banner">
        <div>
          <div class="cat-name">🎮 ${escapeHtml(game)}</div>
          <div class="cat-meta">${products.length} สินค้า</div>
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
  `).join('') || '<p>ยังไม่มีประวัติ</p>';
}

async function topupWallet() {
  const amountBaht = document.getElementById('topup-amount').value;
  try {
    const info = await api('/api/wallet/topup', { method: 'POST', body: JSON.stringify({ amountBaht }) });
    document.getElementById('topup-qr-box').innerHTML = `
      <div class="pay-box">
        <p>เติมเงิน: <strong>${info.amountBaht} ฿</strong></p>
        <img src="${info.qrDataUrl}" alt="พร้อมเพย์ QR" />
        <p style="color:#736f8c;font-size:13px">หลังโอนเงินแล้ว รอแอดมินยืนยัน ยอดเงินจะเข้ากระเป๋าอัตโนมัติ</p>
      </div>
    `;
    loadWallet();
  } catch (err) {
    alert(err.message);
  }
}

// ================== Admin ==================
async function loadAdmin() {
  if (!currentUser || !currentUser.isAdmin) { showView('shop'); return; }
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
