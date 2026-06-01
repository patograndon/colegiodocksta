import express from 'express';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initializeDatabase } from './config/database.js';
import { logger } from './utils/logger.js';
import { performanceMonitor } from './middleware/performanceMonitor.js';
import { errorHandler } from './middleware/errorHandler.js';
import webhookRoutes from './routes/webhooks.js';
import contactosRoutes from './routes/contactos.js';
import vapiRoutes       from './routes/vapi.js';
import whatsappRoutes   from './routes/whatsapp.js';
import apiRoutes        from './routes/api.js';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(join(__dirname, '../public')));
app.use(express.json());
app.use(performanceMonitor);

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));
app.use('/api/webhook',           webhookRoutes);
app.use('/api/webhook/vapi',      vapiRoutes);
app.use('/api/webhook/whatsapp',  whatsappRoutes);
app.use('/api',                   apiRoutes);        // multi-tenant RBAC (stats, recientes, config, escuelas)
app.use('/api/contactos',         contactosRoutes);  // legacy fallback

app.use(errorHandler);

initializeDatabase();

app.listen(PORT, () => {
  logger.info(`Servidor Fase Cero escuchando en puerto ${PORT}`);
});
