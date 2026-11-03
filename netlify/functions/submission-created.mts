// Se ejecuta solo cada vez que llega un formulario de Netlify:
// - "consulta" (pedido de presupuesto): se guarda para el panel, aviso a Design Studio y confirmación al cliente.
// - "pedido" (compra en la web) y "arrepentimiento": aviso a Design Studio (y confirmación al cliente en el arrepentimiento).
import { desdeFormulario, guardar } from "../lib/consultas.mts"
import { mandar, tabla, carta, CUENTA } from "../lib/mail.mts"

const v = (d: any, k: string) => String(d?.[k] ?? "").trim()
const primer = (s: string) => s.trim().split(/\s+/)[0] || ""

export default async (req: Request) => {
  let form = "", d: any = {}, fecha = Date.now(), sub = ""
  try {
    const { payload } = await req.json()
    form = payload?.form_name || ""; d = payload?.data || {}; fecha = Date.parse(payload?.created_at) || Date.now(); sub = payload?.id
  } catch { return new Response("ok") }
  const panel = "https://designstudioenmarcados.com.ar/pedidos.html"
  const tareas: Promise<unknown>[] = []

  if (form === "consulta") {
    const c = desdeFormulario(d, fecha, sub)
    if (!c.nombre && !c.whatsapp) return new Response("ok")
    try { await guardar(c) } catch (e) { console.error("guardar consulta", e) }
    const que = c.que === "Obra de Dsgn. Studio" ? `la obra ${c.obra || "elegida"}` : (c.objeto || "tu pieza").toLowerCase()
    const t = tabla({
      "Qué quiere enmarcar": c.que === "Obra de Dsgn. Studio" ? `Obra: ${c.obra || "-"}` : c.objeto || "Algo suyo",
      "Medidas": c.medidas,
      "Fotos": c.fotos.map((f, i) => `Foto ${i + 1} (${f.nombre}): ${f.url}?descargar`).join("\n") || (c.fotosForm.length ? "Hay copias en Netlify → Forms → consulta" : ""),
      "Entrega": c.entrega === "Retiro por el taller" ? "Retira por el taller" : c.cp ? `Envío · CP ${c.cp} · ${[c.localidad, c.provincia].filter(Boolean).join(", ")}` : "",
      "Nombre": c.nombre, "WhatsApp": c.whatsapp, "Email": c.email, "Acepta novedades": c.novedades ? "Sí" : "No",
      "Comentarios": c.comentarios, "Panel": panel,
    })
    tareas.push(mandar({ to: CUENTA, subject: `Nuevo pedido de presupuesto — ${c.nombre}`, ...t, replyTo: c.email || undefined }))
    if (c.email) tareas.push(mandar({
      to: c.email, replyTo: CUENTA, subject: "Recibimos tu pedido de presupuesto — Design Studio",
      ...carta(`¡Hola ${primer(c.nombre)}!\n\nRecibimos tu pedido de presupuesto para enmarcar ${que}.\n\nLo estamos revisando y te enviamos el presupuesto lo antes posible por WhatsApp.\n\nGracias por elegirnos.\nDesign Studio\nhttps://designstudioenmarcados.com.ar`),
    }))
  } else if (form === "pedido") {
    const t = tabla({
      "N° de pedido": v(d, "orden"), "Detalle": v(d, "detalle"), "Envío": v(d, "envio"), "Total": v(d, "total"), "Forma de pago": v(d, "pago"),
      "Nombre": v(d, "nombre"), "Email": v(d, "email"), "Teléfono": v(d, "telefono"), "Entrega": v(d, "entrega"),
      "Dirección": [[v(d, "direccion"), v(d, "numero")].filter(Boolean).join(" "), v(d, "depto"), v(d, "cp"), v(d, "ciudad"), v(d, "provincia")].filter(Boolean).join(", "),
      "DNI": v(d, "dni"), "Factura a nombre de": [v(d, "factura_razon"), v(d, "factura_cuit")].filter(Boolean).join(" · CUIT "),
      "Comentarios": v(d, "comentarios"), "Comisiones (interno)": v(d, "comision_fotografas"), "Panel": panel,
    })
    tareas.push(mandar({ to: CUENTA, subject: `Nueva compra en la web (${v(d, "orden")}) — ${v(d, "nombre")} — ${v(d, "total")}`, ...t, replyTo: v(d, "email") || undefined }))
  } else if (form === "arrepentimiento") {
    const code = v(d, "codigo")
    const t = tabla({ "Código": code, "Nombre": v(d, "nombre"), "DNI": v(d, "dni"), "Email": v(d, "email"), "Teléfono": v(d, "telefono"), "Pedido": v(d, "pedido"), "Fecha de compra": v(d, "fecha"), "Comentarios": v(d, "comentarios") })
    tareas.push(mandar({ to: CUENTA, subject: `Botón de arrepentimiento — ${code} — pedido ${v(d, "pedido")}`, ...t, replyTo: v(d, "email") || undefined }))
    if (v(d, "email")) tareas.push(mandar({
      to: v(d, "email"), replyTo: CUENTA, subject: `Recibimos tu solicitud de cancelación — ${code}`,
      ...carta(`¡Hola ${primer(v(d, "nombre"))}!\n\nRecibimos tu solicitud de cancelación (botón de arrepentimiento) del pedido ${v(d, "pedido")}.\nTu código de identificación es ${code}.\n\nNos comunicamos con vos dentro de las próximas 24 horas hábiles.\n\nDesign Studio`),
    }))
  }
  const r = await Promise.allSettled(tareas)
  r.forEach((x) => x.status === "rejected" && console.error("mail", form, x.reason))
  return new Response("ok")
}
