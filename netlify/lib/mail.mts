// Mails desde la cuenta de Gmail de Design Studio (contraseña de aplicación en GMAIL_APP_PASSWORD).
import nodemailer from "nodemailer"

export const CUENTA = "designstudioenmarcados@gmail.com"
export const mailListo = () => Boolean(Netlify.env.get("GMAIL_APP_PASSWORD"))
let transporte: any = null

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!))
const linkify = (s: string) => esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').replace(/\n/g, "<br>")

// tabla simple con los datos (para los avisos a Delfina)
export function tabla(campos: Record<string, unknown>) {
  const filas = Object.entries(campos).filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "")
  return {
    text: filas.map(([k, v]) => `${k}: ${v}`).join("\n"),
    html: `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">${filas.map(([k, v]) =>
      `<tr><td style="padding:6px 12px 6px 0;vertical-align:top;color:#666;white-space:nowrap"><b>${esc(k)}</b></td><td style="padding:6px 0">${linkify(String(v))}</td></tr>`).join("")}</table>`,
  }
}

// texto simple para los mails a clientes
export function carta(texto: string) {
  return {
    text: texto,
    html: `<div style="font-family:Georgia,serif;font-size:16px;line-height:1.6;color:#1c1b19;max-width:520px">${linkify(texto)}</div>`,
  }
}

export async function mandar(m: { to: string; subject: string; text: string; html?: string; replyTo?: string }) {
  if (!mailListo() || !m.to) return false
  transporte ||= nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user: CUENTA, pass: String(Netlify.env.get("GMAIL_APP_PASSWORD")).replace(/\s/g, "") },
  })
  await transporte.sendMail({ from: `"Design Studio" <${CUENTA}>`, ...m })
  return true
}
