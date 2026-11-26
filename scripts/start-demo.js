// Arranca el sistema con la base de demostración (data/demo.db): npm run start:demo
// Funciona igual en Windows, Mac y Linux (la sintaxis DB_PATH=... solo anda en Mac/Linux).
process.env.DB_PATH ||= 'data/demo.db';
await import('../server/index.js');
