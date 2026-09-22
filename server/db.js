import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function getUser(id) {
  const [rows] = await pool.query(
    `
      SELECT *
      FROM users
      WHERE id = ?
    `,
    [id],
  );
  return rows;
}

const [users] = await pool.query(`
      SELECT * FROM users
    `);

console.log(users);

export default pool;
