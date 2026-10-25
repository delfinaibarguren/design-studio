import type { Config } from "@netlify/functions"
import { pagoMP } from "../lib/mp.mts"
import { pagadoYEnviar } from "../lib/pedidos.mts"

// Mercado Pago avisa acá cada vez que cambia un pago. Si está aprobado, se crea el envío.
export default async (req: Request) => {
  const u = new URL(req.url)
  let b: any = {}
  try { b = await req.json() } catch {}
  const tipo = b.type || b.topic || u.searchParams.get("type") || u.searchParams.get("topic")
  const id = String(b.data?.id || u.searchParams.get("data.id") || u.searchParams.get("id") || "")
  if (tipo === "payment" && id) {
    try {
      const p = await pagoMP(id)
      if (p && p.estado === "approved" && p.orden) await pagadoYEnviar(p.orden, p.id)
    } catch (e) { console.error("mp-aviso", e) }
  }
  return new Response("ok")
}

export const config: Config = { path: "/api/mp-aviso" }
