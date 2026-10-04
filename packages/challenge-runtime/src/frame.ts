import { bootstrapSource } from './bootstrap-source.js'
export const FRAME_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
export function createFrame(bundle: string, session: string, parentOrigin: string): HTMLIFrameElement {
  const frame = document.createElement('iframe')
  frame.title = 'Reto de aprendizaje aislado'
  frame.setAttribute('sandbox', 'allow-scripts')
  frame.setAttribute('allow', "camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; usb 'none'; fullscreen 'none'")
  frame.referrerPolicy = 'no-referrer'
  const config = JSON.stringify({ session, parentOrigin }).replaceAll('<', '\\u003c')
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}"><meta name="referrer" content="no-referrer"></head><body><script>globalThis.__mimixConfig=${config};${bootstrapSource}</script><script>${bundle}</script></body></html>`
  return frame
}
