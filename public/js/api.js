// Comunicación con el servidor. Toda cifra importante la valida y calcula el servidor.
export class ApiError extends Error {
  constructor(message, { status = 0, code = null, extra = null } = {}) {
    super(message);
    this.status = status; this.code = code; this.extra = extra;
  }
}

export async function api(method, url, body) {
  let resp;
  try {
    resp = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError('No se pudo conectar con el servidor. Revisá tu conexión y que el sistema esté encendido. No se guardó nada.', { code: 'RED' });
  }
  let data = null;
  try { data = await resp.json(); } catch { /* respuesta sin cuerpo */ }
  if (!resp.ok) {
    if (resp.status === 401 && data?.code === 'NO_AUTH') window.dispatchEvent(new CustomEvent('sesion-vencida'));
    throw new ApiError(data?.error || `Error ${resp.status}`, { status: resp.status, code: data?.code, extra: data?.extra });
  }
  return data;
}
export const get = (u) => api('GET', u);
export const post = (u, b = {}) => api('POST', u, b);
export const put = (u, b = {}) => api('PUT', u, b);
export const del = (u) => api('DELETE', u);

export const qs = (o) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};
