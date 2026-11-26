// Crea una copia de seguridad ahora: npm run backup
import { migrar } from '../server/db.js';
import { crearBackup } from '../server/backup.js';
migrar();
console.log('Copia creada en:', crearBackup('manual'));
