// firebase.config.js
const admin = require('firebase-admin');
require('dotenv').config(); // ใช้ dotenv เพื่อโหลดตัวแปรจากไฟล์ .env

// โหลดข้อมูลการเชื่อมต่อ Firebase จากตัวแปรสภาพแวดล้อม
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

// Initializing Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'delivery-application-331d4.appspot.com' // เปลี่ยนเป็นชื่อ Firebase Storage Bucket ของคุณ
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

module.exports = { admin, db, bucket };
