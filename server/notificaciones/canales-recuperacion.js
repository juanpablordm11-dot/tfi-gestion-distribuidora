// =============================================================================
// PATRÓN STRATEGY: canales para enviar el código de recuperación de contraseña.
//
//   Contexto ............ server/auth.js → pedirRecuperacion(): sabe QUÉ hay que enviar y CUÁNDO
//                         (genera el código, lo guarda hasheado, controla límites), pero NO cómo.
//   Estrategia (interfaz)  todo canal tiene:  nombre  y  enviar({ nombre, usuario, codigo, minutos })
//   Estrategias concretas  CanalConsola  → escribe el aviso en la consola del servidor (envío simulado).
//                          CanalArchivoEmail → deja un correo real (.eml) en una "bandeja de salida".
//   Elección ............. crearCanal(nombre): el canal se elige por configuración al arrancar
//                          (variable de entorno CANAL_RECUPERACION), sin tocar auth.js.
//
// Para sumar un canal nuevo (por ejemplo WhatsApp o un e-mail por SMTP) se agrega una clase con el
// mismo método enviar() y una línea en CANALES. La lógica de seguridad de auth.js no cambia.
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';

/** Estrategia 1: muestra el código en la consola del servidor (la usada en la demo). */
export class CanalConsola {
  nombre = 'consola';
  enviar({ nombre, usuario, codigo, minutos }) {
    console.log(`[ENVÍO SIMULADO] Para: ${nombre} (usuario "${usuario}"). Código de recuperación: ${codigo}. Vence en ${minutos} minutos.`);
    return { canal: this.nombre };
  }
}

/**
 * Estrategia 2: escribe un correo con formato estándar (.eml, RFC 5322) en una carpeta "bandeja de salida".
 * Se abre con doble clic en Outlook, Thunderbird o el Correo de Windows. No necesita servidor de correo:
 * es el paso previo a conectar un envío real por SMTP, con el mismo contenido.
 */
export class CanalArchivoEmail {
  nombre = 'archivo';
  constructor(carpeta) {
    if (!carpeta) throw new Error('CanalArchivoEmail necesita la carpeta de la bandeja de salida.');
    this.carpeta = carpeta;
  }
  enviar({ nombre, usuario, codigo, minutos }) {
    fs.mkdirSync(this.carpeta, { recursive: true });
    const ahora = new Date();
    const sello = ahora.toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
    const archivo = path.join(this.carpeta, `recuperacion-${usuario.replace(/[^a-zA-Z0-9._-]/g, '_')}-${sello}.eml`);
    const correo = [
      'From: Sistema de gestion <no-responder@sistema.local>',
      `To: ${nombre.replace(/[\r\n<>]/g, '')} <${usuario}@sistema.local>`,
      'Subject: =?UTF-8?B?' + Buffer.from('Código para recuperar tu contraseña').toString('base64') + '?=',
      `Date: ${ahora.toUTCString()}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      `Hola ${nombre}:`,
      '',
      `Tu código para recuperar la contraseña es: ${codigo}`,
      '',
      `Vence en ${minutos} minutos y sirve una sola vez.`,
      'Si no lo pediste vos, ignorá este mensaje: tu contraseña no cambia.',
      '',
    ].join('\r\n');
    fs.writeFileSync(archivo, correo, 'utf8');
    console.log(`[ENVÍO POR ARCHIVO] Correo para "${usuario}" guardado en: ${archivo}`);
    return { canal: this.nombre, archivo };
  }
}

// Canales disponibles: nombre → cómo construirlo.
const CANALES = {
  consola: () => new CanalConsola(),
  archivo: ({ carpeta }) => new CanalArchivoEmail(carpeta),
};
export const CANALES_DISPONIBLES = Object.keys(CANALES);

/** Elige el canal por su nombre (por defecto, consola). Un nombre desconocido es un error de configuración. */
export function crearCanal(nombre = 'consola', opciones = {}) {
  const fabrica = CANALES[String(nombre).trim().toLowerCase()];
  if (!fabrica) throw new Error(`Canal de recuperación desconocido: "${nombre}". Opciones: ${CANALES_DISPONIBLES.join(', ')}.`);
  return fabrica(opciones);
}
