import { Router } from 'express';
import { getEncryptionKey, encrypt } from '../config/encryption.js';
import { query } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { clasificarCaso } from '../services/aiService.js';

const router = Router();

// ── GET: verificación del webhook (Meta lo llama al guardar la config) ────────
router.get('/', (req, res) => {
  const mode      = req.query['hub.mode'];
  const challenge = req.query['hub.challenge'];
  const token     = req.query['hub.verify_token'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    logger.info('WhatsApp webhook verificado por Meta');
    return res.status(200).send(challenge);
  }
  logger.warn('Verificación WhatsApp fallida', { mode, token: token?.slice(0, 6) });
  return res.status(403).json({ error: 'Forbidden' });
});

// ── POST: mensajes entrantes ──────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  const t0 = Date.now();

  // Meta espera siempre un 200 rápido; si fallamos devolvemos 200 igual
  // para que Meta no reintente indefinidamente
  res.status(200).send('EVENT_RECEIVED');

  try {
    const body = req.body;

    if (body?.object !== 'whatsapp_business_account') return;

    const changes = body?.entry?.[0]?.changes ?? [];

    for (const change of changes) {
      if (change.field !== 'messages') continue;

      const messages = change.value?.messages ?? [];
      const contacts = change.value?.contacts ?? [];

      for (const msg of messages) {
        // Solo primer mensaje de cada contacto (ignorar status updates)
        if (!msg.from || !msg.id) continue;

        const t1 = Date.now();

        // Normalizar número: Meta envía sin '+' (ej: 56912345678)
        const phoneNumber = msg.from.startsWith('+') ? msg.from : `+${msg.from}`;
        const waName = contacts.find(c => c.wa_id === msg.from)?.profile?.name ?? null;
        const msgBody = msg.text?.body ?? msg.type ?? '';

        const telefonoCifrado = encrypt(phoneNumber, getEncryptionKey());
        const t2 = Date.now();

        const timerExpiraAt = new Date(Date.now() + (parseInt(process.env.ABANDONMENT_TIMER_CHAT) || 300_000));
        const waMeta = { waMessageId: msg.id, waName, msgType: msg.type };

        const result = await query(
          `INSERT INTO contactos (telefono_cifrado, canal, estado, timer_expira_at, metadata)
           VALUES ($1, 'whatsapp', 'en_curso', $2, $3)
           RETURNING id`,
          [telefonoCifrado, timerExpiraAt, JSON.stringify(waMeta)]
        );

        const contactId = result.rows[0].id;
        const t3 = Date.now();

        // Interacción fuera del camino crítico
        query(
          `INSERT INTO interacciones (contacto_id, tipo, payload) VALUES ($1, 'whatsapp_message', $2)`,
          [contactId, JSON.stringify({ msgId: msg.id, type: msg.type, receivedAt: new Date().toISOString() })]
        ).catch(err => logger.error('Error al registrar interaccion WA', { error: err.message }));

        // Clasificación IA con el texto del mensaje como descripción
        if (process.env.ANTHROPIC_API_KEY) {
          clasificarCaso({ canal: 'whatsapp', descripcion: msgBody || null })
            .then(({ clasificacion, metadata }) =>
              query(
                `UPDATE contactos SET metadata = metadata || $1::jsonb WHERE id = $2`,
                [JSON.stringify({ clasificacion, ia: metadata }), contactId]
              )
            )
            .catch(err => logger.error('Error en clasificación IA WA', { error: err.message, contactId }));
        }

        logger.info('WhatsApp contacto capturado', {
          contactId,
          waName,
          msgType: msg.type,
          ms: t3 - t0,
          checkpoints: { validated: t1 - t0, encrypted: t2 - t0, saved: t3 - t0 },
        });
      }
    }
  } catch (err) {
    // No relanzar — ya respondimos 200 a Meta
    logger.error('Error procesando webhook WhatsApp', { error: err.message });
  }
});

export default router;
