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

// ID de fallback: Fundación Comunidad Viva (escuelas.id = 1)
const ESCUELA_FUNDACION = 1;

// ── Enrutamiento telefónico: busca escuela_id por número destino ──────────────
// Usa índices en whatsapp_oficial / vapi_phone_id → ~2-5ms
async function resolverEscuela(toNumber, canal) {
  if (!toNumber) return ESCUELA_FUNDACION;

  const col = canal === 'whatsapp' ? 'whatsapp_oficial' : 'vapi_phone_id';
  try {
    const { rows } = await query(
      `SELECT id FROM escuelas WHERE ${col} = $1 AND activa = true LIMIT 1`,
      [toNumber]
    );
    if (rows.length) return rows[0].id;

    logger.warn('Número destino no registrado en escuelas — asignando Fundación Matriz', {
      toNumber, canal, fallback: ESCUELA_FUNDACION,
    });
    return ESCUELA_FUNDACION;
  } catch (err) {
    logger.error('Error al resolver escuela — usando fallback', { error: err.message });
    return ESCUELA_FUNDACION;
  }
}

// ── POST /api/webhook/nuevo-contacto ─────────────────────────────────────────
router.post('/nuevo-contacto', async (req, res, next) => {
  const t0 = Date.now();

  try {
    // `to` = número de destino (identifica la escuela)
    // `from` = número del alumno/apoderado
    const { from, to = null, canal = 'voz' } = req.body ?? {};

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

    const t1 = Date.now(); // payload validado

    // Enrutamiento + cifrado en paralelo (ambos son rápidos)
    const [escuelaId, telefonoCifrado] = await Promise.all([
      resolverEscuela(to?.trim() ?? null, canal),
      Promise.resolve(encrypt(from.trim(), getEncryptionKey())),
    ]);

    const t2 = Date.now(); // cifrado + escuela resuelta

    const timerExpiraAt = new Date(Date.now() + TIMER_MS[canal]);

    const result = await query(
      `INSERT INTO contactos (telefono_cifrado, canal, estado, timer_expira_at, escuela_id)
       VALUES ($1, $2, 'en_curso', $3, $4)
       RETURNING id`,
      [telefonoCifrado, canal, timerExpiraAt, escuelaId]
    );

    const contactId = result.rows[0].id;
    const t3 = Date.now(); // contacto guardado

    // Interacción fuera del camino crítico
    query(
      `INSERT INTO interacciones (contacto_id, tipo, payload)
       VALUES ($1, 'webhook_recibido', $2)`,
      [contactId, JSON.stringify({ canal, to, receivedAt: new Date().toISOString() })]
    ).catch(err => logger.error('Error al registrar interaccion', { error: err.message, contactId }));

    logger.info('Contacto capturado', { contactId, canal, escuelaId, ms: t3 - t0 });

    res.status(201).json({
      success: true,
      contactId,
      escuelaId,
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

    // IA en background
    if (process.env.ANTHROPIC_API_KEY) {
      clasificarCaso({ canal })
        .then(({ clasificacion, metadata }) =>
          query(
            `UPDATE contactos SET metadata = $1 WHERE id = $2`,
            [JSON.stringify({ clasificacion, ia: metadata }), contactId]
          )
        )
        .catch(err => logger.error('Error en clasificación IA', { error: err.message, contactId }));
    }

  } catch (err) {
    next(err);
  }
});

export default router;
