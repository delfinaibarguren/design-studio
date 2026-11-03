// Panel de gestión: pedidos de presupuesto (Enmarcado a medida) con estados, presupuesto, imprenta y WhatsApp.
(() => {
  const $ = (id) => document.getElementById(id);
  const money = (n) => "$" + Math.round(n || 0).toLocaleString("es-AR");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const EST = { nuevo: "Nuevo", presupuestado: "Presupuesto enviado", aceptado: "Aceptado / pagado", imprenta: "En imprenta", armado: "En armado", listo: "Listo", entregado: "Entregado", descartado: "Descartado" };
  const PROD = ["aceptado", "imprenta", "armado"];
  // número argentino → formato de WhatsApp (549 + área + número, sin 0 ni 15)
  const wa = (tel) => {
    let n = String(tel || "").replace(/\D/g, "").replace(/^0/, "");
    if (n.startsWith("549")) n = n.slice(3); else if (n.startsWith("54")) n = n.slice(2);
    if (n.length === 12) { const k = [2, 3, 4].find((i) => n.slice(i, i + 2) === "15"); if (k) n = n.slice(0, k) + n.slice(k + 2); }
    return n.length >= 8 ? "549" + n : "";
  };
  const waLink = (tel, msg) => `https://wa.me/${wa(tel)}?text=${encodeURIComponent(msg)}`;
  let api, CON = [], filtro = "activos";

  const queTxt = (c) => c.que === "Obra de Dsgn. Studio" ? `la obra ${c.obra || ""}`.trim() : (c.objeto || "tu pedido").toLowerCase();
  const msgCliente = (c) => {
    const nom = (c.nombre || "").split(" ")[0];
    switch (c.estado) {
      case "nuevo": return `Hola ${nom}! Te escribo de Design Studio por tu pedido de presupuesto para enmarcar ${queTxt(c)}. `;
      case "presupuestado": return `Hola ${nom}! ¿Pudiste ver el presupuesto que te pasé? Cualquier duda te ayudo.${c.presupuesto ? " Te dejo el link de nuevo: " + c.presupuesto.url : ""}`;
      case "aceptado": case "imprenta": case "armado": return `Hola ${nom}! Te cuento que tu pedido ya está en producción. Te aviso apenas esté listo.`;
      case "listo": return `Hola ${nom}! Tu cuadro ya está listo 🙌 ¿Coordinamos la entrega o el retiro por el taller en Del Viso, Pilar?`;
      case "entregado": return `Hola ${nom}! ¿Cómo quedó el cuadro? Si te gustó, nos ayudaría muchísimo una reseña o una foto en tu casa 🤍`;
      default: return `Hola ${nom}! `;
    }
  };

  function card(c) {
    const f = new Date(c.fecha).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    const fotos = [...c.fotos.map((x) => `<a href="${esc(x.url)}?descargar" target="_blank" rel="noopener" title="Descargar ${esc(x.nombre)}"><img src="${esc(x.url)}" alt="${esc(x.nombre)}" loading="lazy" onerror="this.replaceWith('Descargar')"></a>`),
      ...(c.fotosForm || []).map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener">Copia ${i + 1}</a>`)].join("");
    const acts = [
      `<a class="btn btn-dark" href="/presupuestos.html?c=${encodeURIComponent(c.id)}">${c.presupuesto ? "Rehacer presupuesto" : "Armar presupuesto"}</a>`,
      c.whatsapp ? `<a class="btn btn-outline" href="${esc(waLink(c.whatsapp, msgCliente(c)))}" target="_blank" rel="noopener">WhatsApp al cliente</a>` : "",
      c.estado === "descartado" ? `<button class="btn btn-outline" data-borrar="${esc(c.id)}">Eliminar</button>` : "",
    ].join("");
    return `<div class="ped" data-id="${esc(c.id)}">
      <div class="ped-top"><h3>${esc(c.nombre || "(sin nombre)")} · ${esc(c.que === "Obra de Dsgn. Studio" ? "Obra: " + (c.obra || "-") : c.objeto || "Algo suyo")}</h3><small>${f} · ${esc(c.id)}</small></div>
      <div class="chips"><span class="chip e-${c.estado}">${EST[c.estado] || c.estado}</span>${c.presupuesto ? `<span class="chip">Presupuesto ${money(c.presupuesto.total)} · <a href="${esc(c.presupuesto.url)}" target="_blank" rel="noopener">ver</a></span>` : ""}</div>
      ${c.medidas ? `<pre>${esc(c.medidas)}</pre>` : ""}
      ${c.comentarios ? `<pre>“${esc(c.comentarios)}”</pre>` : ""}
      ${fotos ? `<div class="fotos">${fotos}</div>` : ""}
      <div class="row2"><div><b>WhatsApp:</b> ${esc(c.whatsapp || "-")}</div>${c.email ? `<div><b>Email:</b> ${esc(c.email)}</div>` : ""}${c.entrega ? `<div><b>Entrega:</b> ${esc(c.entrega === "Retiro por el taller" ? "Retira por el taller" : `Envío · CP ${c.cp || "-"} · ${[c.localidad, c.provincia].filter(Boolean).join(", ")}`)}</div>` : ""}</div>
      <div class="est">Estado: <select data-est="${esc(c.id)}">${Object.entries(EST).map(([k, v]) => `<option value="${k}"${c.estado === k ? " selected" : ""}>${v}</option>`).join("")}</select></div>
      <div class="nota"><textarea data-nota="${esc(c.id)}" placeholder="Notas internas (marco elegido, fecha de entrega, lo que hablaron…)">${esc(c.nota || "")}</textarea></div>
      <div class="acts">${acts}</div>
    </div>`;
  }
  const pasa = (c) => filtro === "activos" ? !["entregado", "descartado"].includes(c.estado) : filtro === "prod" ? PROD.includes(c.estado) : c.estado === filtro;
  function draw() {
    const l = CON.filter(pasa);
    $("pzList").innerHTML = l.length ? l.map(card).join("") : `<p class="sub">No hay pedidos ${filtro === "activos" ? "activos" : "en esta categoría"}.</p>`;
    const n = CON.filter((c) => c.estado === "nuevo").length; $("nNuevos").textContent = n; $("nNuevos").hidden = !n;
  }
  const upd = (c) => { const i = CON.findIndex((x) => x.id === c.id); if (i >= 0) CON[i] = c; else CON.unshift(c); draw(); };

  $("pzFilt").onclick = (e) => { const b = e.target.closest("[data-f]"); if (!b) return; filtro = b.dataset.f; [...$("pzFilt").children].forEach((x) => x.classList.toggle("on", x === b)); draw(); };
  $("pzList").onchange = async (e) => {
    const s = e.target.closest("[data-est]"); if (!s) return;
    try { upd((await api("consulta", { id: s.dataset.est, estado: s.value })).consulta); } catch (x) { alert(x.message); }
  };
  $("pzList").addEventListener("focusout", async (e) => {
    const t = e.target.closest("[data-nota]"); if (!t) return;
    const c = CON.find((x) => x.id === t.dataset.nota); if (!c || (c.nota || "") === t.value) return;
    try { const d = await api("consulta", { id: c.id, nota: t.value }); Object.assign(c, d.consulta); } catch (x) { alert(x.message); }
  });
  $("pzList").onclick = async (e) => {
    const b = e.target.closest("[data-borrar]"); if (!b || !confirm("¿Eliminar definitivamente este pedido?")) return;
    try { await api("consulta_borrar", { id: b.dataset.borrar }); CON = CON.filter((c) => c.id !== b.dataset.borrar); draw(); } catch (x) { alert(x.message); }
  };
  $("pzImp").onclick = async () => {
    const b = $("pzImp"); b.disabled = true; b.textContent = "Buscando…";
    try { const d = await api("importar"); CON = d.consultas || CON; draw(); alert(d.importados ? `Listo: se agregaron ${d.importados} pedido(s).` : "No había pedidos nuevos para traer."); }
    catch (x) { alert(x.message); } finally { b.disabled = false; b.textContent = "Traer pedidos anteriores"; }
  };
  $("pzAdd").onclick = () => { $("pzNew").hidden = !$("pzNew").hidden; };
  $("nGo").onclick = async () => {
    if (!$("nNom").value.trim()) return alert("Poné al menos el nombre");
    try { upd((await api("consulta_nueva", { nombre: $("nNom").value, whatsapp: $("nTel").value, objeto: $("nObj").value, medidas: $("nMed").value })).consulta);
      ["nNom", "nTel", "nObj", "nMed"].forEach((k) => ($(k).value = "")); $("pzNew").hidden = true; } catch (x) { alert(x.message); }
  };
  $("tabs").onclick = (e) => {
    const b = e.target.closest("[data-t]"); if (!b) return;
    [...$("tabs").children].forEach((x) => x.classList.toggle("on", x === b));
    $("pz").hidden = b.dataset.t !== "pz"; $("panel").hidden = b.dataset.t !== "web";
    try { localStorage.setItem("ds-tab", b.dataset.t); } catch {}
  };

  window.DSG = {
    async start(a) {
      api = a; $("tabs").hidden = false;
      let t = "pz"; try { t = localStorage.getItem("ds-tab") || "pz"; } catch {}
      $("tabs").querySelector(`[data-t="${t}"]`).click();
      try { CON = (await api("consultas")).consultas || []; draw(); } catch (x) { $("pzList").innerHTML = `<p class="q-err">${esc(x.message)}</p>`; }
    },
  };
})();
