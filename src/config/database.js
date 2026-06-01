import pg from 'pg';
import dotenv from 'dotenv';
import { logger } from '../utils/logger.js';

dotenv.config();

const { Pool } = pg;
let pool = null;

export const initializeDatabase = () => {
  if (pool) return;

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL no configurada en .env');
  }

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  pool.on('error', (err) => {
    logger.error('Error inesperado en cliente PostgreSQL', { error: err.message });
  });

  logger.info('Pool PostgreSQL inicializado', { max: 10 });
};

export const query = async (text, params) => {
  if (!pool) throw new Error('Base de datos no inicializada. Llama initializeDatabase() primero.');

  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;

  logger.debug('Query ejecutada', { duration, rows: result.rowCount });
  return result;
};

export const getClient = async () => {
  if (!pool) throw new Error('Base de datos no inicializada.');
  return pool.connect();
};

export const closePool = async () => {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Pool PostgreSQL cerrado');
  }
};
