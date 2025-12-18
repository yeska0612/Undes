const admin = require("firebase-admin");

/**
 * Render дээр json файл commit хийлгүйгээр ажиллуулахын тулд:
 * FIREBASE_SERVICE_ACCOUNT гэдэг env-д service account JSON-оо бүхэлд нь хадгална.
 *
 * Local дээр бол хүсвэл FIREBASE_SERVICE_ACCOUNT байхгүй үед л
 * "firebase-service-account.json" файлаас унших fallback хийж болно.
 */

function getServiceAccount() {
  // 1) ENV-аас
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw && raw.trim()) {
    try {
      return JSON.parse(raw);
    } catch (e) {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT env JSON parse хийхэд алдаа гарлаа. (JSON format буруу байна)"
      );
    }
  }

  // 2) Local fallback (заавал биш)
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require("./firebase-service-account.json");
  } catch (e) {
    throw new Error(
      "Firebase service account олдсонгүй. FIREBASE_SERVICE_ACCOUNT env тохируул, эсвэл local дээр ./firebase-service-account.json файл нэм."
    );
  }
}

// Admin app нэг л удаа initialize
if (!admin.apps.length) {
  const serviceAccount = getServiceAccount();
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// Bearer <firebase_id_token> шалгах middleware
async function firebaseAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) return res.status(401).json({ ok: false, error: "No token" });

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded; // decoded.uid гэх мэт
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: "Invalid Firebase token" });
  }
}

module.exports = { firebaseAuth };
