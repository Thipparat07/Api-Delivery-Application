const express = require('express');
const bodyParser = require('body-parser');
const connection = require('./db'); 
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
app.post('/login', (req, res) => {
  const { phoneNumber, password } = req.body;

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

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// API สำหรับการสมัครสมาชิกของ Users
app.post('/register/users', upload.single('profilePicture'), async (req, res) => {
  const { phoneNumber, password, fullName, email, address, gpsLocation } = req.body;

  // Validate input
  if (!phoneNumber || !password || !fullName) {
    return res.status(400).json({ message: 'หมายเลขโทรศัพท์, รหัสผ่าน, และชื่อจำเป็นต้องระบุ' });
  }

  // ตรวจสอบหมายเลขโทรศัพท์ว่ามีอยู่ในฐานข้อมูลหรือไม่
  const checkQuery = 'SELECT * FROM Users WHERE PhoneNumber = ?';
  connection.query(checkQuery, [phoneNumber], async (err, results) => {
    if (err) {
      return res.status(500).json({ message: 'ข้อผิดพลาดจากฐานข้อมูล', error: err });
    }

    if (results.length > 0) {
      return res.status(400).json({ message: 'หมายเลขโทรศัพท์นี้มีอยู่แล้วในระบบ' });
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
    const query = 'INSERT INTO Users (PhoneNumber, Password, FullName, Email, ProfilePicture, Address, GPSLocation) VALUES (?, ?, ?, ?, ?, ?, ?)';
    connection.query(query, [phoneNumber, password, fullName, email, profilePictureUrl, address, gpsLocation], (err, results) => {
      if (err) {
        return res.status(500).json({ message: 'ข้อผิดพลาดจากฐานข้อมูล', error: err });
      }

      return res.status(201).json({ message: 'สมัครสมาชิก Users สำเร็จ', userId: results.insertId });
    });
  });
});


// API สำหรับการสมัครสมาชิกของ Riders
app.post('/register/riders', upload.single('profilePicture'), async (req, res) => {
  const { fullName, email, phoneNumber, password, vehicleRegistration } = req.body;

  // Validate input
  if (!fullName || !email || !phoneNumber || !password || !vehicleRegistration) {
    return res.status(400).json({ message: 'ชื่อ, อีเมล, หมายเลขโทรศัพท์, รหัสผ่าน, และหมายเลขทะเบียนรถจำเป็นต้องระบุ' });
  }

  // ตรวจสอบหมายเลขโทรศัพท์ว่ามีอยู่ในฐานข้อมูลหรือไม่
  const checkQuery = 'SELECT * FROM Riders WHERE PhoneNumber = ?';
  connection.query(checkQuery, [phoneNumber], async (err, results) => {
    if (err) {
      return res.status(500).json({ message: 'ข้อผิดพลาดจากฐานข้อมูล', error: err });
    }

    if (results.length > 0) {
      return res.status(400).json({ message: 'หมายเลขโทรศัพท์นี้มีอยู่แล้วในระบบ' });
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
    const query = 'INSERT INTO Riders (FullName, Email, PhoneNumber, Password, ProfilePicture, VehicleRegistration) VALUES (?, ?, ?, ?, ?, ?)';
    connection.query(query, [fullName, email, phoneNumber, password, profilePictureUrl, vehicleRegistration], (err, results) => {
      if (err) {
        return res.status(500).json({ message: 'ข้อผิดพลาดจากฐานข้อมูล', error: err });
      }

      return res.status(201).json({ message: 'สมัครสมาชิก Riders สำเร็จ', riderId: results.insertId });
    });
  });
});


