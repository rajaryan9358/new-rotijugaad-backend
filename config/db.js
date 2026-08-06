const { Sequelize } = require('sequelize');
const path = require('path');

// Always load backend/.env regardless of the process working directory
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Centralized Sequelize instance configured via environment variables (with sane defaults for local use)
const sequelize = new Sequelize(
  process.env.DB_NAME || 'rotijugaad',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || '',
  {
    host: process.env.DB_HOST || 'localhost',
    // Keep default aligned with sequelize-cli dev config (MAMP default)
    port: process.env.DB_PORT || 8889,
    dialect: 'mysql',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    dialectOptions: {
      charset: 'utf8mb4',
      connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT || 30000),
      enableKeepAlive: true,
      keepAliveInitialDelay: Number(
        process.env.DB_KEEP_ALIVE_INITIAL_DELAY || 0,
      ),
    },
    pool: {
      max: Number(process.env.DB_POOL_MAX || 10),
      min: Number(process.env.DB_POOL_MIN || 0),
      acquire: Number(process.env.DB_POOL_ACQUIRE || 30000),
      idle: Number(process.env.DB_POOL_IDLE || 10000),
      evict: Number(process.env.DB_POOL_EVICT || 1000),
      maxUses: Number(process.env.DB_POOL_MAX_USES || 500),
    },
    retry: {
      max: Number(process.env.DB_RETRY_MAX || 3),
      match: [
        /SequelizeConnectionError/i,
        /SequelizeConnectionRefusedError/i,
        /SequelizeHostNotReachableError/i,
        /SequelizeHostNotFoundError/i,
        /SequelizeConnectionTimedOutError/i,
        /TimeoutError/i,
        /ETIMEDOUT/i,
        /ECONNRESET/i,
        /ECONNREFUSED/i,
        /PROTOCOL_CONNECTION_LOST/i,
      ],
    },
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
