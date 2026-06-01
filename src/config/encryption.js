import crypto from 'crypto';
import { logger } from '../utils/logger.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Obtener clave de cifrado desde variables de entorno
 */
export const getEncryptionKey = () => {
  const keyHex = process.env.ENCRYPTION_KEY;
  
  if (!keyHex) {
    throw new Error(
      'ENCRYPTION_KEY no configurada. Generar con: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  
  const keyBuffer = Buffer.from(keyHex, 'hex');
  
  if (keyBuffer.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY debe ser exactamente 32 bytes (256 bits). Actual: ${keyBuffer.length} bytes`
    );
  }
  
  return keyBuffer;
};

/**
 * Cifrar datos usando AES-256-GCM
 * @param {string} plaintext - Texto a cifrar (ej: número telefónico)
 * @param {Buffer} key - Clave de cifrado (32 bytes)
 * @returns {string} Formato: "iv:authTag:encryptedText" (hexadecimal)
 */
export const encrypt = (plaintext, key) => {
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    const result = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    
    logger.debug('Cifrado exitoso', {
      plaintextLength: plaintext.length,
      encryptedLength: encrypted.length,
      algorithm: ALGORITHM
    });
    
    return result;
  } catch (error) {
    logger.error('Error en cifrado AES-256-GCM', { error: error.message });
    throw new Error(`Fallo en cifrado: ${error.message}`);
  }
};

/**
 * Descifrar datos usando AES-256-GCM
 * @param {string} ciphertext - Datos cifrados en formato "iv:authTag:encryptedText"
 * @param {Buffer} key - Clave de cifrado (32 bytes)
 * @returns {string} Texto descifrado
 */
export const decrypt = (ciphertext, key) => {
  try {
    const parts = ciphertext.split(':');
    
    if (parts.length !== 3) {
      throw new Error('Formato de ciphertext inválido. Esperado: iv:authTag:encryptedText');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    if (iv.length !== IV_LENGTH) {
      throw new Error(`IV debe ser ${IV_LENGTH} bytes`);
    }
    if (authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error(`Auth tag debe ser ${AUTH_TAG_LENGTH} bytes`);
    }
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    logger.debug('Descifrado exitoso');
    return decrypted;
  } catch (error) {
    logger.error('Error en descifrado AES-256-GCM', { error: error.message });
    throw new Error(`Fallo en descifrado: ${error.message}`);
  }
};

/**
 * Generar nueva clave de cifrado
 */
export const generateNewKey = () => {
  const key = crypto.randomBytes(32);
  return key.toString('hex');
};

export const encryptionConfig = {
  ALGORITHM,
  IV_LENGTH,
  AUTH_TAG_LENGTH,
  KEY_LENGTH: 32
};
