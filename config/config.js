require('dotenv').config();

module.exports = {
  // Development profile uses local-friendly defaults while still honoring .env overrides
  development: {
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'rotijugaad',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 8889,
    dialect: 'mysql',
    logging: console.log,
  },
  // Production profile relies entirely on explicit environment variables and disables verbose logging
  production: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'mysql',
    logging: false,
  }
};
