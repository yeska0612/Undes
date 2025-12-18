require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const cors = require("cors");

const { pool } = require("./db");
const { firebaseAuth } = require("./firebaseAuth");

const app = express();
const PORT = process.env.PORT || 3000;

// JSON body
app.use(express.json({ limit: "2mb" }));

app.use(cors({
  origin: true,           // түр үед бүх origin зөвшөөрнө
  credentials: true,
}));

// Front-end
app.use(express.static(path.join(__dirname, "..", "public")));

// uploads
const UPLOAD_DIR = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
app.use("/uploads", express.static(UPLOAD_DIR));

// multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ================== ROUTES ==================

// upload
app.post("/api/upload/photo", upload.single("photo"), (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: "No file" });
  res.json({ ok: true, url: `/uploads/${req.file.filename}` });
});

// health
app.get("/api/health/db", async (req, res) => {
  try {
    const r = await pool.query("SELECT now() as now");
    res.json({ ok: true, now: r.rows[0].now });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// auth test
app.get("/api/auth/me", firebaseAuth, (req, res) => {
  res.json({
    ok: true,
    uid: req.user.uid,
    email: req.user.email || null,
    name: req.user.name || null,
  });
});

// tree load
app.get("/api/tree/load", firebaseAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const r = await pool.query(
      `SELECT data FROM user_tree WHERE firebase_uid = $1`,
      [uid]
    );
    res.json({ ok: true, data: r.rows[0]?.data || { members: [] } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Load failed" });
  }
});

// tree save
app.post("/api/tree/save", firebaseAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const payload = req.body || { members: [] };

    await pool.query(
      `INSERT INTO user_tree (firebase_uid, data, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (firebase_uid)
       DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [uid, payload]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Save failed" });
  }
});

// ================== START SERVER ==================
app.listen(PORT, async () => {
  try {
    await pool.query("SELECT 1");
    console.log("PostgreSQL connected ✅");
  } catch (err) {
    console.error("PostgreSQL connection failed ❌", err.message);
  }

  console.log(`Server running at http://localhost:${PORT}`);
});
