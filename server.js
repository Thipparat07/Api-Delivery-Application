const express = require('express');
const bodyParser = require('body-parser');
const pool = require('./db');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid'); // นำเข้าฟังก์ชัน uuidv4
require('dotenv').config();  // โหลดตัวแปรสภาพแวดล้อมจากไฟล์ .env

const { admin, db, bucket } = require('./config/fitebasc.config');  // นำเข้า Firebase config

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

app.get('/', (req, res) => {
  res.send('Online Api-Delivery-Application');
});

// API สำหรับการเข้าสู่ระบบโดยใช้หมายเลขโทรศัพท์
app.post('/login', async (req, res) => {
  const { phoneNumber, password } = req.body;

  // ตรวจสอบว่ามีการส่งหมายเลขโทรศัพท์และรหัสผ่านมา
  if (!phoneNumber || !password) {
    return res.status(400).json({ message: 'หมายเลขโทรศัพท์และรหัสผ่านจำเป็นต้องระบุ' });
  }

  // ตรวจสอบว่าหมายเลขโทรศัพท์มีความยาว 10 หลัก
  if (!/^\d{10}$/.test(phoneNumber)) {
    return res.status(400).json({ message: 'หมายเลขโทรศัพท์ต้องมี 10 หลัก' });
  }

  // คำสั่ง SQL เพื่อตรวจสอบจากหมายเลขโทรศัพท์
  const query = 'SELECT * FROM users WHERE PhoneNumber = ?';

  pool.query(query, [phoneNumber], async (err, results) => {
    if (err) {
      console.error('Database error:', err.message);
      return res.status(500).json({ 
        message: 'ข้อผิดพลาดจากฐานข้อมูล' 
      });
    }

    if (results.length > 0) {
      const user = results[0];

      if (password === user.Password) {
        // เข้าสู่ระบบสำเร็จ
        return res.status(200).json({
          message: 'เข้าสู่ระบบสำเร็จ',
          userid: user.UserID,
          name: user.Name,
          userType: user.UserType,
        });
      } else {
        // รหัสผ่านไม่ถูกต้อง
        return res.status(401).json({ message: 'รหัสผ่านไม่ถูกต้อง' });
      }
    } else {
      // หมายเลขโทรศัพท์ไม่พบในระบบ
      return res.status(401).json({ message: 'หมายเลขโทรศัพท์ไม่ถูกต้อง' });
    }
  });
});




const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// API สำหรับการสมัครสมาชิกของ users
app.post('/register/users', upload.single('profilePicture'), async (req, res) => {
  const { phoneNumber, password, Name, email, address, gpsLocation } = req.body;

  // Validate input
  if (!phoneNumber || !password || !Name || !email) {
    return res.status(400).json({ message: 'หมายเลขโทรศัพท์, รหัสผ่าน, ชื่อ, และอีเมลจำเป็นต้องระบุ' });
  }

  // ตรวจสอบหมายเลขโทรศัพท์ว่ามีอยู่ในฐานข้อมูลหรือไม่
  const phoneCheckQuery = 'SELECT * FROM users WHERE PhoneNumber = ?';
  const emailCheckQuery = 'SELECT * FROM users WHERE Email = ?';

  // Check phone number
  pool.query(phoneCheckQuery, [phoneNumber], async (err, phoneResults) => {
    if (err) {
      return res.status(500).json({ 
        message: 'ข้อผิดพลาดจากฐานข้อมูล', 
        error: err.message
      });
    }

    if (phoneResults.length > 0) {
      return res.status(400).json({ message: 'หมายเลขโทรศัพท์นี้มีอยู่แล้วในระบบ' });
    }

    // Check email
    pool.query(emailCheckQuery, [email], async (err, emailResults) => {
      if (err) {
        return res.status(500).json({ 
          message: 'ข้อผิดพลาดจากฐานข้อมูล', 
          error: err.message
        });
      }

      if (emailResults.length > 0) {
        return res.status(400).json({ message: 'อีเมลนี้มีอยู่แล้วในระบบ' });
      }

      let profilePictureUrl = null;

      // ถ้ามีการส่งรูปภาพโปรไฟล์เข้ามา ให้อัปโหลดรูปไปยัง Firebase
      if (req.file) {
        const file = req.file;
        const fileName = `profile/${Date.now()}_${path.basename(file.originalname)}`;
        const fileUpload = bucket.file(fileName);
        const token = uuidv4();

        const stream = fileUpload.createWriteStream({
          metadata: {
            contentType: file.mimetype,
            metadata: {
              firebaseStorageDownloadTokens: token,
            },
          },
        });

        await new Promise((resolve, reject) => {
          stream.on('error', reject);
          stream.on('finish', () => resolve());
          stream.end(file.buffer);
        });

        profilePictureUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(fileName)}?alt=media&token=${token}`;
      }

      // Insert the user into the database พร้อมลิงก์รูป
      const query = 'INSERT INTO users (PhoneNumber, Password, Name, Email, ProfilePicture, Address, GPSLocation, UserType) VALUES (?, ?, ?, ?, ?, ?, ?, "User")';
      pool.query(query, [phoneNumber, password, Name, email, profilePictureUrl, address, gpsLocation], (err, results) => {
        if (err) {
          return res.status(500).json({ 
            message: 'ข้อผิดพลาดจากฐานข้อมูล', 
            error: err.message
          });
        }

        return res.status(201).json({ message: 'สมัครสมาชิก users สำเร็จ', userId: results.insertId });
      });
    });
  });
});

// API สำหรับการสมัครสมาชิกของ Riders
app.post('/register/riders', upload.single('profilePicture'), async (req, res) => {
  const { Name, email, phoneNumber, password, vehicleRegistration } = req.body;

  // Validate input
  if (!Name || !email || !phoneNumber || !password || !vehicleRegistration) {
    return res.status(400).json({ message: 'ชื่อ, อีเมล, หมายเลขโทรศัพท์, รหัสผ่าน, และหมายเลขทะเบียนรถจำเป็นต้องระบุ' });
  }

  // ตรวจสอบหมายเลขโทรศัพท์ว่ามีอยู่ในฐานข้อมูลหรือไม่
  const phoneCheckQuery = 'SELECT * FROM users WHERE PhoneNumber = ?';
  const emailCheckQuery = 'SELECT * FROM users WHERE Email = ?';

  // Check phone number
  pool.query(phoneCheckQuery, [phoneNumber], async (err, phoneResults) => {
    if (err) {
      return res.status(500).json({ 
        message: 'ข้อผิดพลาดจากฐานข้อมูล', 
        error: err.message
      });
    }

    if (phoneResults.length > 0) {
      return res.status(400).json({ message: 'หมายเลขโทรศัพท์นี้มีอยู่แล้วในระบบ' });
    }

    // Check email
    pool.query(emailCheckQuery, [email], async (err, emailResults) => {
      if (err) {
        return res.status(500).json({ 
          message: 'ข้อผิดพลาดจากฐานข้อมูล', 
          error: err.message
        });
      }

      if (emailResults.length > 0) {
        return res.status(400).json({ message: 'อีเมลนี้มีอยู่แล้วในระบบ' });
      }

      let profilePictureUrl = null;

      // ถ้ามีการส่งรูปภาพโปรไฟล์เข้ามา ให้อัปโหลดรูปไปยัง Firebase
      if (req.file) {
        const file = req.file;
        const fileName = `profile/${Date.now()}_${path.basename(file.originalname)}`;
        const fileUpload = bucket.file(fileName);
        const token = uuidv4();

        const stream = fileUpload.createWriteStream({
          metadata: {
            contentType: file.mimetype,
            metadata: {
              firebaseStorageDownloadTokens: token,
            },
          },
        });

        await new Promise((resolve, reject) => {
          stream.on('error', reject);
          stream.on('finish', () => resolve());
          stream.end(file.buffer);
        });

        profilePictureUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(fileName)}?alt=media&token=${token}`;
      }

      // Insert the rider into the database พร้อมลิงก์รูป
      const query = 'INSERT INTO users (Name, Email, PhoneNumber, Password, ProfilePicture, VehicleRegistration, UserType) VALUES (?, ?, ?, ?, ?, ?, "Rider")';
      pool.query(query, [Name, email, phoneNumber, password, profilePictureUrl, vehicleRegistration], (err, results) => {
        if (err) {
          return res.status(500).json({ 
            message: 'ข้อผิดพลาดจากฐานข้อมูล', 
            error: err.message
          });
        }

        return res.status(201).json({ message: 'สมัครสมาชิก Riders สำเร็จ', riderId: results.insertId });
      });
    });
  });
});



// API สำหรับการแสดงข้อมูลแค่useridนั้น
app.get('/users/:userid', async (req, res) => {
  const { userid } = req.params;  // ดึง userid จาก URL parameter

  const query = 'SELECT * FROM users WHERE UserID = ?';

  pool.query(query, [userid], (err, results) => {
    if (err) {
      console.error('Database error:', err.message);
      return res.status(500).json({ 
        message: 'ข้อผิดพลาดจากฐานข้อมูล' 
      });
    }

    if (results.length > 0) {
      const user = results[0];

      return res.status(200).json({
        user: user  // แก้ไขเป็น user แทน user.data เพื่อให้ส่งข้อมูลของผู้ใช้ทั้งหมด
      });

    } else {
      return res.status(404).json({ message: 'ไม่พบผู้ใช้ในระบบ' }); // เปลี่ยนสถานะเป็น 404 สำหรับไม่พบผู้ใช้
    }
  });
});


app.post('/add/products', upload.single('image'), async (req, res) => {
  const { name, description } = req.body;

  // ตรวจสอบค่าที่จำเป็น
  if (!name || !description) {
    return res.status(400).json({ message: 'ชื่อและคำอธิบายของผลิตภัณฑ์จำเป็นต้องระบุ' });
  }

  // อัปโหลดภาพไปยัง Firebase หากมีการส่งภาพ
  let imageUrl = null;

  if (req.file) {
    const file = req.file;
    const fileName = `products/${Date.now()}_${path.basename(file.originalname)}`;
    const fileUpload = bucket.file(fileName);
    const token = uuidv4();

    const stream = fileUpload.createWriteStream({
      metadata: {
        contentType: file.mimetype,
        metadata: {
          firebaseStorageDownloadTokens: token,
        },
      },
    });

    await new Promise((resolve, reject) => {
      stream.on('error', reject);
      stream.on('finish', () => resolve());
      stream.end(file.buffer);
    });

    imageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(fileName)}?alt=media&token=${token}`;
  }

  // แทรกข้อมูลผลิตภัณฑ์ลงในฐานข้อมูล
  const query = 'INSERT INTO products (image_url, name, description) VALUES (?, ?, ?)';
  pool.query(query, [imageUrl, name, description], (err, results) => {
    if (err) {
      return res.status(500).json({ 
        message: 'ข้อผิดพลาดจากฐานข้อมูล', 
        error: err.message 
      });
    }

    // ส่งข้อความตอบกลับ
    return res.status(201).json({ message: 'เพิ่มผลิตภัณฑ์สำเร็จ' });
  });
});

// สร้าง API แสดงรายการสินค้า
app.get('/api/products', (req, res) => {
  const query = 'SELECT * FROM products';

  pool.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching products:', err);
      return res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลสินค้า' });
    }
    
    // ส่งข้อมูลสินค้าที่ดึงมาในรูปแบบ JSON
    res.status(200).json(results);
  });
});

// ค้นหาคนรับสินค้าจากหมายเลขโทรศัพ
app.get('/api/receivers', (req, res) => {
  const { phoneNumber, userID } = req.query; // Get userID from query parameters

  if (!phoneNumber) {
    return res.status(400).json({ message: 'Phone number is required' });
  }

  if (!userID) {
    return res.status(400).json({ message: 'User ID is required' });
  }

  const query = 'SELECT * FROM users WHERE PhoneNumber LIKE ? AND UserType = ? AND UserID != ?';
  pool.query(query, [`%${phoneNumber}%`, 'User', userID], (error, results) => {
    if (error) {
      return res.status(500).json({ message: 'Database query failed', error });
    }

    if (results.length > 0) {
      return res.status(200).json(results);
    } else {
      return res.status(404).json({ message: 'No receivers found' });
    }
  });
});

//-----------------------------------------------------------------------------------------------------------------
// API สำหรับสร้างออเดอร์
app.post('/api/orders', (req, res) => {
  const { Sender_ID, Recipient_ID, Recipient_Phone, Status } = req.body;

  // ตรวจสอบข้อมูลที่ได้รับ
  if (!Sender_ID || !Recipient_ID || !Recipient_Phone || !Status) {
      return res.status(400).json({ message: 'All fields are required' });
  }

  const query = 'INSERT INTO orders (Sender_ID, Recipient_ID, Recipient_Phone, Status) VALUES (?, ?, ?, 1)';
  pool.query(query, [Sender_ID, Recipient_ID, Recipient_Phone, Status], (err, results) => {
      if (err) {
          console.error('Error creating order:', err);
          return res.status(500).json({ message: 'Internal server error' });
      }
      res.status(201).json({ message: 'Order created successfully', orderId: results.insertId });
  });
});

// API สำหรับเพิ่มรายการสินค้าในออเดอร์
app.post('/api/list', (req, res) => {
  const { ProductsID, Amount, OrdersID } = req.body;

  // ตรวจสอบข้อมูลที่ได้รับ
  if (!ProductsID || !Amount || !OrdersID) {
      return res.status(400).json({ message: 'All fields are required' });
  }

  // ตรวจสอบว่ามีออเดอร์นี้อยู่ในฐานข้อมูลหรือไม่
  const orderCheckQuery = 'SELECT ID FROM orders WHERE ID = ?';
  pool.query(orderCheckQuery, [OrdersID], (err, results) => {
      if (err) {
          console.error('Error checking order:', err);
          return res.status(500).json({ message: 'Internal server error' });
      }

      if (results.length === 0) {
          return res.status(404).json({ message: 'Order not found' });
      }

      // ถ้ามีออเดอร์นี้อยู่ เพิ่มรายการสินค้า
      const query = 'INSERT INTO list (ProductsID, Amount, OrdersID) VALUES (?, ?, ?)';
      pool.query(query, [ProductsID, Amount, OrdersID], (err, results) => {
          if (err) {
              console.error('Error inserting list item:', err);
              return res.status(500).json({ message: 'Internal server error' });
          }
          res.status(201).json({ message: 'List item added successfully', listId: results.insertId });
      });
  });
});