const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
  host: '202.28.34.197', // ใส่ hostname หรือ IP ของฐานข้อมูลที่อยู่ข้างนอก
  user: 'web66_65011212089',        // ชื่อผู้ใช้งานฐานข้อมูล
  password: '65011212089@csmsu',    // รหัสผ่าน
  database: 'web66_65011212089',// ชื่อฐานข้อมูล
  waitForConnections: true, // รอการเชื่อมต่อ
  connectionLimit: 10, // จำนวนการเชื่อมต่อสูงสุด
  queueLimit: 0, // ไม่จำกัดจำนวนคำขอ
});

// ตรวจสอบการเชื่อมต่อเบื้องต้น (ไม่จำเป็น แต่สามารถช่วยในการตรวจสอบ)
pool.getConnection((err, connection) => {
  if (err) {
    console.error('Error connecting to the database:', err);
    return;
  }
  console.log('Connected to the MySQL database.');
  connection.release(); // ปล่อยการเชื่อมต่อกลับไปยัง pool
});

module.exports = pool;

