/* Dsgn. Studio — configurador visual de enmarcado.
   Dibuja el cuadro por capas en un <canvas>: pared, sombra, contenido (paspartú / arpillera / foto),
   marco por segmentos con veta real (sin estirar) y vidrio.
   Todo se mide en centímetros y se escala a píxeles al final. */
window.DSFrame = (() => {
  const CM = {
    frame: 2,            // ancho de moldura (chato y box)
    mat: 5,              // paspartú, igual en los 4 lados
    burlap: 5.5,         // arpillera visible alrededor de la foto
    burlapBg: 1,         // fondo visible entre flecos y marco
    fringe: [0.5, 1],    // largo de flecos (min, max)
    photoLong: 56,       // lado largo de la foto en la vista (referencia fija: la medida no cambia la imagen)
  };
  const TEX = {
    natural: "/assets/frames/wood-natural.jpg",
    negro: "/assets/frames/wood-black.jpg",
    blanco: "/assets/frames/wood-white.jpg",
    arpillera: "/assets/frames/arpillera.jpg",
  };
  const MAT = { blanco: "#f5f3ee", negro: "#1d1c1b" };
  const BG = { blanco: "#f2f0ea", negro: "#141313" };

  const cache = {};
  const loadImg = (src) => cache[src] || (cache[src] = new Promise((ok, ko) => {
    const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src;
  }));
  const preload = () => Promise.all(Object.values(TEX).map(loadImg));

  // textura girada 90° para los lados horizontales (la veta sigue el largo del listón)
  const rotCache = new Map();
  function rotated(img) {
    if (rotCache.has(img)) return rotCache.get(img);
    const c = document.createElement("canvas"); c.width = img.height; c.height = img.width;
    const x = c.getContext("2d"); x.translate(c.width, 0); x.rotate(Math.PI / 2); x.drawImage(img, 0, 0);
    rotCache.set(img, c); return c;
  }
  // números pseudoaleatorios estables (la imagen no "tiembla" entre redibujos)
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

  async function draw(canvas, photoSrc, opts) {
    const o = Object.assign({ tipo: "chato", color: "negro", terminacion: "paspartu-blanco", fondo: "negro" }, opts);
    const [photo, wood, burlapImg] = await Promise.all([loadImg(photoSrc), loadImg(TEX[o.color]), loadImg(TEX.arpillera)]);

    // ---- geometría en cm (la foto nunca se recorta ni se estira) ----
    const ratio = photo.naturalWidth / photo.naturalHeight;
    const pw = ratio >= 1 ? CM.photoLong : CM.photoLong * ratio;
    const ph = ratio >= 1 ? CM.photoLong / ratio : CM.photoLong;
    const inset = o.terminacion.startsWith("paspartu") ? CM.mat : o.terminacion === "arpillera" ? CM.burlap + CM.burlapBg : 0;
    const F = CM.frame;
    const W = pw + 2 * (inset + F), H = ph + 2 * (inset + F);
    const box = o.tipo === "box";

    // ---- lienzo cuadrado, el cuadro ocupa ~78% ----
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssSize = canvas.clientWidth || 600;
    canvas.width = Math.round(cssSize * dpr); canvas.height = canvas.width;
    const ctx = canvas.getContext("2d");
    const s = (canvas.width * 0.78) / Math.max(W, H);          // px por cm
    const X0 = (canvas.width - W * s) / 2, Y0 = (canvas.height - H * s) / 2 - s * 0.6;
    const R = (x, y, w, h) => [X0 + x * s, Y0 + y * s, w * s, h * s];

    // pared
    const g = ctx.createRadialGradient(canvas.width * .4, canvas.height * .3, 0, canvas.width * .5, canvas.height * .5, canvas.width * .8);
    g.addColorStop(0, "#fbfaf7"); g.addColorStop(1, "#ecebe6");
    ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);

    // sombra del cuadro sobre la pared: box más profundo que chato
    const depth = box ? 2.5 : 1.5;
    ctx.save();
    ctx.shadowColor = `rgba(40,32,24,${box ? .4 : .26})`;
    ctx.shadowBlur = depth * 1.1 * s; ctx.shadowOffsetX = depth * .22 * s; ctx.shadowOffsetY = depth * .5 * s;
    ctx.fillStyle = "#000"; ctx.fillRect(...R(0, 0, W, H));
    ctx.restore();
    ctx.save(); // sombra de contacto, corta y oscura
    ctx.shadowColor = "rgba(20,16,12,.35)"; ctx.shadowBlur = .35 * s; ctx.shadowOffsetY = .12 * s;
    ctx.fillStyle = "#000"; ctx.fillRect(...R(0, 0, W, H));
    ctx.restore();

    // ---- interior ----
    const ix = F, iy = F, iw = W - 2 * F, ih = H - 2 * F;   // hueco del marco
    const px = F + inset, py = F + inset;                   // foto
    ctx.save(); ctx.beginPath(); ctx.rect(...R(ix, iy, iw, ih)); ctx.clip();

    if (o.terminacion.startsWith("paspartu")) {
      const col = o.terminacion === "paspartu-negro" ? "negro" : "blanco";
      ctx.fillStyle = MAT[col]; ctx.fillRect(...R(ix, iy, iw, ih));
      matGrain(ctx, R(ix, iy, iw, ih), col === "negro" ? .05 : .035);
      ctx.drawImage(photo, ...R(px, py, pw, ph));
      bevel(ctx, s, X0 + px * s, Y0 + py * s, pw * s, ph * s, .22, col);
    } else if (o.terminacion === "arpillera") {
      ctx.fillStyle = BG[o.fondo]; ctx.fillRect(...R(ix, iy, iw, ih));
      ctx.drawImage(photo, ...R(px, py, pw, ph));
      burlap(ctx, s, burlapImg, {
        ox: X0 + (F + CM.burlapBg) * s, oy: Y0 + (F + CM.burlapBg) * s,
        ow: (iw - 2 * CM.burlapBg) * s, oh: (ih - 2 * CM.burlapBg) * s,
        wx: X0 + px * s, wy: Y0 + py * s, ww: pw * s, wh: ph * s,
      });
    } else {
      ctx.drawImage(photo, ...R(px, py, pw, ph));
    }

    // vidrio: reflejo casi imperceptible
    const gl = ctx.createLinearGradient(X0, Y0, X0 + W * s, Y0 + H * s);
    gl.addColorStop(0, "rgba(255,255,255,.07)"); gl.addColorStop(.45, "rgba(255,255,255,0)"); gl.addColorStop(1, "rgba(255,255,255,.03)");
    ctx.fillStyle = gl; ctx.fillRect(...R(ix, iy, iw, ih));

    // sombra que proyecta la moldura hacia adentro (más profunda en box)
    innerShadow(ctx, R(ix, iy, iw, ih), s, box ? 1.4 : .35, box ? .5 : .26);
    ctx.restore();

    // ---- marco por segmentos ----
    frame(ctx, s, wood, X0, Y0, W * s, H * s, F * s, o.color, box);
  }

  function matGrain(ctx, [x, y, w, h], a) {
    const r = rng(11); ctx.save(); ctx.globalAlpha = a;
    for (let i = 0; i < 900; i++) { ctx.fillStyle = r() > .5 ? "#fff" : "#000"; ctx.fillRect(x + r() * w, y + r() * h, 1, 1); }
    ctx.restore();
  }

  function bevel(ctx, s, x, y, w, h, cm, col) {
    const b = cm * s;
    const tones = col === "negro" ? ["#3a3836", "#2b2928", "#151413", "#0e0d0d"] : ["#ffffff", "#f8f6f2", "#dcd9d2", "#d2cfc8"];
    const quad = (pts, c) => { ctx.beginPath(); pts.forEach(([a, bb], i) => i ? ctx.lineTo(a, bb) : ctx.moveTo(a, bb)); ctx.closePath(); ctx.fillStyle = c; ctx.fill(); };
    quad([[x - b, y - b], [x + w + b, y - b], [x + w, y], [x, y]], tones[1]);         // arriba
    quad([[x - b, y - b], [x, y], [x, y + h], [x - b, y + h + b]], tones[0]);         // izquierda
    quad([[x + w + b, y - b], [x + w + b, y + h + b], [x + w, y + h], [x + w, y]], tones[2]); // derecha
    quad([[x - b, y + h + b], [x, y + h], [x + w, y + h], [x + w + b, y + h + b]], tones[3]); // abajo
  }

  function innerShadow(ctx, [x, y, w, h], s, cm, a) {
    const d = cm * s;
    const side = (x0, y0, x1, y1, rx, ry, rw, rh, k) => {
      const gr = ctx.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, `rgba(0,0,0,${a * k})`); gr.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gr; ctx.fillRect(rx, ry, rw, rh);
    };
    side(x, y, x, y + d, x, y, w, d, 1);            // arriba (luz de arriba-izquierda)
    side(x, y, x + d, y, x, y, d, h, .8);           // izquierda
    side(x + w, y, x + w - d * .6, y, x + w - d * .6, y, d * .6, h, .35);
    side(x, y + h, x, y + h - d * .5, x, y + h - d * .5, w, d * .5, .3);
  }

  function burlap(ctx, s, img, g) {
    const r = rng(42);
    const tile = 13 * s;   // la foto de textura cubre ~13 cm de arpillera
    const pat = ctx.createPattern(img, "repeat");
    pat.setTransform(new DOMMatrix().translate(g.ox, g.oy).scale(tile / img.width));
    // capa de arpillera en un lienzo aparte (para recortar la ventana y sombrear)
    const c = document.createElement("canvas"); c.width = ctx.canvas.width; c.height = ctx.canvas.height;
    const x = c.getContext("2d");
    x.fillStyle = pat;
    x.beginPath(); x.rect(g.ox, g.oy, g.ow, g.oh); x.rect(g.wx, g.wy, g.ww, g.wh); x.fill("evenodd");
    // relieve suave: los bordes de la tela un poco más oscuros
    const edge = x.createLinearGradient(0, 0, 0, 1);
    x.globalCompositeOperation = "source-atop";
    x.fillStyle = "rgba(60,40,20,.10)"; x.fillRect(g.ox, g.oy, g.ow, .25 * s); x.fillRect(g.ox, g.oy + g.oh - .25 * s, g.ow, .25 * s);
    x.fillRect(g.ox, g.oy, .25 * s, g.oh); x.fillRect(g.ox + g.ow - .25 * s, g.oy, .25 * s, g.oh);
    x.globalCompositeOperation = "source-over";

    // borde del tejido irregular (hilos transversales que se salieron)
    x.globalCompositeOperation = "destination-out";
    const notch = (x0, y0, len, nx, ny, tx, ty) => {
      for (let t = 0; t < len; t += .18 * s) {
        const d = r() * .45 * s;
        x.fillRect(Math.min(x0 + tx * t, x0 + tx * t + nx * d) - (nx ? 0 : .09 * s), Math.min(y0 + ty * t, y0 + ty * t + ny * d) - (ny ? 0 : .09 * s),
          nx ? Math.abs(d) + 1 : .18 * s, ny ? Math.abs(d) + 1 : .18 * s);
      }
    };
    notch(g.ox, g.oy, g.ow, 0, 1, 1, 0); notch(g.ox, g.oy + g.oh, g.ow, 0, -1, 1, 0);
    notch(g.ox, g.oy, g.oh, 1, 0, 0, 1); notch(g.ox + g.ow, g.oy, g.oh, -1, 0, 0, 1);
    x.globalCompositeOperation = "source-over";

    // flecos: hilos sueltos perpendiculares al borde
    const pitch = Math.max(1.2, .2 * s);             // separación entre hilos sueltos
    const thread = Math.max(1, .11 * s);
    const tones = ["#c9a374", "#b88f5f", "#d6b585", "#a98152", "#bf9867"];
    const fringe = (x0, y0, len, nx, ny, tx, ty, minL, maxL, keep) => {
      for (let t = 0; t < len; t += pitch * (0.7 + r() * .6)) {
        if (r() > keep) continue;
        const L = (minL + r() * (maxL - minL)) * s;
        const bx = x0 + tx * t, by = y0 + ty * t;
        const wob = (r() - .5) * .35;
        const lw = thread * (.6 + r() * .6);
        const sx = bx - nx * .5 * s, sy = by - ny * .5 * s;
        const cx = bx + nx * L * .5 + tx * wob * s * .5, cy = by + ny * L * .5 + ty * wob * s * .5;
        const ex = bx + nx * L + tx * wob * s, ey = by + ny * L + ty * wob * s;
        // sombra del hilo (da volumen) y el hilo
        x.strokeStyle = "rgba(40,25,10,.35)"; x.lineWidth = lw * 1.25;
        x.beginPath(); x.moveTo(sx + .03 * s, sy + .04 * s); x.quadraticCurveTo(cx + .03 * s, cy + .04 * s, ex + .03 * s, ey + .04 * s); x.stroke();
        x.strokeStyle = tones[(r() * tones.length) | 0]; x.lineWidth = lw;
        x.beginPath(); x.moveTo(sx, sy); x.quadraticCurveTo(cx, cy, ex, ey); x.stroke();
      }
    };
    const [a, b] = CM.fringe;
    // borde exterior: flecos hacia el fondo (0,5–1 cm)
    for (let pass = 0; pass < 2; pass++) {
      fringe(g.ox, g.oy, g.ow, 0, -1, 1, 0, a, b, .9);
      fringe(g.ox, g.oy + g.oh, g.ow, 0, 1, 1, 0, a, b, .9);
      fringe(g.ox, g.oy, g.oh, -1, 0, 0, 1, a, b, .9);
      fringe(g.ox + g.ow, g.oy, g.oh, 1, 0, 0, 1, a, b, .9);
    }
    // borde de la ventana: hilos cortos sobre la foto
    fringe(g.wx, g.wy, g.ww, 0, 1, 1, 0, .1, .3, .55);
    fringe(g.wx, g.wy + g.wh, g.ww, 0, -1, 1, 0, .1, .3, .55);
    fringe(g.wx, g.wy, g.wh, 1, 0, 0, 1, .1, .3, .55);
    fringe(g.wx + g.ww, g.wy, g.wh, -1, 0, 0, 1, .1, .3, .55);

    // se apoya encima de la foto: sombra suave hacia adentro
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = .3 * s; ctx.shadowOffsetX = .06 * s; ctx.shadowOffsetY = .1 * s;
    ctx.drawImage(c, 0, 0);
    ctx.restore();
  }

  function frame(ctx, s, wood, x, y, w, h, f, color, box) {
    const r = rng(color.length * 7 + (box ? 3 : 0));
    const k = f / wood.width;                     // la textura ocupa exactamente el ancho del listón
    const vert = ctx.createPattern(wood, "repeat");
    const horiz = ctx.createPattern(rotated(wood), "repeat");
    const sides = [
      { pts: [[x, y], [x + w, y], [x + w - f, y + f], [x + f, y + f]], pat: horiz, m: new DOMMatrix().translate(x + r() * 900, y).scale(k), shade: "rgba(255,255,255,.10)" },
      { pts: [[x, y + h], [x + f, y + h - f], [x + w - f, y + h - f], [x + w, y + h]], pat: horiz, m: new DOMMatrix().translate(x + r() * 900, y + h - f).scale(k), shade: "rgba(0,0,0,.16)" },
      { pts: [[x, y], [x + f, y + f], [x + f, y + h - f], [x, y + h]], pat: vert, m: new DOMMatrix().translate(x, y + r() * 900).scale(k), shade: "rgba(255,255,255,.04)" },
      { pts: [[x + w, y], [x + w, y + h], [x + w - f, y + h - f], [x + w - f, y + f]], pat: vert, m: new DOMMatrix().translate(x + w - f, y + r() * 900).scale(k), shade: "rgba(0,0,0,.10)" },
    ];
    const poly = (pts) => { ctx.beginPath(); pts.forEach(([a, b], i) => i ? ctx.lineTo(a, b) : ctx.moveTo(a, b)); ctx.closePath(); };
    for (const sd of sides) {
      sd.pat.setTransform(sd.m);
      poly(sd.pts); ctx.fillStyle = sd.pat; ctx.fill();
      ctx.fillStyle = sd.shade; ctx.fill();
    }
    const dark = color === "negro";
    // perfil: el box tiene la cara con un canto interior marcado (escalón), el chato es plano
    ctx.save(); poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]); ctx.clip();
    if (box) {
      const lip = f * .22;
      ctx.lineWidth = lip;
      ctx.strokeStyle = dark ? "rgba(255,255,255,.07)" : "rgba(0,0,0,.08)";
      ctx.strokeRect(x + f - lip / 2, y + f - lip / 2, w - 2 * f + lip, h - 2 * f + lip);
      ctx.lineWidth = Math.max(1, s * .05);
      ctx.strokeStyle = dark ? "rgba(255,255,255,.16)" : "rgba(0,0,0,.22)";
      ctx.strokeRect(x + f - lip, y + f - lip, w - 2 * f + 2 * lip, h - 2 * f + 2 * lip);
    }
    // ingletes
    ctx.lineWidth = Math.max(1, s * .03); ctx.strokeStyle = dark ? "rgba(255,255,255,.10)" : "rgba(0,0,0,.18)";
    [[x, y, x + f, y + f], [x + w, y, x + w - f, y + f], [x, y + h, x + f, y + h - f], [x + w, y + h, x + w - f, y + h - f]]
      .forEach(([a, b, c, d]) => { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); });
    // aristas: luz en el borde exterior superior/izq, sombra en el interior
    ctx.lineWidth = Math.max(1, s * .06);
    ctx.strokeStyle = dark ? "rgba(255,255,255,.14)" : "rgba(255,255,255,.45)";
    ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y); ctx.lineTo(x + w, y); ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,.28)";
    ctx.beginPath(); ctx.moveTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = Math.max(1, s * .04);
    ctx.strokeRect(x + f, y + f, w - 2 * f, h - 2 * f);
    ctx.restore();
  }

  return { draw, preload, CM };
})();
