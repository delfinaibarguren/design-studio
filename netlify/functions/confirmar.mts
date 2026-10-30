import type { Config } from "@netlify/functions"
import { pagoMP } from "../lib/mp.mts"
import { pagadoYEnviar, leer } from "../lib/pedidos.mts"
import { firmaCorta } from "../lib/firma.mts"

// La página de gracias pregunta acá: confirma el pago con Mercado Pago y devuelve el seguimiento del envío.
export default async (req: Request) => {
  const id = new URL(req.url).searchParams.get("pago") || ""
  const p = await pagoMP(id)
  if (!p) return Response.json({ error: "Pago no encontrado" }, { status: 404 })
  if (p.estado !== "approved") return Response.json({ estado: p.estado, orden: p.orden })
  let ped = await pagadoYEnviar(p.orden, p.id).catch(() => null)
  // si otro proceso lo estaba creando, esperamos un poco y volvemos a leer
  for (let i = 0; i < 6 && ped && ped.entrega === "domicilio" && ped.envio && !ped.envioCreado && !ped.envioError; i++) {
    await new Promise((r) => setTimeout(r, 2500)); ped = await leer(p.orden)
  }
  const origin = new URL(req.url).origin
  const e = ped?.envioCreado
  return Response.json({
    estado: "approved", orden: p.orden, retiro: ped?.entrega === "retiro",
    envio: e ? { carrier: e.carrier, seguimiento: e.seguimiento, tracking: e.tracking } : null,
    etiqueta: e ? `${origin}/api/etiqueta?orden=${encodeURIComponent(p.orden)}&s=${firmaCorta("etiqueta", p.orden)}` : null,
    envioError: ped?.envioError ? true : false,
  })
}

export const config: Config = { path: "/api/confirmar", method: "GET" }
