// Generador de PDF mínimo, sin dependencias: páginas A4 con texto (Helvetica / Helvetica-Bold) y líneas.
// Alcanza para el comprobante de venta. Texto en WinAnsi (acentos, ñ, ¿¡°·), coordenadas en puntos desde arriba.

// Anchos de Helvetica (unidades de 1/1000 del tamaño de letra) para calcular alineaciones a la derecha y recortes.
const ANCHOS = {
  ' ': 278, '!': 278, '"': 355, '#': 556, $: 556, '%': 889, '&': 667, "'": 191, '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015, '[': 278, '\\': 278, ']': 278, '^': 469, _: 556, '`': 333, '{': 334, '|': 260, '}': 334, '~': 584,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611, a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833, n: 556,
  o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500, '°': 400, '·': 278, '¿': 611, '¡': 333, '—': 1000, '–': 556,
};
const SIN_ACENTO = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n', Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ñ: 'N', Ü: 'U' };
export function ancho(texto, tam, negrita = false) {
  let u = 0;
  for (const c of String(texto)) {
    const w = ANCHOS[c] ?? ANCHOS[SIN_ACENTO[c]] ?? 556;
    // En Helvetica-Bold los números y signos miden lo mismo; las letras son un poco más anchas.
    u += negrita && /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(c) ? w * 1.08 : w;
  }
  return (u * tam) / 1000;
}

// Texto a bytes WinAnsi, escapando lo que PDF exige. Lo que no existe en WinAnsi se reemplaza.
function winAnsi(texto) {
  const REEMPLAZOS = { '—': 0x97, '–': 0x96, '−': 0x2d, '…': 0x85, '“': 0x93, '”': 0x94, '‘': 0x91, '’': 0x92, '•': 0x95, '€': 0x80, ' ': 0x20, ' ': 0x20 };
  const bytes = [];
  for (const c of String(texto)) {
    const cp = c.codePointAt(0);
    let b = REEMPLAZOS[c] ?? (cp < 0x80 || (cp >= 0xa0 && cp <= 0xff) ? cp : 0x3f);
    if (b === 0x28 || b === 0x29 || b === 0x5c) bytes.push(0x5c); // ( ) \ van escapados
    bytes.push(b);
  }
  return Buffer.from(bytes).toString('latin1');
}

export function crearPdf() {
  const ALTO = 842; const paginas = []; let ops = null;
  const nueva = () => { ops = []; paginas.push(ops); };
  nueva();
  const y = (v) => (ALTO - v).toFixed(2);
  return {
    ALTO, ANCHO: 595,
    nuevaPagina: nueva,
    // Texto en (x, yDesdeArriba). alinear: 'izq' | 'der' (x = borde derecho) | 'centro'
    texto(x, yArriba, texto, { tam = 10, negrita = false, alinear = 'izq', gris = false } = {}) {
      const w = ancho(texto, tam, negrita);
      const xx = alinear === 'der' ? x - w : alinear === 'centro' ? x - w / 2 : x;
      ops.push(`BT ${gris ? '0.35 g' : '0 g'} /${negrita ? 'F2' : 'F1'} ${tam} Tf ${xx.toFixed(2)} ${y(yArriba)} Td (${winAnsi(texto)}) Tj ET`);
    },
    linea(x1, y1, x2, y2, grosor = 0.6) { ops.push(`${grosor} w 0 G ${x1} ${y(y1)} m ${x2} ${y(y2)} l S`); },
    rect(x, yArriba, w, h, grosor = 0.8) { ops.push(`${grosor} w 0 G ${x} ${y(yArriba + h)} ${w} ${h} re S`); },
    // Recorta un texto para que entre en un ancho dado (agrega "…").
    recortar(texto, anchoMax, tam) {
      let t = String(texto);
      if (ancho(t, tam) <= anchoMax) return t;
      while (t.length > 1 && ancho(t + '…', tam) > anchoMax) t = t.slice(0, -1);
      return t + '…';
    },
    // Arma el archivo PDF (objetos, tabla xref y trailer).
    terminar() {
      const objs = [];
      const agregar = (s) => { objs.push(s); return objs.length; };
      const catalogo = agregar(null); const raizPaginas = agregar(null);
      const f1 = agregar('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
      const f2 = agregar('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
      const kids = [];
      for (const p of paginas) {
        const contenido = p.join('\n');
        const c = agregar(`<< /Length ${Buffer.byteLength(contenido, 'latin1')} >>\nstream\n${contenido}\nendstream`);
        kids.push(agregar(`<< /Type /Page /Parent ${raizPaginas} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${c} 0 R >>`));
      }
      objs[catalogo - 1] = `<< /Type /Catalog /Pages ${raizPaginas} 0 R >>`;
      objs[raizPaginas - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
      let salida = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'; const offsets = [];
      objs.forEach((o, i) => { offsets.push(Buffer.byteLength(salida, 'latin1')); salida += `${i + 1} 0 obj\n${o}\nendobj\n`; });
      const xref = Buffer.byteLength(salida, 'latin1');
      salida += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
      salida += `trailer\n<< /Size ${objs.length + 1} /Root ${catalogo} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
      return Buffer.from(salida, 'latin1');
    },
  };
}
