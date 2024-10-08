const mysql = require('mysql2');

// สร้างการเชื่อมต่อกับฐานข้อมูล
const connection = mysql.createConnection({
  host: '202.28.34.197', // ใส่ hostname หรือ IP ของฐานข้อมูลที่อยู่ข้างนอก
  user: 'web66_65011212089',        // ชื่อผู้ใช้งานฐานข้อมูล
  password: '65011212089@csmsu',    // รหัสผ่าน
  database: 'web66_65011212089',// ชื่อฐานข้อมูล
});

// เชื่อมต่อกับฐานข้อมูล
connection.connect((err) => {
  if (err) {
    console.error('Error connecting to the database:', err);
    return;
  }
  console.log('Connected to the MySQL database.');
});

module.exports = connection;
