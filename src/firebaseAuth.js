const admin = require("firebase-admin");
const path = require("path");

// Firebase service account key
const serviceAccount = require(path.join(
  __dirname,
  "firebase-service-account.json"
));

// Firebase Admin-ийг ганц л удаа initialize хийнэ
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// ================== AUTH MIDDLEWARE ==================
async function firebaseAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({
      ok: false,
      error: "No authorization token",
    });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded; // decoded.uid, decoded.email гэх мэт
    next();
  } catch (err) {
    console.error("Firebase token verify failed:", err);
    return res.status(401).json({
      ok: false,
      error: "Invalid Firebase token",
    });
  }
}

module.exports = { firebaseAuth };
const admin = require("firebase-admin");

// ENV-ээс service account JSON уншина
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;

if (!serviceAccountJson) {
  console.warn("⚠️ FIREBASE_SERVICE_ACCOUNT env missing");
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(serviceAccountJson)
    ),
  });
}

async function firebaseAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ ok: false, error: "No token" });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
    
  } catch (err) {
    console.error("Firebase token verify failed", err);
    return res.status(401).json({ ok: false, error: "Invalid token" });
  }
}

module.exports = { firebaseAuth };
