import type { Config } from "@netlify/functions"
import { precioItem, calculable, plazo, type ItemMedida } from "../lib/medida.mts"
import { firmar, type Item } from "../lib/presupuesto.mts"
import { configurado, cotizar } from "../lib/zipnova.mts"
import { bonificacion } from "../lib/precios.mts"

// Enmarcado a medida con precio automático: valida, calcula el precio (y el envío) y devuelve un link de pago firmado.
const clean = (s: unknown, n = 200) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n)

export default async (req: Request) => {
  let b: any
  try { b = await req.json() } catch { return Response.json({ error: "Pedido inválido" }, { status: 400 }) }
  if (!calculable(clean(b.que, 40), clean(b.objeto, 60))) return Response.json({ error: "Este pedido necesita presupuesto" }, { status: 400 })
  const raw: ItemMedida[] = Array.isArray(b.items) ? b.items.slice(0, 20) : []
  const items: Item[] = [], paquetes: any[] = []
  for (const it of raw) {
    const p = precioItem(it); if (!p) return Response.json({ error: "Revisá las opciones de cada cuadro" }, { status: 400 })
    const cant = Math.max(1, Math.min(20, Math.floor(Number(it.cant) || 1)))
    items.push({ desc: (b.que === "Obra de Dsgn. Studio" ? `Obra "${clean(b.obra, 60)}" · ` : "") + p.desc, cant, precio: p.unit * cant })
    for (let k = 0; k < cant; k++) paquetes.push({ weight: p.paquete.peso, height: p.paquete.alto, width: p.paquete.ancho, length: p.paquete.largo, description: "Cuadro a medida", classification_id: 1 })
  }
  if (!items.length) return Response.json({ error: "Armá al menos un cuadro" }, { status: 400 })
  const productos = items.reduce((s, i) => s + i.precio, 0)

  // envío: si es a domicilio se cotiza con Zipnova (con la misma bonificación que la tienda)
  let envio = 0, envioTxt = ""
  if (b.entrega !== "Retiro por el taller") {
    const cp = clean(b.cp, 8).replace(/\D/g, "").slice(0, 4), ciudad = clean(b.ciudad, 80), provincia = clean(b.provincia, 40)
    if (cp.length !== 4 || !ciudad || !provincia) return Response.json({ error: "Completá código postal, localidad y provincia" }, { status: 400 })
    if (configurado()) {
      try {
        const op = await cotizar({ cp, ciudad, provincia }, paquetes, productos)
        if (op) { envio = Math.max(0, op.precio - bonificacion(productos, op.precio, cp, provincia)); envioTxt = envio ? "" : "Envío gratis." }
        else envioTxt = "Envío a coordinar."
      } catch { envioTxt = "Envío a coordinar." }
    } else envioTxt = "Envío a coordinar."
  }
  const archivos = [
    ...(Array.isArray(b.archivos) ? b.archivos : []).slice(0, 10).map((a: any, i: number) => `Foto ${i + 1}: ${clean(a, 300)}?descargar`),
    ...(Array.isArray(b.previews) ? b.previews : []).slice(0, 20).map((a: any, i: number) => `Vista previa cuadro ${i + 1}: ${clean(a, 300)}`),
  ].filter((x) => /https?:\/\//.test(x))
  const now = Date.now()
  const p = {
    id: "AM-" + now.toString(36).toUpperCase(), cliente: clean(b.nombre, 80), items, envio, descTransfer: true,
    nota: [plazo(), envioTxt].filter(Boolean).join(" "), archivos, fecha: now, vence: now + 2 * 86400000,
  }
  return Response.json({ url: `/checkout.html?p=${firmar(p as any)}`, total: productos + envio, envio })
}

export const config: Config = { path: "/api/medida", method: "POST" }
