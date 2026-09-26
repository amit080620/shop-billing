// Injected by the Android app into bill.theray.in before any page script runs.
// Gives the web app what Android's WebView lacks on its own: Bluetooth
// printing (window.RayApp), voice input (SpeechRecognition), window.print(),
// navigator.share() and file downloads — all backed by native code.
(() => {
  const channel = window.RayNativeChannel;
  if (!channel || window.RayApp) return;
  const cfg = window.__RAY_NATIVE_CONFIG || {};

  let seq = 0;
  const pending = new Map();
  const listeners = new Map();
  channel.addEventListener("message", (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.id != null && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error)); else resolve(msg.result);
    } else if (msg.event) {
      for (const fn of listeners.get(msg.event) || []) { try { fn(msg.data || {}); } catch (err) { console.error(err); } }
    }
  });

  const call = (method, args) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    channel.postMessage(JSON.stringify({ id, method, args: args || {} }));
  });
  const on = (event, fn) => {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => listeners.get(event).delete(fn);
  };
  const toBase64 = (bytes) => {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const blobToBase64 = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

  // ---- Downloads: blob:/data: links can't be fetched by Android's download
  // manager, so read them here and hand the bytes to native code.
  const blobs = new Map();
  const createObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (obj) => {
    const url = createObjectURL(obj);
    if (obj instanceof Blob) {
      blobs.set(url, obj);
      if (blobs.size > 40) blobs.delete(blobs.keys().next().value);
    }
    return url;
  };
  const saveUrl = async (href, name) => {
    const blob = blobs.get(href) || (await (await fetch(href)).blob());
    return call("file.save", { data: await blobToBase64(blob), name: name || "download", mime: blob.type || "application/octet-stream" });
  };
  const maybeDownload = (a) => {
    if (!(a instanceof HTMLAnchorElement) || !a.hasAttribute("download") || !/^(blob|data):/.test(a.href)) return false;
    saveUrl(a.href, a.getAttribute("download")).catch((err) => alert("Couldn't save the file: " + err.message));
    return true;
  };
  const anchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (!maybeDownload(this)) anchorClick.call(this); };
  const dispatch = EventTarget.prototype.dispatchEvent;
  HTMLAnchorElement.prototype.dispatchEvent = function (ev) {
    if (ev && ev.type === "click" && maybeDownload(this)) return false;
    return dispatch.call(this, ev);
  };
  document.addEventListener("click", (e) => {
    const a = e.target && e.target.closest ? e.target.closest("a[download]") : null;
    if (a && maybeDownload(a)) e.preventDefault();
  }, true);

  // ---- Printing a page (A4 invoice, labels) through Android's print system.
  window.print = () => { call("print.page", { title: document.title }).catch(() => {}); };

  // ---- Share sheet (WhatsApp etc.), including files like PDFs and posters.
  const share = async (data) => {
    data = data || {};
    const files = [];
    for (const f of data.files || []) files.push({ data: await blobToBase64(f), name: f.name || "file", mime: f.type || "application/octet-stream" });
    await call("share", { title: data.title || "", text: data.text || "", url: data.url || "", files });
  };
  try {
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
  } catch { /* read-only navigator: keep the web fallback */ }

  // ---- Voice input: Android's own speech recognizer behind the Web Speech API.
  if (cfg.speech) {
    let active = null;
    let sessions = 0;
    class RaySpeechRecognition extends EventTarget {
      constructor() {
        super();
        this.lang = "en-IN";
        this.interimResults = false;
        this.continuous = false;
        this.maxAlternatives = 1;
        this.onstart = this.onresult = this.onerror = this.onend = null;
      }
      _emit(type, props) {
        const ev = new Event(type);
        Object.assign(ev, props || {});
        dispatch.call(this, ev);
        const handler = this["on" + type];
        if (typeof handler === "function") handler.call(this, ev);
      }
      start() {
        if (active && active !== this) active.abort();
        active = this;
        const session = ++sessions;
        const mine = (fn) => (d) => { if (d.session === session) fn(d); };
        const offs = [
          on("speech.start", mine(() => this._emit("start"))),
          on("speech.result", mine((d) => {
            const alt = { transcript: d.text || "", confidence: 0.9 };
            const list = Object.assign([alt], { isFinal: !!d.final, item: (i) => list[i] });
            const results = Object.assign([list], { item: (i) => results[i] });
            this._emit("result", { resultIndex: 0, results });
          })),
          on("speech.error", mine((d) => this._emit("error", { error: d.error, message: d.error }))),
          on("speech.end", mine(() => {
            offs.forEach((off) => off());
            if (active === this) active = null;
            this._emit("end");
          })),
        ];
        call("speech.start", { lang: this.lang, interim: !!this.interimResults, session }).catch(() => {});
      }
      stop() { call("speech.stop").catch(() => {}); }
      abort() { call("speech.stop").catch(() => {}); }
    }
    window.SpeechRecognition = window.webkitSpeechRecognition = RaySpeechRecognition;
  }

  // ---- Status bar colour follows the app header (light and dark theme).
  // Colours come back in any CSS syntax (Tailwind v4 uses oklab, often
  // translucent), so a 1px canvas turns them into the colour actually seen.
  let lastColor = "";
  const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const seen = (...layers) => {
    probe.fillStyle = "#ffffff";
    probe.fillRect(0, 0, 1, 1);
    for (const c of layers) { probe.fillStyle = c; probe.fillRect(0, 0, 1, 1); }
    const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
    return "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
  };
  const syncBars = () => {
    if (!document.body) return;
    const header = document.querySelector("header");
    const layers = [getComputedStyle(document.body).backgroundColor];
    if (header) layers.push(getComputedStyle(header).backgroundColor);
    const color = seen(...layers);
    if (color !== lastColor) { lastColor = color; call("ui.bars", { color }).catch(() => {}); }
  };
  setInterval(syncBars, 1200);
  document.addEventListener("DOMContentLoaded", syncBars);

  window.RayApp = { platform: "android", version: cfg.version, features: { barcode: !!cfg.barcode }, call, on, toBase64, saveUrl };
})();
