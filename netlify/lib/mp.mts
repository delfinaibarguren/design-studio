// Consulta un pago en Mercado Pago (así nunca confiamos en lo que dice el navegador o el aviso).
export async function pagoMP(id: string) {
  const token = Netlify.env.get("MP_ACCESS_TOKEN")
  if (!token || !/^\d{5,20}$/.test(id)) return null
  const r = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) { console.error("MP pago", id, r.status); return null }
  const p = await r.json()
  return { id: String(p.id), estado: String(p.status), orden: String(p.external_reference || "") }
}
