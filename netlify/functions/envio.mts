import type { Config } from "@netlify/functions"
import { priceLines, sumLines, paquetes, huella } from "../lib/precios.mts"
import { configurado, cotizar } from "../lib/zipnova.mts"
import { firmar } from "../lib/firma.mts"

// Cotiza el envío a domicilio del carrito con Zipnova y devuelve el precio firmado (para que no se pueda cambiar).
export default async (req: Request) => {
  if (!configurado()) return Response.json({ modo: "coordinar" })
  let b: any
  try { b = await req.json() } catch { return Response.json({ error: "Pedido inválido" }, { status: 400 }) }
  const cp = String(b.cp || "").replace(/\D/g, "").slice(0, 4)
  const ciudad = String(b.ciudad || "").trim().slice(0, 80), provincia = String(b.provincia || "").trim().slice(0, 40)
  if (cp.length !== 4 || !ciudad || !provincia) return Response.json({ error: "Completá código postal, ciudad y provincia" }, { status: 400 })
  const lines = priceLines(b.items)
  const items = paquetes(lines)
  if (!items.length) return Response.json({ error: "El carrito está vacío" }, { status: 400 })
  try {
    const op = await cotizar({ cp, ciudad, provincia }, items, sumLines(lines))
    if (!op) return Response.json({ modo: "coordinar", error: "No encontramos envíos a domicilio para ese código postal" })
    const token = firmar("envio", { op, cp, ciudad, provincia, h: huella(lines), vence: Date.now() + 6 * 3600_000 })
    return Response.json({ modo: "zipnova", precio: op.precio, carrier: op.carrier, min: op.min, max: op.max, token })
  } catch (e) {
    console.error("cotizar", e)
    return Response.json({ modo: "coordinar", error: "No pudimos calcular el envío en este momento" })
  }
}

export const config: Config = { path: "/api/envio", method: "POST" }
