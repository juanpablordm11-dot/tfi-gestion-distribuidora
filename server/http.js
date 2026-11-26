// Mini servidor HTTP sin dependencias: rutas con parámetros, JSON, cookies y archivos estáticos.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from './util.js';

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};
const MAX_BODY = 1_000_000;

export function parseCookies(header = '') {
  const o = {};
  for (const par of header.split(';')) {
    const i = par.indexOf('=');
    if (i > 0) o[par.slice(0, i).trim()] = decodeURIComponent(par.slice(i + 1).trim());
  }
  return o;
}

export function crearApp({ publicDir, confiarProxy = false }) {
  const rutas = [];
  // Subidas de archivos binarios (copias de la base). No vienen del navegador: se autorizan con un token propio
  // en el handler, así que no usan la defensa CSRF de cookies ni el límite de tamaño de los pedidos JSON.
  const subidas = [];

  function agregar(metodo, ruta, ...handlers) {
    const claves = [];
    const re = new RegExp('^' + ruta.replace(/:([a-zA-Z_]+)/g, (_, k) => { claves.push(k); return '([^/]+)'; }) + '/?$');
    rutas.push({ metodo, re, claves, handlers });
  }

  function leerBody(req, max = MAX_BODY, binario = false) {
    return new Promise((resolve, reject) => {
      let tam = 0; const trozos = [];
      req.on('data', (c) => {
        tam += c.length;
        if (tam > max) { reject(new HttpError(413, 'El pedido es demasiado grande.')); req.destroy(); return; }
        trozos.push(c);
      });
      req.on('end', () => { const b = Buffer.concat(trozos); resolve(binario ? b : b.toString('utf8')); });
      req.on('error', reject);
    });
  }

  function cabecerasSeguridad(res, seguro) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
      "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if (seguro) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  }

  function enviarJSON(res, status, data) {
    const cuerpo = JSON.stringify(data);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(cuerpo);
  }

  function servirEstatico(req, res, pathname) {
    let rel = decodeURIComponent(pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const abs = path.normalize(path.join(publicDir, rel));
    if (!abs.startsWith(publicDir + path.sep) && abs !== publicDir) { res.writeHead(403); res.end('Prohibido'); return; }
    fs.stat(abs, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('No encontrado'); return; }
      const etag = `"${st.size}-${Math.floor(st.mtimeMs)}"`;
      if (req.headers['if-none-match'] === etag) { res.writeHead(304); res.end(); return; }
      res.writeHead(200, {
        'Content-Type': TIPOS[path.extname(abs)] || 'application/octet-stream',
        'Cache-Control': 'no-cache', ETag: etag,
      });
      fs.createReadStream(abs).pipe(res);
    });
  }

  async function atender(req, res) {
    // Detrás de un proxy (Railway, túnel de Cloudflare) el https lo resuelve el proxy y avisa por cabecera.
    const seguro = confiarProxy
      ? req.headers['x-forwarded-proto'] === 'https' || /"scheme":"https"/.test(String(req.headers['cf-visitor'] || ''))
      : !!req.socket.encrypted;
    cabecerasSeguridad(res, seguro);
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;
    try {
      if (!pathname.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Método no permitido');
        return servirEstatico(req, res, pathname);
      }
      // IP real de quien entra (para el bloqueo por intentos fallidos). Cloudflare la manda en CF-Connecting-IP.
      const ip = (confiarProxy && (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',')[0].trim())) || req.socket.remoteAddress;
      const ctx = {
        req, res, url, ip, seguro, params: {}, query: Object.fromEntries(url.searchParams),
        cookies: parseCookies(req.headers.cookie), body: {}, user: null, cookiesSalida: [],
        setCookie(v) { this.cookiesSalida.push(v); },
      };
      const metodo = req.method;
      const subida = metodo === 'POST' && subidas.find((s) => s.re.test(pathname));
      if (subida) {
        ctx.archivoSubido = await leerBody(req, subida.max, true);
        const resultado = await subida.handler(ctx);
        return enviarJSON(res, ctx.status || 200, resultado ?? { ok: true });
      }
      const mutante = !['GET', 'HEAD', 'OPTIONS'].includes(metodo);
      if (mutante) {
        // Defensa contra CSRF: mismo origen + cabecera propia + JSON.
        const origin = req.headers.origin;
        if (origin) {
          let host; try { host = new URL(origin).host; } catch { host = ''; }
          if (host !== req.headers.host) throw new HttpError(403, 'Origen no permitido.');
        }
        if (req.headers['x-requested-with'] !== 'fetch') throw new HttpError(403, 'Pedido no permitido.');
        const raw = await leerBody(req);
        if (raw) {
          if (!String(req.headers['content-type'] || '').includes('application/json')) throw new HttpError(415, 'Se esperaba JSON.');
          try { ctx.body = JSON.parse(raw); } catch { throw new HttpError(400, 'El JSON enviado no es válido.'); }
        }
      }
      let ruta = null; let hayRutaConOtroMetodo = false;
      for (const r of rutas) {
        const m = r.re.exec(pathname);
        if (!m) continue;
        if (r.metodo !== metodo) { hayRutaConOtroMetodo = true; continue; }
        ruta = r;
        r.claves.forEach((k, i) => { ctx.params[k] = decodeURIComponent(m[i + 1]); });
        break;
      }
      if (!ruta) throw new HttpError(hayRutaConOtroMetodo ? 405 : 404, hayRutaConOtroMetodo ? 'Método no permitido' : 'No existe esa ruta');
      let resultado;
      for (const h of ruta.handlers) {
        resultado = await h(ctx);
        if (ctx.respondido) return;
      }
      if (ctx.cookiesSalida.length) res.setHeader('Set-Cookie', ctx.cookiesSalida);
      if (ctx.archivo) {
        res.writeHead(200, ctx.archivo.headers);
        return fs.createReadStream(ctx.archivo.path).on('close', () => ctx.archivo.alCerrar?.()).pipe(res);
      }
      if (ctx.binario) { // archivo generado en memoria (por ejemplo, el comprobante en PDF)
        res.writeHead(200, { ...ctx.binario.headers, 'Content-Length': ctx.binario.buffer.length });
        return res.end(ctx.binario.buffer);
      }
      enviarJSON(res, ctx.status || 200, resultado ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) {
        return enviarJSON(res, e.status, { error: e.message, code: e.code, ...(e.extra ? { extra: e.extra } : {}) });
      }
      const msg = String(e?.message || e);
      if (e?.code === 'ERR_SQLITE_ERROR') {
        console.error('[restricción]', msg);
        return enviarJSON(res, 400, { error: traducirRestriccion(msg), code: 'RESTRICCION' });
      }
      console.error('[error]', e);
      enviarJSON(res, 500, { error: 'Ocurrió un error inesperado. No se guardó nada. Intentá de nuevo.' });
    }
  }

  function traducirRestriccion(msg) {
    if (/existencias\.cantidad/.test(msg)) return 'No hay stock suficiente para completar la operación.';
    if (/UNIQUE constraint failed: .*codigo/.test(msg)) return 'Ya existe un producto con ese código.';
    if (/UNIQUE constraint failed: usuarios/.test(msg)) return 'Ya existe un usuario con ese nombre.';
    if (/^(La|El|Las|Los) /.test(msg)) return msg; // mensajes propios de los triggers de la base de datos
    return 'Los datos no cumplen las reglas del sistema. No se guardó nada.';
  }

  const server = http.createServer((req, res) => { atender(req, res); });
  return {
    server,
    get: (r, ...h) => agregar('GET', r, ...h),
    post: (r, ...h) => agregar('POST', r, ...h),
    put: (r, ...h) => agregar('PUT', r, ...h),
    delete: (r, ...h) => agregar('DELETE', r, ...h),
    subida: (r, max, handler) => subidas.push({ re: new RegExp(`^${r}/?$`), max, handler }),
  };
}
