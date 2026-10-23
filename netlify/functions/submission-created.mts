// Se ejecuta sola cada vez que llega un formulario (Netlify "submission-created")
// y manda un mail a Dsgn. Studio con el detalle, usando FormSubmit (sin cuenta ni claves).
const TO = "designstudioenmarcados@gmail.com"

const LABELS: Record<string, string> = {
  que: "Qué quiere enmarcar", obra: "Obra", objeto: "Qué es", medidas: "Medidas", nombre: "Nombre", whatsapp: "WhatsApp",
  email: "Email", comentarios: "Comentarios", orden: "N° de pedido", detalle: "Detalle", total: "Total", telefono: "Teléfono",
  entrega: "Entrega", direccion: "Dirección", depto: "Piso / depto", cp: "Código postal", ciudad: "Ciudad", provincia: "Provincia",
  pago: "Forma de pago", comision_fotografas: "Comisión fotógrafas (interno)",
}
const SKIP = new Set(["bot-field", "ip", "user_agent", "referrer", "form-name"])

export default async (req: Request) => {
  let payload: any
  try { payload = (await req.json()).payload } catch { return new Response("bad request", { status: 400 }) }
  if (!payload) return new Response("no payload", { status: 400 })
  const form = payload.form_name, d = payload.data || {}
  if (form !== "consulta" && form !== "pedido") return new Response("ignored")

  const fields: Record<string, string> = {}
  const fotos: string[] = []
  for (const [k, v] of Object.entries<any>(d)) {
    if (SKIP.has(k) || v === "" || v == null) continue
    if (typeof v === "object" && v.url) { fotos.push(v.url); continue }
    if (form === "consulta" && d.que === "Algo mío" && k === "obra") continue
    if (form === "consulta" && d.que !== "Algo mío" && k === "objeto") continue
    fields[LABELS[k] || k] = String(v)
  }
  fotos.forEach((u, i) => (fields[`Foto ${i + 1}`] = u))

  const quien = d.nombre || "cliente"
  const subject = form === "consulta"
    ? `Nuevo pedido de presupuesto a medida — ${quien}`
    : `Nueva compra en la web ${d.orden ? "(" + d.orden + ") " : ""}— ${quien} — ${d.total || ""}`

  const res = await fetch(`https://formsubmit.co/ajax/${TO}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Referer: "https://design-studio-cuadros.netlify.app/" },
    body: JSON.stringify({ _subject: subject, _template: "table", _captcha: "false", ...(d.email ? { _replyto: d.email } : {}), ...fields }),
  })
  const txt = await res.text()
  console.log("mail", form, res.status, txt.slice(0, 300))
  return new Response("ok")
}
