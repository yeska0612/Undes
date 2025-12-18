const { Pool } = require("pg");

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error("❌ DATABASE_URL is missing");
}

// Render дээр ихэвчлэн энэ env байдаг (байхгүй байсан ч hostname-оор нь шийднэ)
const isRender = String(process.env.RENDER || "").toLowerCase() === "true";

// URL-аас hostname шалгаад local эсэхийг мэднэ
let isLocalhost = false;
try {
  const u = new URL(dbUrl);
  isLocalhost = u.hostname === "localhost" || u.hostname === "127.0.0.1";
} catch (e) {
  // хэрвээ URL parse болохгүй бол local гэж үзэхгүй
  isLocalhost = false;
}

const useSSL = !isLocalhost; // Render/remote бол SSL асаана

const pool = new Pool({
  connectionString: dbUrl,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

pool.on("connect", () => console.log("PostgreSQL connected ✅"));
pool.on("error", (err) => console.error("PostgreSQL error:", err));

module.exports = { pool };
