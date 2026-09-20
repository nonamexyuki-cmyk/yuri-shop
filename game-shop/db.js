const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'shop.db'));
db.exec('PRAGMA journal_mode = WAL;');

// เพิ่มเมธอด db.transaction(fn) แบบเดียวกับ better-sqlite3 เพื่อให้โค้ดส่วนอื่นไม่ต้องแก้
// เรียกแล้วจะได้ฟังก์ชันกลับมา เวลาเรียกฟังก์ชันนั้นจะ BEGIN/COMMIT ให้อัตโนมัติ (ROLLBACK ถ้า error)
db.transaction = function (fn) {
  return function (...args) {
    db.exec('BEGIN');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch (_) { /* ignore */ }
      throw err;
    }
  };
};

// ---------- Schema ----------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  wallet_balance INTEGER NOT NULL DEFAULT 0, -- เก็บเป็นสตางค์ (1 บาท = 100)
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('item','code','account')), -- ไอเท็ม / โค้ดเกม / ไอดีเกม
  game TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL, -- สตางค์ (ราคาขายจริง)
  compare_at_price INTEGER, -- สตางค์ (ราคาก่อนลด แสดงขีดฆ่า ถ้ามี)
  is_hot INTEGER NOT NULL DEFAULT 0, -- แสดงป้าย HOT บนการ์ดสินค้า
  stock INTEGER NOT NULL DEFAULT 0,
  image_url TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- สต๊อกจริงของสินค้าดิจิทัล เช่น ตัวโค้ด/ข้อมูลไอดี ที่จะส่งให้ลูกค้าหลังจ่ายเงินสำเร็จ
CREATE TABLE IF NOT EXISTS product_stock_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  payload TEXT NOT NULL, -- เช่น รหัสโค้ด หรือ user/pass ไอดีเกม
  is_sold INTEGER NOT NULL DEFAULT 0,
  order_item_id INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cart_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty INTEGER NOT NULL DEFAULT 1,
  UNIQUE(user_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  total INTEGER NOT NULL, -- สตางค์
  payment_method TEXT NOT NULL CHECK(payment_method IN ('promptpay','wallet')),
  status TEXT NOT NULL DEFAULT 'pending', -- pending / paid / cancelled
  promptpay_ref TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  paid_at TEXT
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  unit_price INTEGER NOT NULL,
  qty INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS wallet_topups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL, -- สตางค์
  status TEXT NOT NULL DEFAULT 'pending', -- pending / confirmed / rejected
  created_at TEXT DEFAULT (datetime('now')),
  confirmed_at TEXT
);
`);

// ---------- Seed: admin account ----------
const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!adminExists) {
  const hash = bcrypt.hashSync('admin1234', 10);
  db.prepare('INSERT INTO users (username, password_hash, is_admin, wallet_balance) VALUES (?, ?, 1, 0)')
    .run('admin', hash);
  console.log('สร้างบัญชี admin เริ่มต้นแล้ว -> username: admin / password: admin1234 (ควรเปลี่ยนรหัสผ่านทันที)');
}

// หมายเหตุ: ไม่มีการใส่สินค้าตัวอย่างไว้ล่วงหน้า — เพิ่มสินค้าเองได้ที่หน้า "แผงแอดมิน" หลังล็อกอินด้วยบัญชี admin ด้านบน

module.exports = db;
