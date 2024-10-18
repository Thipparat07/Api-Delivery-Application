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

// API สำหรับการเข้าสู่ระบบ
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'อีเมลและรหัสผ่านจำเป็นต้องระบุ' });
  }

  // คำสั่ง SQL เพื่อตรวจสอบจากอีเมล
  const query = 'SELECT * FROM Users WHERE Email = ?';

  pool.query(query, [email], async (err, results) => {
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
          userId: user.UserID,
          Name: user.Name,
          userType: user.UserType,
        });
      } else {
        // รหัสผ่านไม่ถูกต้อง
        return res.status(401).json({ message: 'รหัสผ่านไม่ถูกต้อง' });
      }
    } else {
      // อีเมลไม่พบในระบบ
      return res.status(401).json({ message: 'อีเมลไม่ถูกต้อง' });
    }
  });
});


const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// API สำหรับการสมัครสมาชิกของ Users
app.post('/register/users', upload.single('profilePicture'), async (req, res) => {
  const { phoneNumber, password, Name, email, address, gpsLocation } = req.body;

  // Validate input
  if (!phoneNumber || !password || !Name || !email) {
    return res.status(400).json({ message: 'หมายเลขโทรศัพท์, รหัสผ่าน, ชื่อ, และอีเมลจำเป็นต้องระบุ' });
  }

  // ตรวจสอบหมายเลขโทรศัพท์ว่ามีอยู่ในฐานข้อมูลหรือไม่
  const phoneCheckQuery = 'SELECT * FROM Users WHERE PhoneNumber = ?';
  const emailCheckQuery = 'SELECT * FROM Users WHERE Email = ?';

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
      const query = 'INSERT INTO Users (PhoneNumber, Password, Name, Email, ProfilePicture, Address, GPSLocation, UserType) VALUES (?, ?, ?, ?, ?, ?, ?, "User")';
      pool.query(query, [phoneNumber, password, Name, email, profilePictureUrl, address, gpsLocation], (err, results) => {
        if (err) {
          return res.status(500).json({ 
            message: 'ข้อผิดพลาดจากฐานข้อมูล', 
            error: err.message
          });
        }

        return res.status(201).json({ message: 'สมัครสมาชิก Users สำเร็จ', userId: results.insertId });
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
  const phoneCheckQuery = 'SELECT * FROM Users WHERE PhoneNumber = ?';
  const emailCheckQuery = 'SELECT * FROM Users WHERE Email = ?';

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
      const query = 'INSERT INTO Users (Name, Email, PhoneNumber, Password, ProfilePicture, VehicleRegistration, UserType) VALUES (?, ?, ?, ?, ?, ?, "Rider")';
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
