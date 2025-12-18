const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// (заавал биш) connect үед log
pool.on("connect", () => {
  console.log("Pool: client connected");
});

pool.on("error", (err) => {
  console.error("Pool error:", err);
});

module.exports = { pool };
