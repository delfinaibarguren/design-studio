import type { Config } from "@netlify/functions"
import { firmar, verificar, type Item } from "../lib/presupuesto.mts"

const clean = (s: unknown, n = 200) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n)

export default async (req: Request) => {
  // ver un presupuesto (lo usa la página de pago)
  if (req.method === "GET") {
    const p = verificar(new URL(req.url).searchParams.get("p"))
    return Response.json(p, { status: "error" in p ? 400 : 200 })
  }
  // crear un presupuesto (solo con la clave de administración)
  let b: any
  try { b = await req.json() } catch { return Response.json({ error: "Pedido inválido" }, { status: 400 }) }
  const key = Netlify.env.get("ADMIN_KEY")
  if (!key || b.key !== key) return Response.json({ error: "Clave incorrecta" }, { status: 401 })
  const items: Item[] = (Array.isArray(b.items) ? b.items : [])
    .map((i: any) => ({ desc: clean(i.desc), cant: Math.max(1, Math.min(999, Math.floor(Number(i.cant) || 1))), precio: Math.round(Number(i.precio) || 0) }))
    .filter((i: Item) => i.desc && i.precio > 0)
  if (!items.length) return Response.json({ error: "Agregá al menos un ítem con precio" }, { status: 400 })
  const dias = Math.max(1, Math.min(90, Number(b.dias) || 15))
  const now = Date.now()
  const p = {
    id: "PR-" + now.toString(36).toUpperCase(), cliente: clean(b.cliente, 80), items,
    envio: Math.max(0, Math.round(Number(b.envio) || 0)), descTransfer: b.descTransfer !== false,
    nota: clean(b.nota, 300) || undefined, fecha: now, vence: now + dias * 86400000,
  }
  const token = firmar(p)
  return Response.json({ id: p.id, url: `${new URL(req.url).origin}/checkout.html?p=${token}`, vence: p.vence })
}

export const config: Config = { path: "/api/presupuesto", method: ["GET", "POST"] }
