const express = require('express');
const bodyParser = require('body-parser');
const connection = require('./db'); 
const multer = require('multer');
const path = require('path');
require('dotenv').config();  // โหลดตัวแปรสภาพแวดล้อมจากไฟล์ .env

const { admin, db, bucket } = require('./config/fitebasc.config');  // นำเข้า Firebase config

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// API สำหรับการเข้าสู่ระบบ
app.post('/login', (req, res) => {
  const { phoneNumber, password } = req.body; // เปลี่ยนจาก username เป็น phoneNumber

  if (!phoneNumber || !password) {
    return res.status(400).json({ message: 'หมายเลขโทรศัพท์และรหัสผ่านจำเป็นต้องระบุ' });
  }

  // อัปเดตคำสั่ง SQL เพื่อตรวจสอบจากหมายเลขโทรศัพท์
  const query = 'SELECT * FROM Users WHERE PhoneNumber = ? AND Password = ?';
  
  connection.query(query, [phoneNumber, password], (err, results) => {
    if (err) {
      return res.status(500).json({ message: 'ข้อผิดพลาดจากฐานข้อมูล', error: err });
    }

    if (results.length > 0) {
      // เข้าสู่ระบบสำเร็จ
      return res.status(200).json({
        message: 'เข้าสู่ระบบสำเร็จ',
        userId: results[0].UserID,  // สมมติว่าตาราง Users ของคุณมีคอลัมน์ UserID
        fullName: results[0].FullName, // คุณสามารถคืนค่า FullName หรือรายละเอียดผู้ใช้อื่น ๆ ได้หากต้องการ
      });
    } else {
      // เข้าสู่ระบบล้มเหลว
      return res.status(401).json({ message: 'หมายเลขโทรศัพท์หรือรหัสผ่านไม่ถูกต้อง' });
    }
  });
});


// API สำหรับการสมัครสมาชิกของ Users
app.post('/register/users', async (req, res) => {
  const { phoneNumber, password, fullName, email, profilePicture, address, gpsLocation } = req.body;

  // Validate input
  if (!phoneNumber || !password || !fullName) {
      return res.status(400).json({ message: 'หมายเลขโทรศัพท์, รหัสผ่าน, ชื่อ' });
  }

  // ตรวจสอบหมายเลขโทรศัพท์ว่ามีอยู่ในฐานข้อมูลหรือไม่
  const checkQuery = 'SELECT * FROM Users WHERE PhoneNumber = ?';
  connection.query(checkQuery, [phoneNumber], (err, results) => {
      if (err) {
          return res.status(500).json({ message: 'ข้อผิดพลาดจากฐานข้อมูล', error: err });
      }

      if (results.length > 0) {
          return res.status(400).json({ message: 'หมายเลขโทรศัพท์นี้มีอยู่แล้วในระบบ' });
      }

      // Insert the user into the database
      const query = 'INSERT INTO Users (PhoneNumber, Password, FullName, Email, ProfilePicture, Address, GPSLocation) VALUES (?, ?, ?, ?, ?, ?, ?)';
      
      connection.query(query, [phoneNumber, password, fullName, email, profilePicture, address, gpsLocation], (err, results) => {
          if (err) {
              return res.status(500).json({ message: 'ข้อผิดพลาดจากฐานข้อมูล', error: err });
          }

          return res.status(201).json({ message: 'สมัครสมาชิก Users สำเร็จ', userId: results.insertId });
      });
  });
});


// API สำหรับการสมัครสมาชิกของ Riders
app.post('/register/riders', async (req, res) => {
  const { fullName, email, phoneNumber, password, profilePicture, vehicleRegistration } = req.body;

  // Validate input
  if (!fullName || !email || !phoneNumber || !password || !vehicleRegistration) {
      return res.status(400).json({ message: 'ชื่อ, อีเมล, หมายเลขโทรศัพท์, รหัสผ่าน, และหมายเลขทะเบียนรถจำเป็นต้องระบุ' });
  }

  // ตรวจสอบหมายเลขโทรศัพท์ว่ามีอยู่ในฐานข้อมูลหรือไม่
  const checkQuery = 'SELECT * FROM Riders WHERE PhoneNumber = ?';
  connection.query(checkQuery, [phoneNumber], (err, results) => {
      if (err) {
          return res.status(500).json({ message: 'ข้อผิดพลาดจากฐานข้อมูล', error: err });
      }

      if (results.length > 0) {
          return res.status(400).json({ message: 'หมายเลขโทรศัพท์นี้มีอยู่แล้วในระบบ' });
      }

      // Insert the rider into the database
      const query = 'INSERT INTO Riders (FullName, Email, PhoneNumber, Password, ProfilePicture, VehicleRegistration) VALUES (?, ?, ?, ?, ?, ?)';
      
      connection.query(query, [fullName, email, phoneNumber, password, profilePicture, vehicleRegistration], (err, results) => {
          if (err) {
              return res.status(500).json({ message: 'ข้อผิดพลาดจากฐานข้อมูล', error: err });
          }

          return res.status(201).json({ message: 'สมัครสมาชิก Riders สำเร็จ', riderId: results.insertId });
      });
  });
});


const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const { v4: uuidv4 } = require('uuid');

// POST /api/upload
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send({ message: 'No file uploaded' });
    }

    const file = req.file;
    // เก็บไฟล์ในโฟลเดอร์ profile
    const fileName = `profile/${Date.now()}_${path.basename(file.originalname)}`;
    const fileUpload = bucket.file(fileName);

    // สร้าง token สำหรับการเข้าถึงไฟล์
    const token = uuidv4();

    // สตรีมไฟล์ไปยัง Firebase Storage พร้อมเพิ่ม token ใน metadata
    const stream = fileUpload.createWriteStream({
      metadata: {
        contentType: file.mimetype,
        metadata: {
          firebaseStorageDownloadTokens: token // ใส่ token ลงใน metadata
        }
      },
    });

    stream.on('error', (err) => {
      res.status(500).send({ message: 'Error uploading file', error: err.message });
    });

    stream.on('finish', async () => {
      // สร้าง Firebase Storage URL พร้อม token
      const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(fileName)}?alt=media&token=${token}`;
      
      res.status(200).send({ message: 'File uploaded successfully', fileUrl: publicUrl });
    });

    stream.end(file.buffer);
  } catch (error) {
    res.status(500).send({ message: 'Error uploading file', error: error.message });
  }
});

