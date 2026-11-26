// Crea un administrador (o recupera el acceso): npm run crear-admin -- usuario "Nombre" contraseña
// Si el usuario ya existe, le cambia la contraseña, lo activa y lo deja como administrador.
import { migrar, get, run, auditar } from '../server/db.js';
import { crearUsuario, hashPass, validarPass } from '../server/auth.js';
const [usuario, nombre, pass] = process.argv.slice(2);
if (!usuario || !nombre || !pass) { console.error('Uso: npm run crear-admin -- usuario "Nombre Apellido" contraseña'); process.exit(1); }
migrar();
try {
  const u = get('SELECT id FROM usuarios WHERE usuario = ?', usuario.trim());
  if (u) {
    validarPass(pass);
    run('UPDATE usuarios SET pass_hash = ?, rol = ?, activo = 1 WHERE id = ?', hashPass(pass), 'admin', u.id);
    run('DELETE FROM sesiones WHERE usuario_id = ?', u.id);
    auditar(null, 'recuperar_acceso', 'usuario', u.id);
    console.log(`Listo: se actualizó el acceso de "${usuario}".`);
  } else { crearUsuario({ usuario, nombre, rol: 'admin', pass }); console.log(`Listo: administrador "${usuario}" creado.`); }
} catch (e) { console.error('ERROR:', e.message); process.exit(1); }
