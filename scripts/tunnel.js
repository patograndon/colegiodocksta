import localtunnel from 'localtunnel';
import dotenv from 'dotenv';
dotenv.config();

const PORT   = parseInt(process.env.PORT) || 3000;
const SUBDOMAIN = 'colegiodocksta';

console.log(`\nAbriendo túnel para http://localhost:${PORT} ...\n`);

const tunnel = await localtunnel({ port: PORT, subdomain: SUBDOMAIN })
  .catch(() => localtunnel({ port: PORT })); // fallback sin subdominio si está ocupado

const webhookUrl = `${tunnel.url}/api/webhook/vapi`;

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  TÚNEL ACTIVO                                                ║');
console.log(`║  URL pública  : ${tunnel.url.padEnd(46)}║`);
console.log('║                                                              ║');
console.log('║  CONFIGURA EN VAPI DASHBOARD:                                ║');
console.log(`║  Server URL   : ${webhookUrl.padEnd(46)}║`);
console.log(`║  Secret       : (valor de VAPI_AUTH_TOKEN en tu .env)        ║`);
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log('\nEsperando llamadas Vapi... (Ctrl+C para cerrar)\n');

tunnel.on('close', () => {
  console.log('\nTúnel cerrado.');
  process.exit(0);
});

tunnel.on('error', (err) => {
  console.error('Error en túnel:', err.message);
});

// Mantener el proceso vivo
process.on('SIGINT', () => {
  tunnel.close();
});
