# 🎓 Sistema Omnicanal de Orientación Escolar - Backend Fase Cero

## 📋 Descripción

Backend de Node.js/Express para captura inmediata de contactos telefónicos en menos de 100ms, con cifrado AES-256-GCM y gestión de abandono diferenciado por canal.

## 🏗️ Estructura del Proyecto

```
colegiodocksta/
├── src/
│   ├── index.js                           # Servidor principal
│   ├── config/
│   │   ├── database.js                    # Pool PostgreSQL
│   │   └── encryption.js                  # AES-256-GCM
│   ├── services/
│   │   ├── encryptionService.js           # Servicios de cifrado
│   │   └── contactService.js              # Negocio de contactos (FASE CERO)
│   ├── routes/
│   │   └── webhooks.js                    # POST /api/webhook/nuevo-contacto
│   ├── middleware/
│   │   ├── performanceMonitor.js          # Métricas < 100ms
│   │   └── errorHandler.js                # Manejo de errores
│   └── utils/
│       └── logger.js                      # Sistema de logging
├── database/
│   └── init.sql                           # ENUM, Tablas, Índices, Triggers
├── scripts/
│   └── migrate.js                         # Ejecutor de migraciones SQL
├── tests/
│   └── encryption.test.js                 # Tests de criptografía
├── .env.example                           # Template de variables
├── .gitignore                             # Git ignore
├── package.json                           # Dependencias
└── README.md                              # Documentación
```

## 🔐 Seguridad: AES-256-GCM

- **Algoritmo**: AES-256-GCM (256-bit key, 128-bit IV)
- **Formato almacenado**: `iv:authTag:encryptedText` (hexadecimal)
- **Clave**: Desde `process.env.ENCRYPTION_KEY` (32 bytes = 256 bits)

## ⚡ Regla de Oro: Captura Inmediata (< 100ms)

Al recibir webhook:
1. Extraer `from` del JSON
2. Cifrar número telefónico
3. Guardar en BD con estado `en_curso`
4. Retornar confirmación en **< 100ms**
5. Ejecutar lógica pesada (IA) en background

## ⏱️ Temporizadores Anti-Arrepentimiento

| Canal | Timeout | Acción |
|-------|---------|--------|
| Vapi (Voz) | 45 seg | Marcar `intento_fallido` |
| WhatsApp (Chat) | 5 min | Marcar `intento_fallido` |

## 🚀 Instalación

```bash
# 1. Clonar y entrar
git clone https://github.com/patograndon/colegiodocksta.git
cd colegiodocksta

# 2. Instalar dependencias
npm install

# 3. Configurar entorno
cp .env.example .env
# Editar .env con credenciales reales

# 4. Migrar base de datos
npm run migrate

# 5. Iniciar servidor
npm run dev
```

## 📡 API Endpoints

### POST /api/webhook/nuevo-contacto

**Payload esperado**:
```json
{
  "from": "+56912345678"
}
```

**Respuesta (< 100ms)**:
```json
{
  "success": true,
  "contactId": 42,
  "estado": "en_curso",
  "executionTime": 87,
  "message": "Capturado en Fase Cero exitosamente",
  "checkpoints": {
    "payload_validated": 2,
    "contacto_created": 87
  },
  "totalResponseTime": 89
}
```

**Códigos de estado**:
- `201`: Creado exitosamente
- `400`: Payload inválido
- `500`: Error de servidor

## 🧪 Testing

```bash
# Ejecutar tests de criptografía
npm run test:crypto

# Test manual con curl
curl -X POST http://localhost:3000/api/webhook/nuevo-contacto \
  -H "Content-Type: application/json" \
  -d '{"from": "+56912345678"}'
```

## 📊 Monitoreo de Performance

Cada petición incluye header `X-Response-Time` con tiempo en ms.

```
X-Response-Time: 87ms
```

Si excede 100ms, se registra alerta en logs.

## 🔧 Variables de Entorno

Ver `.env.example` para todas las configuraciones.

## 📝 Licencia

MIT - patograndon 2026
