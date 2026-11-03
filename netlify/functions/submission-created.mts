// Se ejecuta solo cada vez que llega un formulario de Netlify.
// Los pedidos de presupuesto ("consulta") se guardan para el panel de gestión (/pedidos.html).
import { desdeFormulario, guardar } from "../lib/consultas.mts"

export default async (req: Request) => {
  try {
    const { payload } = await req.json()
    if (payload?.form_name !== "consulta") return new Response("ok")
    const fecha = Date.parse(payload.created_at) || Date.now()
    const c = desdeFormulario(payload.data || {}, fecha)
    if (!c.nombre && !c.whatsapp) return new Response("ok")
    await guardar(c)
  } catch (e) { console.error("submission-created", e) }
  return new Response("ok")
}
