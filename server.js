const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const QRCode = require('qrcode');
const generatePayload = require('promptpay-qr');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// ================== อัปโหลดรูปสินค้า ==================
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `product-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) {
      return cb(new Error('รองรับเฉพาะไฟล์รูปภาพ (jpg, png, webp, gif)'));
    }
    cb(null, true);
  }
});

// ================== ตั้งค่าพร้อมเพย์ของร้าน ==================
// TODO: แก้เป็นเบอร์โทร หรือเลขบัตรประชาชน/เลขผู้เสียภาษีของร้านคุณเอง
const SHOP_PROMPTPAY_ID = process.env.PROMPTPAY_ID || '0812345678';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-secret-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 7 วัน
}));

// ================== Helpers ==================
function requireLogin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อน' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อน' });
  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.session.userId);
  if (!user || !user.is_admin) return res.status(403).json({ error: 'สำหรับแอดมินเท่านั้น' });
  next();
}

function baht(satang) {
  return (satang / 100).toFixed(2);
}

// ================== Auth ==================
app.post('/api/register', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password || password.length < 6) {
    return res.status(400).json({ error: 'กรอกชื่อผู้ใช้ และรหัสผ่านอย่างน้อย 6 ตัวอักษร' });
  }
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return res.status(400).json({ error: 'ชื่อผู้ใช้นี้ถูกใช้แล้ว' });

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);
  req.session.userId = info.lastInsertRowid;
  res.json({ ok: true, username });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(400).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  }
  req.session.userId = user.id;
  res.json({ ok: true, username: user.username, isAdmin: !!user.is_admin });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ loggedIn: false });
  const user = db.prepare('SELECT id, username, wallet_balance, is_admin FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.json({ loggedIn: false });
  res.json({
    loggedIn: true,
    username: user.username,
    isAdmin: !!user.is_admin,
    walletBalance: user.wallet_balance,
    walletBalanceBaht: baht(user.wallet_balance)
  });
});

// ================== Products ==================
app.get('/api/products', (req, res) => {
  const { type, game, q } = req.query;
  let sql = 'SELECT id, name, type, game, description, price, compare_at_price, is_hot, stock, image_url FROM products WHERE active = 1';
  const params = [];
  if (type) { sql += ' AND type = ?'; params.push(type); }
  if (game) { sql += ' AND game = ?'; params.push(game); }
  if (q) { sql += ' AND (name LIKE ? OR game LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY created_at DESC';
  const products = db.prepare(sql).all(...params);
  res.json(products.map(p => ({
    ...p,
    priceBaht: baht(p.price),
    compareAtPriceBaht: p.compare_at_price ? baht(p.compare_at_price) : null
  })));
});

// รายการหมวดหมู่ (จัดกลุ่มตามชื่อเกม) พร้อมจำนวนสินค้าและช่วงราคา — ใช้แสดงเป็นการ์ดหมวดหมู่หน้าแรก
app.get('/api/categories', (req, res) => {
  const rows = db.prepare(`
    SELECT game, COUNT(*) AS productCount, MIN(price) AS minPrice, MAX(price) AS maxPrice
    FROM products WHERE active = 1
    GROUP BY game
    ORDER BY MIN(created_at) ASC
  `).all();
  res.json(rows.map(r => ({
    game: r.game,
    productCount: r.productCount,
    minPriceBaht: baht(r.minPrice),
    maxPriceBaht: baht(r.maxPrice)
  })));
});

// สถิติสรุปสำหรับแดชบอร์ดหน้าแรก
app.get('/api/stats', (req, res) => {
  const users = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const stock = db.prepare('SELECT COALESCE(SUM(stock), 0) AS s FROM products WHERE active = 1').get().s;
  const salesCount = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status = 'paid'").get().c;
  const revenue = db.prepare("SELECT COALESCE(SUM(total), 0) AS t FROM orders WHERE status = 'paid'").get().t;
  res.json({
    users,
    stock,
    salesCount,
    revenueBaht: baht(revenue)
  });
});

app.get('/api/products/:id', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'ไม่พบสินค้า' });
  res.json({
    ...product,
    priceBaht: baht(product.price),
    compareAtPriceBaht: product.compare_at_price ? baht(product.compare_at_price) : null
  });
});

// ================== Cart ==================
app.get('/api/cart', requireLogin, (req, res) => {
  const items = db.prepare(`
    SELECT c.product_id AS productId, c.qty, p.name, p.price, p.stock, p.type, p.game
    FROM cart_items c JOIN products p ON p.id = c.product_id
    WHERE c.user_id = ?
  `).all(req.session.userId);
  const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  res.json({
    items: items.map(i => ({ ...i, lineTotalBaht: baht(i.price * i.qty), priceBaht: baht(i.price) })),
    totalBaht: baht(total),
    total
  });
});

app.post('/api/cart/add', requireLogin, (req, res) => {
  const { productId, qty } = req.body || {};
  const addQty = Math.max(1, parseInt(qty, 10) || 1);
  const product = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(productId);
  if (!product) return res.status(404).json({ error: 'ไม่พบสินค้า' });

  const existing = db.prepare('SELECT * FROM cart_items WHERE user_id = ? AND product_id = ?')
    .get(req.session.userId, productId);
  const newQty = (existing ? existing.qty : 0) + addQty;
  if (newQty > product.stock) {
    return res.status(400).json({ error: `สินค้าคงเหลือไม่พอ (เหลือ ${product.stock} ชิ้น)` });
  }
  if (existing) {
    db.prepare('UPDATE cart_items SET qty = ? WHERE id = ?').run(newQty, existing.id);
  } else {
    db.prepare('INSERT INTO cart_items (user_id, product_id, qty) VALUES (?, ?, ?)')
      .run(req.session.userId, productId, addQty);
  }
  res.json({ ok: true });
});

app.post('/api/cart/update', requireLogin, (req, res) => {
  const { productId, qty } = req.body || {};
  const newQty = parseInt(qty, 10);
  if (!newQty || newQty < 1) {
    db.prepare('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?').run(req.session.userId, productId);
    return res.json({ ok: true, removed: true });
  }
  const product = db.prepare('SELECT stock FROM products WHERE id = ?').get(productId);
  if (product && newQty > product.stock) {
    return res.status(400).json({ error: `สินค้าคงเหลือไม่พอ (เหลือ ${product.stock} ชิ้น)` });
  }
  db.prepare('UPDATE cart_items SET qty = ? WHERE user_id = ? AND product_id = ?')
    .run(newQty, req.session.userId, productId);
  res.json({ ok: true });
});

app.post('/api/cart/remove', requireLogin, (req, res) => {
  const { productId } = req.body || {};
  db.prepare('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?').run(req.session.userId, productId);
  res.json({ ok: true });
});

// ================== Checkout ==================
// สร้างออเดอร์จากตะกร้า พร้อมช่องทางชำระเงิน 'promptpay' หรือ 'wallet'
app.post('/api/checkout', requireLogin, (req, res) => {
  const { paymentMethod } = req.body || {};
  if (!['promptpay', 'wallet'].includes(paymentMethod)) {
    return res.status(400).json({ error: 'เลือกช่องทางชำระเงินไม่ถูกต้อง' });
  }

  const cartItems = db.prepare(`
    SELECT c.product_id AS productId, c.qty, p.name, p.price, p.stock
    FROM cart_items c JOIN products p ON p.id = c.product_id
    WHERE c.user_id = ?
  `).all(req.session.userId);

  if (cartItems.length === 0) return res.status(400).json({ error: 'ตะกร้าว่างเปล่า' });

  for (const item of cartItems) {
    if (item.qty > item.stock) {
      return res.status(400).json({ error: `${item.name} คงเหลือไม่พอ (เหลือ ${item.stock} ชิ้น)` });
    }
  }

  const total = cartItems.reduce((sum, i) => sum + i.price * i.qty, 0);

  const createOrder = db.transaction(() => {
    const orderInfo = db.prepare(`
      INSERT INTO orders (user_id, total, payment_method, status) VALUES (?, ?, ?, 'pending')
    `).run(req.session.userId, total, paymentMethod);
    const orderId = orderInfo.lastInsertRowid;

    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, product_id, product_name, unit_price, qty) VALUES (?, ?, ?, ?, ?)
    `);
    for (const item of cartItems) {
      insertItem.run(orderId, item.productId, item.name, item.price, item.qty);
    }
    db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(req.session.userId);
    return orderId;
  });

  const orderId = createOrder();

  if (paymentMethod === 'wallet') {
    // จ่ายด้วยยอดกระเป๋าเงินทันที ถ้ายอดพอ
    const user = db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(req.session.userId);
    if (user.wallet_balance < total) {
      db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(orderId);
      return res.status(400).json({ error: 'ยอดเงินในกระเป๋าไม่เพียงพอ กรุณาเติมเงินก่อน', orderId });
    }
    const pay = db.transaction(() => {
      db.prepare('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?').run(total, req.session.userId);
      db.prepare("UPDATE orders SET status = 'paid', paid_at = datetime('now') WHERE id = ?").run(orderId);
      fulfillOrder(orderId);
    });
    pay();
    return res.json({ ok: true, orderId, status: 'paid', paymentMethod: 'wallet' });
  }

  // paymentMethod === 'promptpay' -> คืน QR ให้ลูกค้าสแกนจ่าย แล้วรอแอดมินยืนยัน
  return res.json({
    ok: true,
    orderId,
    status: 'pending',
    paymentMethod: 'promptpay',
    amountBaht: baht(total)
  });
});

// สร้างรูป QR พร้อมเพย์สำหรับออเดอร์ที่ระบุ (เรียกแยกเพื่อให้หน้าเว็บ render ภาพได้)
app.get('/api/orders/:id/promptpay-qr', requireLogin, async (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!order) return res.status(404).json({ error: 'ไม่พบออเดอร์' });
  if (order.payment_method !== 'promptpay') return res.status(400).json({ error: 'ออเดอร์นี้ไม่ได้ใช้ช่องทางพร้อมเพย์' });

  try {
    const payload = generatePayload(SHOP_PROMPTPAY_ID, { amount: order.total / 100 });
    const qrDataUrl = await QRCode.toDataURL(payload);
    res.json({ qrDataUrl, amountBaht: baht(order.total), promptpayId: SHOP_PROMPTPAY_ID });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'สร้าง QR ไม่สำเร็จ' });
  }
});

app.get('/api/orders', requireLogin, (req, res) => {
  const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(req.session.userId);
  const withItems = orders.map(o => {
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id);
    const codes = o.status === 'paid'
      ? db.prepare(`
          SELECT si.payload, si.product_id AS productId
          FROM product_stock_items si
          JOIN order_items oi ON oi.id = si.order_item_id
          WHERE oi.order_id = ?
        `).all(o.id)
      : [];
    return { ...o, totalBaht: baht(o.total), items, codes };
  });
  res.json(withItems);
});

// ดึงโค้ด/ข้อมูลไอเท็มดิจิทัลที่ยังไม่ได้ขาย มามอบให้ order_item ที่จ่ายเงินแล้ว
function fulfillOrder(orderId) {
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
  for (const item of items) {
    const available = db.prepare(`
      SELECT * FROM product_stock_items WHERE product_id = ? AND is_sold = 0 LIMIT ?
    `).all(item.product_id, item.qty);
    for (const stockItem of available) {
      db.prepare('UPDATE product_stock_items SET is_sold = 1, order_item_id = ? WHERE id = ?')
        .run(item.id, stockItem.id);
    }
    db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(item.qty, item.product_id);
  }
}

// ================== Wallet (พร้อมเพย์เติมเงิน) ==================
app.post('/api/wallet/topup', requireLogin, async (req, res) => {
  const { amountBaht } = req.body || {};
  const amount = Math.round(parseFloat(amountBaht) * 100);
  if (!amount || amount < 2000) { // ขั้นต่ำ 20 บาท
    return res.status(400).json({ error: 'กรุณาระบุจำนวนเงินอย่างน้อย 20 บาท' });
  }
  const info = db.prepare('INSERT INTO wallet_topups (user_id, amount) VALUES (?, ?)').run(req.session.userId, amount);
  const topupId = info.lastInsertRowid;

  try {
    const payload = generatePayload(SHOP_PROMPTPAY_ID, { amount: amount / 100 });
    const qrDataUrl = await QRCode.toDataURL(payload);
    res.json({ ok: true, topupId, qrDataUrl, amountBaht: baht(amount), promptpayId: SHOP_PROMPTPAY_ID });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'สร้าง QR ไม่สำเร็จ' });
  }
});

app.get('/api/wallet/topups', requireLogin, (req, res) => {
  const topups = db.prepare('SELECT * FROM wallet_topups WHERE user_id = ? ORDER BY created_at DESC').all(req.session.userId);
  res.json(topups.map(t => ({ ...t, amountBaht: baht(t.amount) })));
});

// ================== Admin ==================
// เนื่องจากพร้อมเพย์แบบไม่ผูกธนาคาร/เกตเวย์ ไม่สามารถตรวจสอบยอดเงินเข้าอัตโนมัติได้
// ผู้ดูแลระบบต้องเช็คสลิป/ยอดเงินเข้าเอง แล้วกดยืนยันในหน้าแอดมิน
app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const orders = db.prepare(`
    SELECT o.*, u.username FROM orders o JOIN users u ON u.id = o.user_id
    WHERE o.payment_method = 'promptpay'
    ORDER BY o.created_at DESC
  `).all();
  res.json(orders.map(o => ({ ...o, totalBaht: baht(o.total) })));
});

app.post('/api/admin/orders/:id/confirm', requireAdmin, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'ไม่พบออเดอร์' });
  if (order.status !== 'pending') return res.status(400).json({ error: 'ออเดอร์นี้ถูกดำเนินการไปแล้ว' });
  db.prepare("UPDATE orders SET status = 'paid', paid_at = datetime('now') WHERE id = ?").run(order.id);
  fulfillOrder(order.id);
  res.json({ ok: true });
});

app.post('/api/admin/orders/:id/cancel', requireAdmin, (req, res) => {
  db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ? AND status = 'pending'").run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/admin/topups', requireAdmin, (req, res) => {
  const topups = db.prepare(`
    SELECT t.*, u.username FROM wallet_topups t JOIN users u ON u.id = t.user_id
    ORDER BY t.created_at DESC
  `).all();
  res.json(topups.map(t => ({ ...t, amountBaht: baht(t.amount) })));
});

app.post('/api/admin/topups/:id/confirm', requireAdmin, (req, res) => {
  const topup = db.prepare('SELECT * FROM wallet_topups WHERE id = ?').get(req.params.id);
  if (!topup) return res.status(404).json({ error: 'ไม่พบรายการเติมเงิน' });
  if (topup.status !== 'pending') return res.status(400).json({ error: 'รายการนี้ถูกดำเนินการไปแล้ว' });
  const confirm = db.transaction(() => {
    db.prepare("UPDATE wallet_topups SET status = 'confirmed', confirmed_at = datetime('now') WHERE id = ?").run(topup.id);
    db.prepare('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?').run(topup.amount, topup.user_id);
  });
  confirm();
  res.json({ ok: true });
});

app.post('/api/admin/topups/:id/reject', requireAdmin, (req, res) => {
  db.prepare("UPDATE wallet_topups SET status = 'rejected' WHERE id = ? AND status = 'pending'").run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/admin/products', requireAdmin, upload.single('image'), (req, res) => {
  const { name, type, game, description, priceBaht, compareAtPriceBaht, isHot, stock } = req.body || {};
  if (!name || !type || !game || !priceBaht) return res.status(400).json({ error: 'กรอกข้อมูลไม่ครบ' });

  let codeList = [];
  try {
    const rawCodes = req.body.codes;
    codeList = rawCodes ? (Array.isArray(rawCodes) ? rawCodes : JSON.parse(rawCodes)) : [];
  } catch (_) {
    codeList = [];
  }
  codeList = codeList.filter(Boolean);

  const price = Math.round(parseFloat(priceBaht) * 100);
  const compareAtPrice = compareAtPriceBaht ? Math.round(parseFloat(compareAtPriceBaht) * 100) : null;
  const isHotVal = (isHot === 'true' || isHot === true || isHot === 'on') ? 1 : 0;
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

  const info = db.prepare(`
    INSERT INTO products (name, type, game, description, price, compare_at_price, is_hot, stock, image_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, type, game, description || '', price, compareAtPrice, isHotVal, codeList.length || parseInt(stock, 10) || 0, imageUrl);
  const productId = info.lastInsertRowid;
  const insertStock = db.prepare('INSERT INTO product_stock_items (product_id, payload) VALUES (?, ?)');
  for (const c of codeList) insertStock.run(productId, c);
  res.json({ ok: true, productId });
});

// จับ error จาก multer (เช่น ไฟล์ใหญ่เกิน หรือไม่ใช่ไฟล์รูป) ให้ตอบกลับเป็น JSON แทนที่จะพัง
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || (err && err.message && err.message.includes('รองรับเฉพาะไฟล์รูปภาพ'))) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

app.listen(PORT, () => {
  console.log(`เว็บขายไอเท็มเกมกำลังทำงานที่ http://localhost:${PORT}`);
});
