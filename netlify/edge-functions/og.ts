// Vista previa al compartir links (WhatsApp, Instagram, Facebook…): los bots no ejecutan JS,
// así que acá se reescriben las etiquetas og:* en el HTML según la página, la obra o la colección.
import type { Context } from "https://edge.netlify.com"

const STATIC: Record<string, string> = {
  "/enmarcado-a-medida": "/assets/medida-camiseta.jpg",
  "/nuestros-marcos": "/assets/marcos/box.jpg",
}
const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!))
let cache: { t: number; c: any } | null = null

export default async (req: Request, context: Context) => {
  const res = await context.next()
  if (!(res.headers.get("content-type") || "").includes("text/html")) return res
  const url = new URL(req.url), path = url.pathname.replace(/\.html$/, "").replace(/\/$/, "") || "/"
  let html = await res.text()
  const meta = (prop: string) => new RegExp(`<meta property="${prop}" content="[^"]*">`)
  let title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || ""
  let desc = (html.match(/<meta name="description" content="([^"]*)">/) || [])[1] || ""
  let img = STATIC[path] || "/assets/og.jpg", w = STATIC[path] ? "" : "1200", h = STATIC[path] ? "" : "630"
  try {
    const id = url.searchParams.get("id"), cat = url.searchParams.get("c")
    if ((path === "/producto" && id) || (path === "/coleccion" && cat)) {
      if (!cache || Date.now() - cache.t > 300000) cache = { t: Date.now(), c: await (await fetch(new URL("/catalog.json", url))).json() }
      const c = cache.c
      if (path === "/producto") {
        const p = c.products.find((x: any) => x.id === id)
        if (p) {
          const k = c.categories.find((x: any) => x.id === p.category) || {}
          title = `${p.name} | Design Studio`
          desc = [p.fotografa ? `${k.credito || "Fotografía"}: ${p.fotografa}` : "", k.label ? `Colección ${k.label}` : "", "Enmarcado listo para colgar. Elegí medida, marco y paspartú."].filter(Boolean).join(" · ")
          img = (p.ambientes && p.ambientes[0]) || p.photo; w = h = "1080"
        }
      } else {
        const k = c.categories.find((x: any) => x.id === cat)
        if (k) { title = `Colección ${k.label} | Design Studio`; desc = k.description || desc; if (k.cover) { img = k.cover; w = h = "1080" } }
      }
    }
  } catch (e) { console.error("og", e) }
  const abs = new URL(img, url).href
  const tags = `<meta property="og:title" content="${esc(title)}">\n  <meta property="og:description" content="${esc(desc)}">\n  <meta property="og:image" content="${esc(abs)}">${w ? `\n  <meta property="og:image:width" content="${w}">\n  <meta property="og:image:height" content="${h}">` : ""}\n  <meta property="og:url" content="${esc(url.href)}">`
  html = html.replace(meta("og:title"), "").replace(meta("og:description"), "").replace(meta("og:image:width"), "").replace(meta("og:image:height"), "").replace(meta("og:url"), "")
    .replace(meta("og:image"), tags)
  const headers = new Headers(res.headers); headers.delete("content-length")
  return new Response(html, { status: res.status, headers })
}

export const config = { path: ["/", "/producto", "/coleccion", "/enmarcado-a-medida", "/nuestros-marcos", "/ayuda", "/terminos", "/arrepentimiento", "/index.html", "/producto.html", "/coleccion.html", "/enmarcado-a-medida.html", "/nuestros-marcos.html", "/ayuda.html", "/terminos.html", "/arrepentimiento.html"] }
