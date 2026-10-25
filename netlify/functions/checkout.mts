import type { Config } from "@netlify/functions"
import { verificar as verificarPresupuesto } from "../lib/presupuesto.mts"
import { priceLines, sumLines, paquetes, huella, store } from "../lib/precios.mts"
import { verificar } from "../lib/firma.mts"
import { guardar, leer, type Pedido } from "../lib/pedidos.mts"

const txt = (s: unknown, n = 120) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n)

// Guarda el pedido y, si paga con Mercado Pago, crea el link de pago (precios y envío calculados acá).
export default async (req: Request) => {
  let body: any
  try { body = await req.json() } catch { return Response.json({ error: "Pedido inválido" }, { status: 400 }) }
  const pago = body.pago === "transferencia" ? "transferencia" : "mercadopago"
  const orden = txt(body.orderId, 40).replace(/[^A-Za-z0-9-]/g, "") || "DS-" + Date.now().toString(36).toUpperCase()
  const b = body.buyer || {}, a = body.address || {}
  const entrega = body.entrega === "retiro" ? "retiro" : "domicilio"

  let items: any[], productos = 0, tipo: Pedido["tipo"] = "catalogo", envioPrecio = 0, envio: Pedido["envio"] = null, descTransfer = true, detalle = ""
  if (body.presupuesto) {
    // pedido a medida: el monto sale del link firmado, nunca del navegador
    const p = verificarPresupuesto(body.presupuesto)
    if ("error" in p) return Response.json({ error: p.error }, { status: 400 })
    tipo = "medida"; descTransfer = p.descTransfer
    items = p.items.map((i, k) => ({ id: `${p.id}-${k + 1}`, title: `${i.cant} × ${i.desc}`.slice(0, 250), quantity: 1, unit_price: i.precio, currency_id: "ARS" }))
    productos = p.items.reduce((s, i) => s + i.precio, 0)
    envioPrecio = p.envio || 0
    detalle = p.items.map((i) => `${i.cant} × ${i.desc}`).join("\n")
  } else {
    const lines = priceLines(body.items)
    if (!lines.length) return Response.json({ error: "El carrito está vacío" }, { status: 400 })
    items = lines.map(({ size, name, ...l }) => l)
    productos = sumLines(lines)
    detalle = lines.map((l) => `${l.quantity} × ${l.title}`).join("\n")
    if (entrega === "domicilio" && body.envio) {
      const q = verificar("envio", body.envio)
      if (!q || q.h !== huella(lines)) return Response.json({ error: "El costo de envío venció o cambió el carrito. Volvé a calcularlo." }, { status: 400 })
      envioPrecio = q.op.precio
      envio = { opcion: q.op, items: paquetes(lines), declarado: productos }
    }
  }
  if (!items.length) return Response.json({ error: "El carrito está vacío" }, { status: 400 })
  if (envioPrecio) items.push({ id: `${orden}-envio`, title: envio ? `Envío (${envio.opcion.carrier})` : "Envío", quantity: 1, unit_price: envioPrecio, currency_id: "ARS" })

  const desc = pago === "transferencia" && descTransfer ? Math.round(productos * store.transferDiscount) : 0
  const pedido: Pedido = {
    orden, fecha: Date.now(), tipo, pago, estado: "esperando_pago", detalle, productos, envioPrecio, total: productos - desc + envioPrecio, entrega,
    dest: entrega === "domicilio" ? {
      nombre: txt(b.name, 80), dni: txt(b.dni, 15).replace(/\D/g, ""), email: txt(b.email, 120), telefono: txt(b.phone, 40),
      calle: txt(a.calle, 80), numero: txt(a.numero, 10), depto: txt(a.depto, 40), cp: txt(a.cp, 8), ciudad: txt(a.ciudad, 80), provincia: txt(a.provincia, 40),
    } : undefined,
    envio,
  }
  try {
    const prev = await leer(orden)
    if (!prev || prev.estado === "esperando_pago") await guardar(pedido)
  } catch (e) { console.error("guardar pedido", e) }

  if (pago === "transferencia") return Response.json({ mode: "transfer", total: pedido.total })

  const token = Netlify.env.get("MP_ACCESS_TOKEN")
  if (!token) return Response.json({ mode: "manual" })
  const origin = new URL(req.url).origin
  const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      items,
      payer: b.email ? { name: txt(b.name, 80), email: txt(b.email, 120) } : undefined,
      external_reference: orden,
      notification_url: `${origin}/api/mp-aviso`,
      payment_methods: { installments: store.maxInstallments },
      back_urls: {
        success: `${origin}/gracias.html?estado=ok`,
        pending: `${origin}/gracias.html?estado=pendiente`,
        failure: `${origin}/gracias.html?estado=error`,
      },
      auto_return: "approved",
      statement_descriptor: "DESIGN STUDIO",
    }),
  })
  if (!res.ok) {
    console.error("Mercado Pago error", res.status, await res.text())
    return Response.json({ error: "No pudimos iniciar el pago con Mercado Pago" }, { status: 502 })
  }
  const pref = await res.json()
  return Response.json({ mode: "mercadopago", url: pref.init_point })
}

export const config: Config = { path: "/api/checkout", method: "POST" }
