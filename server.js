const express = require('express');
const bodyParser = require('body-parser');
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

// POST /api/users/register
app.post('/api/users/register', async (req, res) => {
  try {
    const { email, password, fullName, profileImage, address, gpsLocation, role } = req.body;
    
    const userRef = db.collection('Users').doc();
    await userRef.set({
      email,
      password,
      fullName,
      profileImage,
      address,
      gpsLocation: new admin.firestore.GeoPoint(gpsLocation.latitude, gpsLocation.longitude),
      role
    });
    
    res.status(201).send({ message: 'User registered successfully', userId: userRef.id });
  } catch (error) {
    res.status(500).send({ message: 'Error registering user', error: error.message });
  }
});

// GET /api/users/:userID
app.get('/api/users/:userID', async (req, res) => {
  try {
    const userID = req.params.userID;
    const userRef = db.collection('Users').doc(userID);
    const doc = await userRef.get();
    
    if (!doc.exists) {
      return res.status(404).send({ message: 'User not found' });
    }

    res.status(200).send(doc.data());
  } catch (error) {
    res.status(500).send({ message: 'Error retrieving user', error: error.message });
  }
});

// POST /api/users/login
app.post('/api/users/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // ค้นหาผู้ใช้จากหมายเลขโทรศัพท์
    const userQuery = db.collection('Users').where('email', '==', email).limit(1);
    const snapshot = await userQuery.get();
    
    if (snapshot.empty) {
      return res.status(404).send({ message: 'User not found' });
    }

    // รับข้อมูลผู้ใช้จากผลลัพธ์
    const userDoc = snapshot.docs[0];
    const userData = userDoc.data();

    // ตรวจสอบรหัสผ่าน (คุณอาจต้องใช้การตรวจสอบรหัสผ่านที่ปลอดภัยกว่าในระบบจริง)
    if (userData.password !== password) {
      return res.status(401).send({ message: 'Invalid password' });
    }

    // ตอบกลับด้วยข้อมูลผู้ใช้เมื่อเข้าสู่ระบบสำเร็จ
    res.status(200).send({
      message: 'Login successful',
      userId: userDoc.id,
      fullName: userData.fullName,
      role: userData.role
    });
  } catch (error) {
    res.status(500).send({ message: 'Error logging in', error: error.message });
  }
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

