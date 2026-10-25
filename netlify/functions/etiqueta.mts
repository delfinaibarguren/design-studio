import type { Config } from "@netlify/functions"
import { okCorta } from "../lib/firma.mts"
import { leer } from "../lib/pedidos.mts"
import { etiqueta } from "../lib/zipnova.mts"

// Etiqueta PDF del envío. El link va firmado, así solo lo abre quien lo recibió por mail o desde la página privada.
export default async (req: Request) => {
  const u = new URL(req.url), orden = u.searchParams.get("orden") || ""
  if (!okCorta("etiqueta", orden, u.searchParams.get("s"))) return new Response("Link inválido", { status: 403 })
  const p = await leer(orden)
  if (!p?.envioCreado?.id) return new Response("Este pedido todavía no tiene envío creado", { status: 404 })
  const pdf = await etiqueta(p.envioCreado.id).catch(() => null)
  if (!pdf) return new Response("La etiqueta todavía no está lista. Probá de nuevo en unos minutos o descargala desde Zipnova → Pendientes.", { status: 409, headers: { "Content-Type": "text/plain; charset=utf-8" } })
  return new Response(pdf, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="etiqueta-${orden}.pdf"`, "Cache-Control": "private, no-store" } })
}

export const config: Config = { path: "/api/etiqueta", method: "GET" }
