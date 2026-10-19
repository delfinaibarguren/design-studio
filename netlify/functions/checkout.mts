import type { Config, Context } from "@netlify/functions"
import catalog from "../../catalog.json" with { type: "json" }

type Line = { productId: string; size: string; finish: string; frame?: string; style?: string; qty: number }

const products = new Map(catalog.products.map((p) => [p.id, p]))
const sizes = new Map(catalog.sizes.map((s) => [s.id, s]))
const frames = new Map(catalog.frames.map((f) => [f.id, f]))

// El precio siempre se calcula acá, nunca se confía en el navegador.
function priceLine(line: Line) {
  const product: any = products.get(String(line.productId))
  const size = sizes.get(String(line.size))
  if (!product || !size) return null
  const qtyS = Math.max(1, Math.min(10, Math.floor(Number(line.qty) || 1)))
  if (product.styles) {
    const st = product.styles.find((s: any) => s.id === line.style)
    if (!st) return null
    const label = size.label
    return {
      id: `${product.id}-${size.id}-${st.id}`,
      title: `${product.name} (${label}, ${st.label})`,
      quantity: qtyS,
      unit_price: st.finish === "marco" ? size.marco : size.lamina,
      currency_id: "ARS",
    }
  }
  const withFrame = line.finish === "marco"
  const frame = withFrame ? frames.get(String(line.frame)) : null
  if (withFrame && !frame) return null
  const qty = Math.max(1, Math.min(10, Math.floor(Number(line.qty) || 1)))
  const variant = withFrame ? `${size.label}, marco ${frame!.label.toLowerCase()}` : `${size.label}, solo lámina`
  return {
    id: `${product.id}-${size.id}-${line.finish}${frame ? "-" + frame.id : ""}`,
    title: `${product.name} (${variant})`,
    quantity: qty,
    unit_price: withFrame ? size.marco : size.lamina,
    currency_id: "ARS",
  }
}

export default async (req: Request, context: Context) => {
  const token = Netlify.env.get("MP_ACCESS_TOKEN")
  if (!token) return Response.json({ mode: "manual" })

  let body: { items?: Line[]; buyer?: { name?: string; email?: string; phone?: string }; orderId?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "Pedido inválido" }, { status: 400 })
  }

  const items = (Array.isArray(body.items) ? body.items : []).map(priceLine).filter(Boolean)
  if (items.length === 0) return Response.json({ error: "El carrito está vacío" }, { status: 400 })

  const origin = new URL(req.url).origin
  const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      items,
      payer: body.buyer?.email ? { name: body.buyer.name, email: body.buyer.email } : undefined,
      external_reference: body.orderId ? String(body.orderId).slice(0, 64) : undefined,
      payment_methods: { installments: catalog.store.maxInstallments },
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
