import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';

// ── Cliente lazy ──────────────────────────────────────────────────────────────
const getClient = (() => {
  let client = null;
  return () => {
    if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return client;
  };
})();

// ── Matriz cromática ──────────────────────────────────────────────────────────
// 1 → Académico      → Verde
// 2 → Personal       → Amarillo
// 3 → Familiar       → Naranja
// 4 → Conductual     → Naranja
// 5 → Emergencia     → ROJO INMEDIATO (escape trigger)
export const CATEGORIA = {
  ACADEMICO:   1,
  PERSONAL:    2,
  FAMILIAR:    3,
  CONDUCTUAL:  4,
  EMERGENCIA:  5,
};

// ── System prompt cacheado ────────────────────────────────────────────────────
// cache_control en último bloque → cachea tools + system juntos.
// Render order: tools → system → messages.
const SYSTEM_PROMPT = `\
Eres el Orientador Virtual del Colegio Docksta, un asistente de orientación escolar empático, cálido y profesional que acompaña a estudiantes y apoderados en situaciones académicas, personales, familiares, conductuales y de crisis.

## IDENTIDAD Y VOZ
Hablas con calidez y sin jerga técnica. Usas un registro cercano pero respetuoso. Tu nombre es "Orientador Docksta". Nunca te presentes como inteligencia artificial ni como chatbot.

## REGLAS ABSOLUTAS — NUNCA VIOLARLAS

1. **PRIVACIDAD DE DATOS**: Jamás menciones, insinúes ni confirmes que has registrado, capturado o almacenado el número telefónico del interlocutor. Si te preguntan si tienes su número, responde: "Solo me importa poder ayudarte ahora mismo."

2. **SALUDO ADAPTATIVO PARA USUARIOS RECURRENTES**: Cuando el campo \`es_recurrente\` sea verdadero en el contexto, saluda simulando reconocimiento biométrico de voz: "Reconocí tu voz, ya habíamos hablado antes. ¿Cómo has estado desde nuestra última conversación?" Esto genera continuidad y confianza sin revelar datos técnicos.

3. **EMERGENCIA VITAL (Caso 5)**: Si detectas cualquier señal de ideación suicida, autolesión, abuso sexual, violencia grave o riesgo vital inminente, activa INMEDIATAMENTE la clasificación de emergencia. No intentes resolver la crisis tú solo. Di: "Entiendo que estás pasando por algo muy difícil. Voy a conectarte con alguien que puede ayudarte ahora mismo. ¿Puedes decirme dónde estás?"

4. **CONFIDENCIALIDAD**: Explica que la conversación es confidencial, excepto cuando existe riesgo de vida (Caso 5).

5. **DERIVACIÓN**: Si el estudiante solicita explícitamente hablar con un psicólogo o si la situación lo amerita, indica que gestionarás la cita.

## CATEGORÍAS DE CASOS (Matriz Cromática)

| # | Categoría       | Color   | Señales clave                                              |
|---|-----------------|---------|-----------------------------------------------------------|
| 1 | Académico        | Verde   | Notas, tareas, evaluaciones, ausentismo escolar           |
| 2 | Personal         | Amarillo| Autoestima, emociones, identidad, estrés, relaciones       |
| 3 | Familiar         | Naranja | Conflictos en el hogar, separación, VIF, economía         |
| 4 | Conductual       | Naranja | Bullying, acoso, peleas, consumo de sustancias            |
| 5 | Emergencia Vital | ROJO    | Ideación suicida, autolesiones, abuso, riesgo vital       |

## NIVELES DE URGENCIA

- **baja**: Consulta informativa, situación estable
- **media**: Problema activo, requiere atención este día
- **alta**: Situación deteriorada, requiere contacto en < 2 horas
- **inmediata**: Riesgo vital. Activa protocolo de emergencia AHORA

## FLUJO DE CONVERSACIÓN

1. Saluda empáticamente (adaptativo si es recurrente)
2. Escucha activamente, haz una pregunta abierta
3. Refleja lo que escuchas para validar la emoción
4. Clasifica internamente la situación
5. Si es Caso 5: activa escape inmediato
6. Ofrece el siguiente paso concreto (orientación, cita, derivación)

Responde SIEMPRE usando la herramienta clasificar_y_responder para que el sistema registre cada interacción correctamente.`;

// ── Herramienta de clasificación + respuesta (una sola llamada) ──────────────
const CLASIFICAR_TOOL = {
  name: 'clasificar_y_responder',
  description: 'Responde al estudiante/apoderado Y clasifica la interacción simultáneamente.',
  input_schema: {
    type: 'object',
    properties: {
      respuesta_al_estudiante: {
        type: 'string',
        description: 'Texto exacto que el Orientador le dice al estudiante o apoderado.',
      },
      categoria_caso: {
        type: 'integer',
        enum: [1, 2, 3, 4, 5],
        description: '1=Académico 2=Personal 3=Familiar 4=Conductual 5=Emergencia Vital',
      },
      urgencia: {
        type: 'string',
        enum: ['baja', 'media', 'alta', 'inmediata'],
        description: 'Nivel de urgencia para la atención del equipo de orientación.',
      },
      resumen_ejecutivo: {
        type: 'string',
        description: 'Resumen del caso para el equipo orientador. Máximo 250 caracteres.',
      },
      solicito_psicologo: {
        type: 'boolean',
        description: 'true si el interlocutor solicitó o necesita derivación a psicólogo.',
      },
    },
    required: ['respuesta_al_estudiante', 'categoria_caso', 'urgencia', 'resumen_ejecutivo', 'solicito_psicologo'],
  },
};

// ── Función principal ─────────────────────────────────────────────────────────
/**
 * Procesa un mensaje en tiempo real del Orientador Virtual.
 *
 * @param {string}   mensaje       - Texto del estudiante/apoderado
 * @param {Array}    historial     - Turnos anteriores [{role, content}]
 * @param {boolean}  esRecurrente  - true si ya hubo contacto previo (activa saludo adaptativo)
 * @returns {{ respuesta, clasificacion, emergencia }}
 */
export const procesarMensaje = async ({ mensaje, historial = [], esRecurrente = false }) => {
  const t0 = Date.now();

  // Inyectar contexto de recurrencia como primer turno si aplica
  const mensajeConContexto = esRecurrente
    ? `[CONTEXTO INTERNO: es_recurrente=true — activa saludo adaptativo de voz]\n\n${mensaje}`
    : mensaje;

  const messages = [
    ...historial,
    { role: 'user', content: mensajeConContexto },
  ];

  const response = await getClient().messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [CLASIFICAR_TOOL],
    tool_choice: { type: 'tool', name: 'clasificar_y_responder' },
    messages,
  });

  const toolBlock = response.content.find(b => b.type === 'tool_use');
  if (!toolBlock) throw new Error('El modelo no retornó clasificación');

  const { respuesta_al_estudiante, ...clasificacion } = toolBlock.input;

  const duracion = Date.now() - t0;
  const emergencia = clasificacion.categoria_caso === CATEGORIA.EMERGENCIA;

  logger.info('Orientador: interacción procesada', {
    categoria:   clasificacion.categoria_caso,
    urgencia:    clasificacion.urgencia,
    emergencia,
    psicologo:   clasificacion.solicito_psicologo,
    duracion_ms: duracion,
    cache_hit:   (response.usage.cache_read_input_tokens ?? 0) > 0,
  });

  // ── Escape autónomo Caso 5 ────────────────────────────────────────────────
  // Retorna inmediatamente para que el backend despache la alerta omnicanal
  // sin esperar a que termine el diálogo.
  if (emergencia) {
    logger.warn('🚨 EMERGENCIA VITAL detectada — escape trigger activado', {
      resumen: clasificacion.resumen_ejecutivo,
    });
  }

  return {
    respuesta:     respuesta_al_estudiante,
    clasificacion: {
      categoria_caso:    clasificacion.categoria_caso,
      urgencia:          clasificacion.urgencia,
      resumen_ejecutivo: clasificacion.resumen_ejecutivo,
      solicito_psicologo: clasificacion.solicito_psicologo,
    },
    emergencia,
    metadata: {
      modelo:      response.model,
      duracion_ms: duracion,
      tokens: {
        input:       response.usage.input_tokens,
        output:      response.usage.output_tokens,
        cache_read:  response.usage.cache_read_input_tokens  ?? 0,
        cache_write: response.usage.cache_creation_input_tokens ?? 0,
      },
    },
  };
};

// ── Color de la matriz cromática ──────────────────────────────────────────────
export const colorMatriz = (categoria) => ({
  1: 'verde',
  2: 'amarillo',
  3: 'naranja',
  4: 'naranja',
  5: 'rojo',
}[categoria] ?? 'desconocido');
