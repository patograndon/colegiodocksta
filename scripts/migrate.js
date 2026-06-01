import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { initializeDatabase, query } from '../src/config/database.js';
import { logger } from '../src/utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

/**
 * Script de migración para inicializar la base de datos
 */
const runMigration = async () => {
  try {
    logger.info('🔄 Iniciando migración de base de datos...');
    
    initializeDatabase();
    
    const sqlPath = path.join(__dirname, '../database/init.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf-8');
    
    logger.info(`📄 SQL cargado desde: ${sqlPath}`);
    logger.info(`📊 Tamaño: ${sqlContent.length} caracteres`);
    
    logger.info('⏳ Ejecutando migraciones...');
    await query(sqlContent);
    
    logger.info('✅ Migración completada exitosamente!');
    logger.info(`
╔════════════════════════════════════════╗
║  ✅ BASE DE DATOS INICIALIZADA         ║
║                                        ║
║  ✓ ENUM: estado_contacto_enum          ║
║  ✓ TABLA: contactos                    ║
║  ✓ TABLA: interacciones                ║
║  ✓ TABLA: configuracion_timers         ║
║  ✓ ÍNDICES optimizados                 ║
║  ✓ TRIGGERS automáticos                ║
║  ✓ VISTA: contactos_en_riesgo          ║
╚════════════════════════════════════════╝
    `);
    
    process.exit(0);
    
  } catch (error) {
    logger.error('❌ Error durante migración', { error: error.message });
    logger.error('Stack trace:', { stack: error.stack });
    process.exit(1);
  }
};

runMigration();
