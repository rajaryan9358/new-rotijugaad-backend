const { Sequelize } = require('sequelize');
require('dotenv').config();

// Centralized Sequelize instance configured via environment variables (with sane defaults for local use)
const sequelize = new Sequelize(
  process.env.DB_NAME || 'rotijugaad',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || '',
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
  }
);

// Gracefully verify connectivity at boot so the app fails fast on DB issues
const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connected successfully');
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }
};

module.exports = { sequelize, connectDB };
