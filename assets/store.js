/* Design Studio — núcleo compartido de la tienda (catálogo, carrito, encabezado, pie) */
window.DS = (() => {
  const CART_KEY = "ds-cart-v2";
  let catalog = null;

  const money = (n) => "$" + Math.round(n).toLocaleString("es-AR");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  async function load() {
    if (catalog) return catalog;
    const r = await fetch("/catalog.json", { cache: "no-cache" });
    catalog = await r.json();
    return catalog;
  }
  const product = (id) => catalog.products.find((p) => p.id === id);
  const size = (id) => catalog.sizes.find((s) => s.id === id);
  const frame = (id) => catalog.frames.find((f) => f.id === id);
  const category = (id) => catalog.categories.find((c) => c.id === id);
  const fromPrice = (p) => {
    if (p && p.photo) return Math.min(...catalog.sizes.map((s) => s.marco)) + Math.min(0, ...(catalog.frameTypes || []).map((t) => t.extra || 0));
    const fin = p && p.styles ? [...new Set(p.styles.map((x) => x.finish))] : ["lamina", "marco"];
    return Math.min(...catalog.sizes.flatMap((s) => fin.map((f) => s[f])));
  };

  const style = (p, id) => (p && p.styles ? p.styles.find((s) => s.id === id) || p.styles[0] : null);
  function finishOf(line) {
    if (product(line.productId)?.photo) return "marco";
    const st = style(product(line.productId), line.style);
    return st ? st.finish : line.finish;
  }
  function sizeLabel(p, s) {
    return s.label;
  }
  function unitPrice(line) {
    const s = size(line.size);
    if (!s) return 0;
    const base = finishOf(line) === "marco" ? s.marco : s.lamina;
    return base + (frameType(line.tipo)?.extra || 0);
  }
  function frameType(id) {
    const list = catalog.frameTypes || [];
    return list.find((t) => t.id === id) || null;
  }
  function variantText(line) {
    const p = product(line.productId), s = size(line.size);
    if (p && p.photo) {
      const lab = (list, id) => (catalog[list] || []).find((x) => x.id === id)?.label || "";
      const ft = frameType(line.tipo);
      const arp = line.terminacion === "arpillera" ? ` (fondo ${lab("fondos", line.fondo).toLowerCase()})` : "";
      return `${s.label} · Marco ${ft ? ft.label.toLowerCase() + " " : ""}${lab("frameColors", line.color).toLowerCase()} · ${lab("terminaciones", line.terminacion)}${arp}`;
    }
    const st = style(p, line.style);
    const ft = frameType(line.tipo);
    if (st) return `${sizeLabel(p, s)}${ft ? ` · Tipo ${ft.label.toLowerCase()}` : ""} · ${st.label}`;
    if (line.finish !== "marco") return `${sizeLabel(p, s)} · Solo lámina`;
    return `${sizeLabel(p, s)} · Marco ${frame(line.frame).label.toLowerCase()}`;
  }
  function instText(price) {
    const st = catalog.store;
    if (st.interestFree && price >= (st.interestFreeMin || 0)) return `${st.interestFree} cuotas sin interés de ${money(price / st.interestFree)}`;
    return `Hasta ${st.maxInstallments} cuotas con Mercado Pago`;
  }
  const lineKey = (l) => [l.productId, l.size, l.tipo || "", l.color || "", l.terminacion || "", l.terminacion === "arpillera" ? l.fondo : "", l.style || l.finish, !l.style && l.finish === "marco" ? l.frame : ""].join("|");

  /* ---------- Carrito ---------- */
  function getCart() {
    try {
      const c = JSON.parse(localStorage.getItem(CART_KEY)) || [];
      return c.filter((l) => product(l.productId) && size(l.size) && (!product(l.productId).photo || (l.color && l.terminacion)));
    } catch { return []; }
  }
  function setCart(c) {
    try { localStorage.setItem(CART_KEY, JSON.stringify(c)); } catch {}
    renderCart();
  }
  function addToCart(line) {
    const c = getCart();
    const key = lineKey(line);
    const ex = c.find((l) => lineKey(l) === key);
    if (ex) ex.qty = Math.min(10, ex.qty + line.qty);
    else c.push({ ...line, frame: line.finish === "marco" ? line.frame : null });
    setCart(c);
  }
  const cartTotal = (c = getCart()) => c.reduce((s, l) => s + unitPrice(l) * l.qty, 0);
  const cartCount = (c = getCart()) => c.reduce((s, l) => s + l.qty, 0);

  /* ---------- Obras de muestra (SVG). Si la obra tiene fotos en "images", se usan esas. ---------- */
  function rand(seed) {
    let s = 0; for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }
  function artSVG(p) {
    const { bg, palette: c, style } = p.art || { bg: "#eee", palette: ["#999", "#bbb", "#ddd", "#fff"], style: "bands" };
    const r = rand(p.id);
    let g = "";
    if (style === "bands") {
      let y = 0;
      for (let i = 0; i < 7; i++) { const h = 10 + r() * 22; g += `<path d="M0 ${y + h} Q 25 ${y + h - 8 - r() * 8} 50 ${y + h} T 100 ${y + h} V 130 H0Z" fill="${c[i % 4]}" opacity="${0.75 + r() * 0.25}"/>`; y += h * 0.7; }
    } else if (style === "circles") {
      g += `<rect y="70" width="100" height="60" fill="${c[2]}"/><circle cx="38" cy="58" r="30" fill="${c[0]}"/><circle cx="66" cy="78" r="20" fill="${c[1]}"/><circle cx="70" cy="34" r="8" fill="${c[2]}"/>`;
    } else if (style === "leaves") {
      for (let i = 0; i < 9; i++) { const x = 10 + r() * 80, y = 15 + r() * 100, a = r() * 180, s = 0.6 + r() * 0.8; g += `<path transform="translate(${x} ${y}) rotate(${a}) scale(${s})" d="M0 -22 C 14 -10 14 10 0 22 C -14 10 -14 -10 0 -22Z" fill="${c[i % 3]}"/>`; }
    } else if (style === "lines") {
      for (let i = 0; i < 18; i++) { const y = 30 + i * 4.2; g += `<path d="M0 ${y} Q 30 ${y - 6 + r() * 12} 60 ${y} T 100 ${y}" stroke="${i === 9 ? c[1] : c[0]}" stroke-width="${i === 9 ? 1.4 : 0.5}" fill="none"/>`; }
      g += `<circle cx="72" cy="20" r="7" fill="${c[1]}"/>`;
    } else if (style === "sky") {
      g += `<circle cx="70" cy="34" r="15" fill="${c[0]}"/>`;
      for (let i = 0; i < 4; i++) { g += `<rect x="${r() * 70}" y="${60 + i * 15}" rx="6" width="${30 + r() * 30}" height="10" fill="${c[1]}" opacity=".9"/>`; }
      g += `<rect y="112" width="100" height="18" fill="${c[3]}"/>`;
    } else if (style === "arches") {
      g += `<path d="M10 130 V60 A22 22 0 0 1 54 60 V130Z" fill="${c[0]}"/><path d="M46 130 V78 A20 20 0 0 1 86 78 V130Z" fill="${c[1]}"/><rect x="20" y="18" width="22" height="22" fill="${c[2]}"/><circle cx="74" cy="32" r="9" fill="${c[0]}"/>`;
    } else if (style === "mountains") {
      g += `<circle cx="64" cy="44" r="12" fill="${c[2]}"/><path d="M0 92 L28 54 L52 84 L74 60 L100 90 V130 H0Z" fill="${c[1]}"/><path d="M0 108 L22 82 L48 104 L80 78 L100 98 V130 H0Z" fill="${c[0]}"/>`;
    } else if (style === "steps") {
      g += `<rect x="0" y="0" width="100" height="130" fill="${c[3]}"/><path d="M0 130 V100 H20 V88 H40 V76 H60 V64 H100 V130Z" fill="${c[1]}"/><path d="M0 130 V112 H20 V100 H40 V88 H60 V76 H100 V130Z" fill="${c[2]}" opacity=".6"/><rect x="66" y="22" width="22" height="42" rx="11" fill="${c[0]}"/>`;
    }
    return `<svg viewBox="0 0 100 130" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${esc(p.name)}"><rect width="100" height="130" fill="${bg}"/>${g}</svg>`;
  }
  /* Obra enmarcada. opts: { finish, frame, size, img } */
  function framed(p, opts = {}) {
    if (p.photo) {
      const o = Object.assign({ tipo: (catalog.frameTypes || [])[0]?.id || "chato", color: "negro", terminacion: "paspartu-blanco", fondo: "negro" }, p.defaults || {}, opts);
      return `<canvas class="cfg" role="img" aria-label="${esc(p.name)}" data-photo="${esc(p.photo)}" data-tipo="${esc(o.tipo)}" data-color="${esc(o.color)}" data-terminacion="${esc(o.terminacion)}" data-fondo="${esc(o.fondo)}"></canvas>`;
    }
    if (p.styles) {
      const st = style(p, opts.style);
      return `<img class="photo" src="${esc(st.images[opts.img || 0])}" alt="${esc(p.name)} — ${esc(st.label)}" loading="lazy">`;
    }
    const finish = opts.finish || "marco";
    const fr = frame(opts.frame || "negro");
    const s = size(opts.size) || catalog.sizes[0];
    const ratio = p.orientation === "horizontal" ? `${s.h}/${s.w}` : `${s.w}/${s.h}`;
    const img = p.images && p.images.length ? p.images[opts.img || 0] : null;
    const inner = img ? `<img src="${esc(img)}" alt="${esc(p.name)}" loading="lazy">` : artSVG(p);
    if (finish !== "marco") return `<div class="framed print" style="--ratio:${ratio}"><div class="canvas">${inner}</div></div>`;
    return `<div class="framed" style="--ratio:${ratio};--frame:${fr.color}" data-light="${fr.id === "blanco"}"><div class="mat"><div class="canvas">${inner}</div></div></div>`;
  }

  /* ---------- Encabezado, carrito lateral y pie ---------- */
  function chrome() {
    const st = catalog.store;
    const cats = catalog.categories.filter((c) => catalog.products.some((p) => p.category === c.id)).map((c) => `<a href="/?categoria=${c.id}#obras">${esc(c.label)}</a>`).join("");
    const head = document.getElementById("ds-header");
    if (head) head.outerHTML = `
      ${st.announcement ? `<div class="announce">${esc(st.announcement)}</div>` : ""}
      <header class="topbar">
        <button class="icon-btn menu-btn" id="menuBtn" aria-label="Abrir menú"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 7h18M3 12h18M3 17h18" stroke="currentColor" stroke-width="1.6"/></svg></button>
        <a href="/" class="brand brand-logo"><img src="/assets/logo.png" alt="Dsgn. Studio" width="354" height="160"></a>
        <nav class="nav" id="nav">
          <a href="/">Inicio</a>
          <div class="dropdown"><a href="/#colecciones">Colecciones ▾</a><div class="dropdown-menu">${catalog.categories.map((c) => `<a href="/coleccion.html?c=${c.id}">${esc(c.label)}</a>`).join("")}</div></div>
          <a href="/ayuda.html#envios">Envíos</a>
          <a href="http://wa.link/vp5yn9" target="_blank" rel="noopener">Contacto</a>
          <a href="/enmarcado-a-medida.html" class="nav-strong">Enmarcado a medida</a>
        </nav>
        <button class="icon-btn cart-btn" id="openCart" aria-label="Abrir carrito">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 7h14l-1.2 12.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8L5 7Z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9 7V6a3 3 0 0 1 6 0v1" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>
          <span class="cart-count" id="cartCount" data-zero>0</span>
        </button>
      </header>
      <div class="scrim" id="scrim" hidden></div>
      <aside class="drawer" id="cart" aria-label="Carrito" aria-hidden="true">
        <div class="drawer-head"><h2>Carrito de compras</h2><button class="icon-btn" id="closeCart" aria-label="Cerrar">✕</button></div>
        <div class="drawer-body" id="cartBody"></div>
        <div class="drawer-foot" id="cartFoot">
          <div class="row"><span>Subtotal <small>(sin envío)</small></span><strong id="cartTotal">$0</strong></div>
          <p class="muted small" id="cartTransfer"></p>
          <a class="btn btn-dark btn-block" href="/checkout.html">Iniciar compra</a>
          <button class="btn-link" id="keepShopping">Ver más productos</button>
        </div>
      </aside>
      <div class="toast" id="toast" role="status" aria-live="polite"></div>`;

    const foot = document.getElementById("ds-footer");
    if (foot) foot.outerHTML = `
      <footer class="footer2">
        <a href="/" class="footer2-logo"><img src="/assets/logo.png" alt="Dsgn. Studio" width="354" height="160"></a>
        <div class="footer2-cols">
          <div><h4>Categorías</h4><a href="/">Inicio</a><a href="/ayuda.html#envios">Envíos</a><a href="http://wa.link/vp5yn9" target="_blank" rel="noopener">Contacto</a><a href="/enmarcado-a-medida.html">Enmarcado a medida</a></div>
          <div><h4>Ayuda</h4><a href="/ayuda.html">Preguntas frecuentes</a><a href="/ayuda.html#devoluciones">Política de devolución</a><a href="/ayuda.html#compra">Cómo comprar</a></div>
          <div><h4>Contacto</h4><a href="http://wa.link/vp5yn9" target="_blank" rel="noopener">Whatsapp</a><a href="https://www.instagram.com/_designstu?psln=MThpOHZrcGxvcGh1Mg%3D%3D&amp;utm_source=qr" target="_blank" rel="noopener">Instagram</a><a href="mailto:designstudioenmarcados@gmail.com">designstudioenmarcados@gmail.com</a><span>Buenos Aires, Argentina</span></div>
        </div>
        <div class="footer2-bottom"><span>© ${new Date().getFullYear()} Dsgn. Studio</span><a href="http://wa.link/vp5yn9" target="_blank" rel="noopener">Botón de arrepentimiento</a></div>
      </footer>
      ${st.whatsapp ? `<a class="wa-float" href="https://wa.me/${esc(st.whatsapp)}" target="_blank" rel="noopener" aria-label="WhatsApp"><svg viewBox="0 0 32 32" width="28" height="28"><path fill="#fff" d="M16 3a13 13 0 0 0-11.2 19.6L3 29l6.6-1.7A13 13 0 1 0 16 3Zm0 23.6a10.6 10.6 0 0 1-5.4-1.5l-.4-.2-3.9 1 1-3.8-.3-.4A10.6 10.6 0 1 1 16 26.6Zm5.8-7.9c-.3-.2-1.9-.9-2.2-1s-.5-.2-.7.2-.8 1-1 1.2-.4.2-.7.1a8.7 8.7 0 0 1-4.3-3.8c-.3-.6.3-.5 1-1.7.1-.2 0-.4 0-.5l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6a1.2 1.2 0 0 0-.8.4 3.5 3.5 0 0 0-1.1 2.6 6 6 0 0 0 1.3 3.2 13.8 13.8 0 0 0 5.3 4.7c2 .8 2.7.9 3.7.8a3.1 3.1 0 0 0 2.1-1.5 2.6 2.6 0 0 0 .2-1.5c-.1-.1-.3-.2-.6-.3Z"/></svg></a>` : ""}`;

    const cartEl = document.getElementById("cart"), scrim = document.getElementById("scrim");
    document.getElementById("openCart").onclick = openCart;
    document.getElementById("closeCart").onclick = closeCart;
    document.getElementById("keepShopping").onclick = closeCart;
    scrim.onclick = () => { closeCart(); document.getElementById("nav").classList.remove("open"); };
    document.getElementById("menuBtn").onclick = () => document.getElementById("nav").classList.toggle("open");
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeCart(); });
    cartEl.addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]"); if (!b) return;
      const c = getCart(); const l = c[Number(b.dataset.i)]; if (!l) return;
      if (b.dataset.act === "inc") l.qty = Math.min(10, l.qty + 1);
      if (b.dataset.act === "dec") l.qty -= 1;
      if (b.dataset.act === "rm") l.qty = 0;
      setCart(c.filter((x) => x.qty > 0));
    });
    const nf = document.getElementById("newsForm");
    if (nf) nf.addEventListener("submit", async (e) => {
      e.preventDefault();
      try { await submitForm("novedades", new FormData(nf)); nf.hidden = true; document.getElementById("newsOk").hidden = false; }
      catch { toast("No pudimos suscribirte, probá de nuevo."); }
    });
    renderCart();
  }
  function openCart() {
    const el = document.getElementById("cart");
    el.classList.add("open"); el.setAttribute("aria-hidden", "false");
    document.getElementById("scrim").hidden = false;
  }
  function closeCart() {
    const el = document.getElementById("cart"); if (!el) return;
    el.classList.remove("open"); el.setAttribute("aria-hidden", "true");
    document.getElementById("scrim").hidden = true;
  }
  function renderCart() {
    const body = document.getElementById("cartBody"); if (!body) return;
    const c = getCart();
    const badge = document.getElementById("cartCount");
    badge.textContent = cartCount(c);
    cartCount(c) ? badge.removeAttribute("data-zero") : badge.setAttribute("data-zero", "");
    document.getElementById("cartFoot").hidden = !c.length;
    if (!c.length) { body.innerHTML = `<p class="empty">El carrito de compras está vacío.</p>`; return; }
    body.innerHTML = c.map((l, i) => {
      const p = product(l.productId);
      return `<div class="line">
        <a href="/producto.html?id=${p.id}" class="line-thumb">${framed(p, l)}</a>
        <div class="line-info"><a href="/producto.html?id=${p.id}"><h4>${esc(p.name)}</h4></a><small>${esc(variantText(l))}</small>
          <div class="qty"><button data-act="dec" data-i="${i}" aria-label="Restar">−</button><span>${l.qty}</span><button data-act="inc" data-i="${i}" aria-label="Sumar">+</button></div></div>
        <div class="line-right"><strong>${money(unitPrice(l) * l.qty)}</strong><button class="btn-link small" data-act="rm" data-i="${i}">Borrar</button></div>
      </div>`;
    }).join("");
    const t = cartTotal(c);
    document.getElementById("cartTotal").textContent = money(t);
    document.getElementById("cartTransfer").textContent = catalog.store.transferDiscount
      ? `O ${money(t * (1 - catalog.store.transferDiscount))} pagando con transferencia` : "";
  }

  async function submitForm(name, fd) {
    fd.set("form-name", name);
    const r = await fetch("/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fd).toString() });
    if (!r.ok) throw new Error("form " + r.status);
  }

  let tt;
  function toast(msg) {
    const el = document.getElementById("toast"); if (!el) return;
    el.textContent = msg; el.classList.add("show");
    clearTimeout(tt); tt = setTimeout(() => el.classList.remove("show"), 2600);
  }

  function productCard(p) {
    return `<a class="card" href="/producto.html?id=${p.id}">
        <div class="card-wall${p.styles || p.photo ? " photo" : ""}">${framed(p, { frame: "negro" })}</div>
        <h3>${esc(p.name)}</h3>
        <div class="from"><small>Desde</small> ${money(fromPrice(p))}</div>
        <div class="inst">${catalog.store.interestFree} cuotas sin interés · ${Math.round(catalog.store.transferDiscount * 100)}% OFF por transferencia</div>
      </a>`;
  }
  function collectionCard(col) {
    const items = catalog.products.filter((p) => p.category === col.id);
    const cover = items[0];
    const img = col.cover ? `<img class="photo" src="${esc(col.cover)}" alt="" loading="lazy">` : cover ? framed(cover) : `<span class="soon">Próximamente</span>`;
    return `<a class="col-card" href="/coleccion.html?c=${col.id}">
        <div class="col-img">${img}</div>
        <div class="col-meta"><h3><span>Colección</span> ${esc(col.label)}</h3><small>${items.length ? items.length + (items.length === 1 ? " obra" : " obras") : "Próximamente"}</small></div>
      </a>`;
  }

  /* Dibuja todos los cuadros configurables (<canvas class="cfg">) que aparezcan en la página */
  let cfgReady = null;
  function loadCfg() {
    if (window.DSFrame) return Promise.resolve();
    return cfgReady || (cfgReady = new Promise((ok) => { const sc = document.createElement("script"); sc.src = "/assets/configurador.js"; sc.onload = ok; document.head.appendChild(sc); }));
  }
  async function hydrate(root = document) {
    const list = [...root.querySelectorAll("canvas.cfg:not([data-done])")];
    if (!list.length) return;
    await loadCfg();
    for (const cv of list) { cv.dataset.done = "1"; DSFrame.draw(cv, cv.dataset.photo, { ...cv.dataset }).catch(() => {}); }
  }
  async function init() {
    await load(); chrome();
    new MutationObserver(() => hydrate()).observe(document.body, { childList: true, subtree: true });
    hydrate();
    return catalog;
  }

  return { init, load, money, esc, product, size, frame, category, fromPrice, frameType, productCard, collectionCard, unitPrice, instText, style, sizeLabel, variantText,
    getCart, setCart, addToCart, hydrate, loadCfg, cartTotal, framed, openCart, closeCart, toast, submitForm, get catalog() { return catalog; } };
})();
