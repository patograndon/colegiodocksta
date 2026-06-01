import { Router } from 'express';
import { getEncryptionKey, encrypt } from '../config/encryption.js';
import { query } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { clasificarCaso } from '../services/aiService.js';

const router = Router();

const TIMER_MS = {
  voz:      parseInt(process.env.ABANDONMENT_TIMER_VOICE) || 45_000,
  whatsapp: parseInt(process.env.ABANDONMENT_TIMER_CHAT)  || 300_000,
};

// POST /api/webhook/nuevo-contacto
router.post('/nuevo-contacto', async (req, res, next) => {
  const t0 = Date.now();

  try {
    const { from, canal = 'voz' } = req.body ?? {};

    if (!from || typeof from !== 'string' || from.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Campo "from" requerido (string no vacío)',
      });
    }

    if (!['voz', 'whatsapp'].includes(canal)) {
      return res.status(400).json({
        success: false,
        error: 'Campo "canal" debe ser "voz" o "whatsapp"',
      });
    }

    const t1 = Date.now(); // checkpoint: payload validado

    const key = getEncryptionKey();
    const telefonoCifrado = encrypt(from.trim(), key);

    const t2 = Date.now(); // checkpoint: cifrado completado

    const timerExpiraAt = new Date(Date.now() + TIMER_MS[canal]);

    const result = await query(
      `INSERT INTO contactos (telefono_cifrado, canal, estado, timer_expira_at)
       VALUES ($1, $2, 'en_curso', $3)
       RETURNING id`,
      [telefonoCifrado, canal, timerExpiraAt]
    );

    const contactId = result.rows[0].id;
    const t3 = Date.now(); // checkpoint: contacto guardado

    // Registro de interacción fuera del camino crítico
    query(
      `INSERT INTO interacciones (contacto_id, tipo, payload)
       VALUES ($1, 'webhook_recibido', $2)`,
      [contactId, JSON.stringify({ canal, receivedAt: new Date().toISOString() })]
    ).catch((err) =>
      logger.error('Error al registrar interaccion', { error: err.message, contactId })
    );

    logger.info('Contacto capturado', { contactId, canal, ms: t3 - t0 });

    // ── Respuesta 201 inmediata (camino crítico <100ms) ──────────────────────
    res.status(201).json({
      success: true,
      contactId,
      estado: 'en_curso',
      message: 'Capturado en Fase Cero exitosamente',
      checkpoints: {
        payload_validated: t1 - t0,
        encrypted:         t2 - t0,
        contacto_created:  t3 - t0,
      },
      executionTime:     t3 - t0,
      totalResponseTime: Date.now() - t0,
    });

    // ── Clasificación IA en background (fuera del camino crítico) ────────────
    if (process.env.ANTHROPIC_API_KEY) {
      clasificarCaso({ canal })
        .then(({ clasificacion, metadata }) =>
          query(
            `UPDATE contactos SET metadata = $1 WHERE id = $2`,
            [JSON.stringify({ clasificacion, ia: metadata }), contactId]
          )
        )
        .catch(err =>
          logger.error('Error en clasificación IA', { error: err.message, contactId })
        );
    }

  } catch (err) {
    next(err);
  }
});

export default router;
