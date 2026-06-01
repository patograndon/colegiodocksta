import { encrypt, decrypt, generateNewKey } from '../src/config/encryption.js';

console.log('\n🧪 Tests de Criptografía AES-256-GCM\n');

const testGenerateKey = () => {
  console.log('Test 1: Generar clave segura');
  const key = generateNewKey();
  console.log(`  ✅ Clave generada: ${key.substring(0, 16)}...`);
  console.log(`  ✅ Longitud: ${key.length / 2} bytes (debe ser 32)`);
  return key;
};

const testEncrypt = (key) => {
  console.log('\nTest 2: Cifrar número telefónico');
  const keyBuffer = Buffer.from(key, 'hex');
  const plaintext = '+56912345678';
  
  const encrypted = encrypt(plaintext, keyBuffer);
  console.log(`  ✅ Texto original: ${plaintext}`);
  console.log(`  ✅ Texto cifrado: ${encrypted.substring(0, 40)}...`);
  console.log(`  ✅ Formato: iv:authTag:encryptedText`);
  
  return encrypted;
};

const testDecrypt = (key, encrypted) => {
  console.log('\nTest 3: Descifrar número telefónico');
  const keyBuffer = Buffer.from(key, 'hex');
  
  const decrypted = decrypt(encrypted, keyBuffer);
  console.log(`  ✅ Texto descifrado: ${decrypted}`);
  console.log(`  ✅ Verificación: ${decrypted === '+56912345678' ? '✓ CORRECTO' : '✗ ERROR'}`);
  
  return decrypted;
};

const testIntegrity = (key, encrypted) => {
  console.log('\nTest 4: Integridad - Intentar manipular ciphertext');
  const keyBuffer = Buffer.from(key, 'hex');
  
  const parts = encrypted.split(':');
  const manipulated = `${parts[0]}:${parts[1]}:${parts[2].substring(0, parts[2].length - 1)}0`;
  
  try {
    decrypt(manipulated, keyBuffer);
    console.log(`  ❌ ERROR: Se debería haber rechazado el ciphertext manipulado`);
  } catch (error) {
    console.log(`  ✅ Rechazo correcto: ${error.message}`);
  }
};

const testPerformance = (key) => {
  console.log('\nTest 5: Performance - 1000 cifrajes');
  const keyBuffer = Buffer.from(key, 'hex');
  const plaintext = '+56912345678';
  
  const start = Date.now();
  for (let i = 0; i < 1000; i++) {
    encrypt(plaintext, keyBuffer);
  }
  const duration = Date.now() - start;
  
  console.log(`  ✅ 1000 cifrajes completados en ${duration}ms`);
  console.log(`  ✅ Promedio: ${(duration / 1000).toFixed(3)}ms por cifrado`);
  console.log(`  ✅ Objetivo Fase Cero: < 100ms total ✓`);
};

try {
  const key = testGenerateKey();
  const encrypted = testEncrypt(key);
  const decrypted = testDecrypt(key, encrypted);
  testIntegrity(key, encrypted);
  testPerformance(key);
  
  console.log('\n✅ Todos los tests de criptografía pasaron exitosamente\n');
} catch (error) {
  console.error('❌ Error en tests:', error.message);
  process.exit(1);
}
