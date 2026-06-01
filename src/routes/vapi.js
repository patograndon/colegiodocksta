import { Router } from 'express';
import { getEncryptionKey, encrypt } from '../config/encryption.js';
import { query } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { clasificarCaso } from '../services/aiService.js';

const router = Router();

// ── Autenticación: Vapi envía X-Vapi-Secret en cada request ──────────────────
const validateSecret = (req, res, next) => {
  const secret = req.headers['x-vapi-secret'];
  if (process.env.VAPI_AUTH_TOKEN && secret !== process.env.VAPI_AUTH_TOKEN) {
    logger.warn('Vapi webhook rechazado: secret inválido', { ip: req.ip });
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
};

// ── POST /api/webhook/vapi ────────────────────────────────────────────────────
router.post('/', validateSecret, async (req, res, next) => {
  const t0 = Date.now();

  try {
    const { message } = req.body ?? {};
    if (!message?.type) {
      return res.status(400).json({ success: false, error: 'Payload inválido: falta message.type' });
    }

    // ── call-started: captura inmediata < 100ms ──────────────────────────────
    if (message.type === 'call-started') {
      const phoneNumber = message.call?.customer?.number;

      if (!phoneNumber) {
        logger.warn('call-started sin número de cliente', { callId: message.call?.id });
        return res.status(400).json({ success: false, error: 'customer.number no encontrado en payload' });
      }

      const t1 = Date.now();
      const telefonoCifrado = encrypt(phoneNumber, getEncryptionKey());
      const t2 = Date.now();

      const timerExpiraAt = new Date(Date.now() + (parseInt(process.env.ABANDONMENT_TIMER_VOICE) || 45_000));
      const vapiMeta = { vapiCallId: message.call?.id, vapiOrgId: message.call?.orgId };

      const result = await query(
        `INSERT INTO contactos (telefono_cifrado, canal, estado, timer_expira_at, metadata)
         VALUES ($1, 'voz', 'en_curso', $2, $3)
         RETURNING id`,
        [telefonoCifrado, timerExpiraAt, JSON.stringify(vapiMeta)]
      );

      const contactId = result.rows[0].id;
      const t3 = Date.now();

      // Interacción y clasificación IA fuera del camino crítico
      query(
        `INSERT INTO interacciones (contacto_id, tipo, payload) VALUES ($1, 'vapi_call_started', $2)`,
        [contactId, JSON.stringify({ callId: message.call?.id, receivedAt: new Date().toISOString() })]
      ).catch(err => logger.error('Error al registrar interaccion', { error: err.message }));

      if (process.env.ANTHROPIC_API_KEY) {
        clasificarCaso({ canal: 'voz' })
          .then(({ clasificacion, metadata }) =>
            query(
              `UPDATE contactos SET metadata = metadata || $1::jsonb WHERE id = $2`,
              [JSON.stringify({ clasificacion, ia: metadata }), contactId]
            )
          )
          .catch(err => logger.error('Error en clasificación IA', { error: err.message, contactId }));
      }

      logger.info('Vapi contacto capturado', { contactId, callId: message.call?.id, ms: t3 - t0 });

      return res.status(201).json({
        success: true,
        contactId,
        estado: 'en_curso',
        message: 'Capturado en Fase Cero exitosamente',
        checkpoints: { payload_validated: t1 - t0, encrypted: t2 - t0, contacto_created: t3 - t0 },
        executionTime:     t3 - t0,
        totalResponseTime: Date.now() - t0,
      });
    }

    // ── end-of-call-report: actualizar estado + IA con transcripción ─────────
    if (message.type === 'end-of-call-report') {
      const callId      = message.call?.id;
      const transcript  = message.transcript ?? null;
      const summary     = message.summary ?? null;
      const endedReason = message.endedReason ?? 'unknown';

      // Razones que indican conversación completada vs abandono
      const COMPLETADOS  = ['assistant-ended-call', 'customer-ended-call'];
      const nuevoEstado  = COMPLETADOS.includes(endedReason) ? 'completado' : 'intento_fallido';

      await query(
        `UPDATE contactos
         SET estado = $1, metadata = metadata || $2::jsonb
         WHERE metadata->>'vapiCallId' = $3 AND estado = 'en_curso'`,
        [
          nuevoEstado,
          JSON.stringify({ endedReason, durationSeconds: message.durationSeconds }),
          callId,
        ]
      );

      // Si hay transcripción, re-clasificar con contexto real
      if (process.env.ANTHROPIC_API_KEY && (transcript || summary)) {
        const { rows } = await query(
          `SELECT id FROM contactos WHERE metadata->>'vapiCallId' = $1 LIMIT 1`,
          [callId]
        );
        if (rows.length) {
          clasificarCaso({ canal: 'voz', descripcion: summary, transcripcion: transcript })
            .then(({ clasificacion, metadata }) =>
              query(
                `UPDATE contactos SET metadata = metadata || $1::jsonb WHERE id = $2`,
                [JSON.stringify({ clasificacion, ia: metadata }), rows[0].id]
              )
            )
            .catch(err => logger.error('Error en re-clasificación IA', { error: err.message }));
        }
      }

      logger.info('Vapi llamada finalizada', { callId, estado: nuevoEstado, endedReason });
      return res.status(200).json({ success: true, estado: nuevoEstado });
    }

    // ── Otros eventos (status-update, transcript, etc.): acusar recibo ───────
    logger.debug('Vapi evento recibido', { type: message.type });
    return res.status(200).json({ success: true, message: 'Evento recibido' });

  } catch (err) {
    next(err);
  }
});

export default router;
