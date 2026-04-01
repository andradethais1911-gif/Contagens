// ============================================================
// App.jsx — Sistema de Gestão de Contagens
// Versão: Vercel KV (deploy próprio)
// Cole este arquivo em: src/App.jsx
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";

// ── FONTS ────────────────────────────────────────────────────
function injectFonts() {
  if (document.getElementById("app-fonts")) return;
  const l = document.createElement("link");
  l.id = "app-fonts";
  l.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap";
  l.rel = "stylesheet";
  document.head.appendChild(l);
}

// ── DATABASE (Vercel KV via API route) ───────────────────────
const DB = {
  async get(k) {
    try {
      const res = await fetch(`/api/storage?key=${encodeURIComponent(k)}`);
      const json = await res.json();
      return json.value ? JSON.parse(json.value) : null;
    } catch { return null; }
  },
  async set(k, v) {
    try {
      await fetch("/api/storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: k, value: JSON.stringify(v) }),
      });
    } catch {}
  },
};

// ── CONSTANTS ────────────────────────────────────────────────
const DEFAULT_PASS = "Teresa";
const UNITS = ["Unidade", "Kg", "Pacote", "Caixa", "Litro", "Metro", "Dúzia"];

// ── DESIGN TOKENS ────────────────────────────────────────────
const T = {
  bg: "#080d14", surface: "#0f1621", card: "#111827",
  border: "#1e2d42", accent: "#3b82f6", accentDim: "#1d4ed8",
  warm: "#f97316", warmDim: "#c2410c", green: "#22c55e", greenDim: "#15803d",
  red: "#ef4444", redDim: "#b91c1c", yellow: "#eab308", purple: "#8b5cf6",
  text: "#f1f5f9", textSub: "#94a3b8", textMuted: "#475569",
  fontBase: "'Inter', sans-serif", fontMono: "'JetBrains Mono', monospace",
  fs10: 10, fs11: 11, fs12: 12, fs13: 13, fs14: 14,
  fs15: 15, fs16: 16, fs18: 18, fs20: 20, fs24: 24,
};

// ── HELPERS ──────────────────────────────────────────────────
const daysUntil = s => { const n = new Date(); n.setHours(0,0,0,0); const d = new Date(s + "T00:00:00"); d.setHours(0,0,0,0); return Math.round((d - n) / 86400000); };
const fmtDate   = s => { if (!s) return "—"; const [y, m, d] = s.split("-"); return `${d}/${m}/${y}`; };
const todayStr  = () => new Date().toISOString().slice(0, 10);
const addDays   = (s, n) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const normPhone = v => v.replace(/\D/g, "");
const fmtCurrency = v => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const upper = s => s.toUpperCase();

function getStatus(item, counted) {
  if (counted === undefined || counted === null) return null;
  if (item.min && counted <= item.min) return { label: "ABAIXO DO MÍNIMO", color: T.red,    level: "danger" };
  if (item.max && counted >  item.max) return { label: "ACIMA DO MÁXIMO",  color: T.purple, level: "over"   };
  return { label: "OK", color: T.green, level: "ok" };
}

// ── REPORT IMAGE (Canvas → PNG) ──────────────────────────────
function ReportModal({ counting, items, onClose }) {
  const canvasRef = useRef();
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = 800, rowH = 38, headerH = 120, tableHeaderH = 36;
    const ciList = counting.items || [];
    const totalH = headerH + tableHeaderH + ciList.length * rowH + 110 + 40 + 30;
    canvas.width = W; canvas.height = totalH;

    ctx.fillStyle = "#f8faff"; ctx.fillRect(0, 0, W, totalH);
    ctx.fillStyle = "#0a1e3c"; ctx.fillRect(0, 0, W, headerH);
    ctx.fillStyle = "#3b82f6"; ctx.fillRect(0, headerH - 3, W, 3);
    ctx.fillStyle = "#ffffff"; ctx.font = "bold 22px Arial"; ctx.fillText("RELATÓRIO DE CONTAGEM", 32, 42);
    ctx.font = "600 15px Arial"; ctx.fillStyle = "#93c5fd"; ctx.fillText(counting.label, 32, 68);
    ctx.font = "14px Arial"; ctx.fillStyle = "#64748b";
    ctx.fillText(`Data: ${fmtDate(counting.date)}`, 32, 92);
    ctx.fillText(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 32, 112);

    let y = headerH;
    const cols = [
      { label: "Insumo",             x: 32,  w: 260 },
      { label: "Unidade",            x: 292, w: 90  },
      { label: "Quantidade Contada", x: 382, w: 140 },
      { label: "Mínimo",             x: 522, w: 80  },
      { label: "Máximo",             x: 602, w: 80  },
      { label: "Status",             x: 682, w: 118 },
    ];
    ctx.fillStyle = "#0a1e3c"; ctx.fillRect(0, y, W, tableHeaderH);
    ctx.font = "bold 11px Arial"; ctx.fillStyle = "#bfdbfe";
    cols.forEach(c => ctx.fillText(c.label, c.x, y + 23));
    y += tableHeaderH;

    ciList.forEach((ci, idx) => {
      const item = items.find(i => i.id === ci.id) || ci;
      const st   = getStatus(item, ci.counted);
      ctx.fillStyle = idx % 2 === 0 ? "#ffffff" : "#f0f5ff";
      ctx.fillRect(0, y, W, rowH);
      ctx.strokeStyle = "#dbe8f8"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, y + rowH); ctx.lineTo(W, y + rowH); ctx.stroke();
      ctx.font = "600 12px Arial"; ctx.fillStyle = "#1e293b";
      ctx.fillText(String(ci.name || item.name || "").slice(0, 35), 32, y + 24);
      ctx.font = "12px Arial"; ctx.fillStyle = "#475569";
      ctx.fillText(item.unit || "—", 292, y + 24);
      ctx.font = "bold 13px Arial"; ctx.fillStyle = "#1d4ed8";
      ctx.fillText(String(ci.counted ?? 0), 382, y + 24);
      ctx.font = "12px Arial"; ctx.fillStyle = "#475569";
      ctx.fillText(String(item.min || "—"), 522, y + 24);
      ctx.fillText(String(item.max || "—"), 602, y + 24);
      if (st) {
        const bgColor  = st.color === T.red ? "#fee2e2" : st.color === T.purple ? "#ede9fe" : "#dcfce7";
        const txtColor = st.color === T.red ? "#b91c1c" : st.color === T.purple ? "#6d28d9" : "#15803d";
        ctx.fillStyle = bgColor;
        ctx.beginPath(); ctx.roundRect(682, y + 8, 112, 22, 5); ctx.fill();
        ctx.font = "bold 10px Arial"; ctx.fillStyle = txtColor;
        ctx.fillText(st.label.slice(0, 16), 688, y + 23);
      }
      y += rowH;
    });

    y += 12;
    ctx.fillStyle = "#e8f0fe";
    ctx.beginPath(); ctx.roundRect(24, y, W - 48, 90, 10); ctx.fill();
    ctx.strokeStyle = "#3b82f6"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(24, y, W - 48, 90, 10); ctx.stroke();
    ctx.font = "bold 13px Arial"; ctx.fillStyle = "#0a1e3c"; ctx.fillText("RESUMO", 42, y + 24);
    const abaixo = ciList.filter(ci => { const it = items.find(i => i.id === ci.id) || ci; return it.min && ci.counted <= it.min; }).length;
    ctx.font = "12px Arial"; ctx.fillStyle = "#334155";
    ctx.fillText(`Total de insumos contados: ${ciList.length}`, 42, y + 46);
    ctx.fillText(`Insumos abaixo do mínimo: ${abaixo}`, 42, y + 66);
    ctx.fillStyle = "#94a3b8"; ctx.font = "11px Arial"; ctx.textAlign = "center";
    ctx.fillText("Sistema de Gestão de Contagens", W / 2, totalH - 14);
    ctx.textAlign = "left";
    setRendered(true);
  }, []);

  const handleDownload = () => {
    const link = document.createElement("a");
    link.download = `${counting.label.replace(/\s+/g, "_")}_${counting.date || todayStr()}.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.88)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"flex-start", zIndex:9999, padding:16, overflowY:"auto", fontFamily:T.fontBase }}>
      <div style={{ width:"100%", maxWidth:860, background:T.card, borderRadius:14, border:`1px solid ${T.border}`, overflow:"hidden" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 18px", borderBottom:`1px solid ${T.border}` }}>
          <div style={{ fontWeight:700, fontSize:T.fs14, color:T.text }}>📄 {counting.label}</div>
          <div style={{ display:"flex", gap:8 }}>
            {rendered && <button onClick={handleDownload} style={{ background:T.warm, border:"none", borderRadius:9, padding:"8px 16px", color:"#fff", fontWeight:700, fontSize:T.fs13, cursor:"pointer", fontFamily:T.fontBase }}>⬇ Salvar imagem</button>}
            <button onClick={onClose} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:9, padding:"8px 14px", color:T.textSub, fontWeight:600, fontSize:T.fs13, cursor:"pointer", fontFamily:T.fontBase }}>✕ Fechar</button>
          </div>
        </div>
        <div style={{ padding:16, overflowX:"auto" }}>
          <canvas ref={canvasRef} style={{ width:"100%", height:"auto", borderRadius:8, border:`1px solid ${T.border}` }} />
        </div>
      </div>
    </div>
  );
}

// ── WHATSAPP ─────────────────────────────────────────────────
function sendWhatsApp(phone, counting, items) {
  const lines   = (counting.items || []).map(ci => `  • ${ci.name} (${ci.unit || "un"}): *${ci.counted ?? 0}*`).join("\n");
  const abaixo  = (counting.items || []).filter(ci => { const it = items.find(i => i.id === ci.id) || ci; return it.min && ci.counted <= it.min; });
  const alertas = abaixo.length ? `\n\n⚠️ *Insumos abaixo do mínimo:*\n${abaixo.map(ci => `  • ${ci.name}: *${ci.counted ?? 0}*`).join("\n")}` : "";
  const msg = `📦 *${counting.label}*\n📅 Data: ${fmtDate(counting.date)}\n\n📋 *Quantidades contadas:*\n${lines}${alertas}\n\n_Sistema de Gestão de Contagens_`;
  const a = document.createElement("a");
  a.href = `https://wa.me/${normPhone(phone)}?text=${encodeURIComponent(msg)}`;
  a.target = "_blank"; a.rel = "noopener";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

// ── DATA HOOK ────────────────────────────────────────────────
function useAppData() {
  const [state, setState]   = useState({ items:[], countings:[], scheduledDates:[], appPass:null, passHint:null, whatsapp:null });
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [items, countings, scheduledDates, appPass, passHint, whatsapp] = await Promise.all([
      DB.get("items_v2"), DB.get("countings_v2"), DB.get("scheduledDates"),
      DB.get("appPass"),  DB.get("passHint"),     DB.get("whatsapp"),
    ]);
    setState({
      items: items || [], countings: countings || [], scheduledDates: scheduledDates || [],
      appPass: appPass || DEFAULT_PASS, passHint: passHint || null, whatsapp: whatsapp || null,
    });
    setLoading(false);
  }, []);

  useEffect(() => { injectFonts(); reload(); }, [reload]);

  const save = (key, fn, dbKey) => setState(prev => {
    const next = typeof fn === "function" ? fn(prev[key]) : fn;
    DB.set(dbKey || key, next);
    return { ...prev, [key]: next };
  });

  return {
    ...state, loading, reload,
    setItems:          fn => save("items",          fn, "items_v2"),
    setCountings:      fn => save("countings",      fn, "countings_v2"),
    setScheduledDates: fn => save("scheduledDates", fn),
    setAppPass:        v  => { DB.set("appPass",  v); setState(p => ({ ...p, appPass:  v })); },
    setPassHint:       v  => { DB.set("passHint", v); setState(p => ({ ...p, passHint: v })); },
    setWhatsapp:       v  => { DB.set("whatsapp", v); setState(p => ({ ...p, whatsapp: v })); },
  };
}

// ── SHARED UI ────────────────────────────────────────────────
function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.75)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9999, padding:20, fontFamily:T.fontBase }}>
      <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:"24px 20px", width:"100%", maxWidth:320, boxShadow:"0 20px 60px rgba(0,0,0,.5)" }}>
        <div style={{ fontSize:28, textAlign:"center", marginBottom:12 }}>⚠️</div>
        <div style={{ fontSize:T.fs14, color:T.text, textAlign:"center", lineHeight:1.6, marginBottom:20 }}>{message}</div>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onCancel}  style={{ flex:1, background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:11, color:T.textSub, fontSize:T.fs13, fontWeight:600, cursor:"pointer", fontFamily:T.fontBase }}>Cancelar</button>
          <button onClick={onConfirm} style={{ flex:1, background:T.red,     border:"none",                  borderRadius:10, padding:11, color:"#fff",    fontSize:T.fs13, fontWeight:700, cursor:"pointer", fontFamily:T.fontBase }}>Excluir</button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ item, counted }) {
  const st = getStatus(item, counted);
  if (!st) return null;
  return <span style={{ display:"inline-flex", alignItems:"center", padding:"2px 8px", borderRadius:5, fontSize:T.fs10, fontWeight:700, background:st.color+"1a", color:st.color, fontFamily:T.fontMono, letterSpacing:.5, border:`1px solid ${st.color}33` }}>{st.label}</span>;
}

function StockBar({ item, counted }) {
  if (counted === undefined || counted === null || !item.max) return null;
  const pct   = Math.min((counted / item.max) * 100, 100);
  const color = counted <= item.min ? T.red : counted > item.max ? T.purple : T.green;
  return (
    <div style={{ marginTop:6 }}>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:T.fs10, color:T.textMuted, marginBottom:3 }}>
        <span>0</span><span style={{ color:T.red }}>Mín {item.min}</span><span style={{ color:T.green }}>Máx {item.max}</span>
      </div>
      <div style={{ height:6, background:T.surface, borderRadius:4, position:"relative" }}>
        {item.min && <div style={{ position:"absolute", left:`${(item.min/item.max)*100}%`, top:0, bottom:0, width:2, background:T.red+"88", borderRadius:2 }}/>}
        <div style={{ height:"100%", width:`${pct}%`, background:color, borderRadius:4, transition:"width .4s" }}/>
      </div>
      <div style={{ fontSize:T.fs10, color, fontWeight:600, marginTop:2 }}>{counted} / {item.max}</div>
    </div>
  );
}

const S = {
  card:  (x = {}) => ({ background:T.card,    border:`1px solid ${T.border}`, borderRadius:12, padding:"14px 16px", ...x }),
  btn:   (bg = T.accent, full = false, sm = false) => ({ background:bg, border:"none", borderRadius:sm?8:10, padding:sm?"7px 12px":"10px 16px", color:bg===T.yellow?"#000":"#fff", fontWeight:600, fontSize:sm?T.fs11:T.fs13, cursor:"pointer", fontFamily:T.fontBase, width:full?"100%":"auto", display:"inline-flex", alignItems:"center", justifyContent:"center", gap:6, letterSpacing:.2 }),
  input: (x = {}) => ({ width:"100%", background:T.surface, border:`1.5px solid ${T.border}`, borderRadius:10, padding:"10px 13px", color:T.text, fontSize:T.fs13, outline:"none", boxSizing:"border-box", fontFamily:T.fontBase, ...x }),
  label: { fontSize:T.fs11, color:T.textSub, marginBottom:5, fontWeight:600, letterSpacing:.3, textTransform:"uppercase" },
  tag:   color => ({ display:"inline-flex", alignItems:"center", padding:"2px 8px", borderRadius:5, fontSize:T.fs10, fontWeight:700, background:color+"1a", color, fontFamily:T.fontMono, letterSpacing:.5, border:`1px solid ${color}33` }),
  mono:  { fontFamily:T.fontMono },
  sectionTitle: { fontSize:T.fs14, fontWeight:700, color:T.text, marginBottom:14 },
};

// ════════════════════════════════════════════════════════════
// SCREENS
// ════════════════════════════════════════════════════════════

function HomeScreen({ onManager, onCounter, scheduledDates }) {
  const upcoming = (scheduledDates || []).filter(sd => !sd.done && daysUntil(sd.date) >= 0 && daysUntil(sd.date) <= 7).sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div style={{ minHeight:"100vh", background:T.bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24, fontFamily:T.fontBase, position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", inset:0, pointerEvents:"none" }}>
        <div style={{ position:"absolute", top:"-15%", left:"-25%", width:500, height:500, borderRadius:"50%", background:`radial-gradient(circle,${T.accent}09 0%,transparent 65%)` }}/>
        <div style={{ position:"absolute", bottom:"-10%", right:"-20%", width:400, height:400, borderRadius:"50%", background:`radial-gradient(circle,${T.warm}07 0%,transparent 65%)` }}/>
      </div>
      <div style={{ position:"relative", width:"100%", maxWidth:380 }}>
        <div style={{ textAlign:"center", marginBottom:40 }}>
          <div style={{ width:64, height:64, background:`linear-gradient(135deg,${T.accent},${T.accentDim})`, borderRadius:18, display:"flex", alignItems:"center", justifyContent:"center", fontSize:30, margin:"0 auto 16px", boxShadow:`0 8px 24px ${T.accent}30` }}>📦</div>
          <div style={{ fontFamily:T.fontMono, fontSize:T.fs24, fontWeight:700, color:T.text, letterSpacing:2 }}>ESTOQUE</div>
          <div style={{ fontFamily:T.fontMono, fontSize:T.fs11, color:T.accent, letterSpacing:4, marginTop:4, textTransform:"uppercase" }}>Gestão de Contagens</div>
        </div>
        {upcoming.length > 0 && (
          <div style={{ ...S.card({ marginBottom:16, background:T.yellow+"0d", border:`1px solid ${T.yellow}30` }) }}>
            <div style={{ fontSize:T.fs11, fontWeight:700, color:T.yellow, marginBottom:8, letterSpacing:.5, textTransform:"uppercase" }}>⏰ Próximas Contagens</div>
            {upcoming.map(sd => { const d = daysUntil(sd.date); return <div key={sd.id} style={{ fontSize:T.fs13, color:T.text, marginBottom:4 }}><span style={{ color:T.yellow, fontWeight:600 }}>{sd.label}</span> — {d === 0 ? "HOJE" : `em ${d} dia${d !== 1 ? "s" : ""}`} <span style={{ color:T.textMuted }}>({fmtDate(sd.date)})</span></div>; })}
          </div>
        )}
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <button onClick={onCounter} style={{ background:`linear-gradient(135deg,${T.accentDim}22,${T.accent}11)`, border:`1.5px solid ${T.accent}35`, borderRadius:14, padding:"20px", cursor:"pointer", fontFamily:T.fontBase, display:"flex", alignItems:"center", gap:14, textAlign:"left", width:"100%" }}>
            <div style={{ width:48, height:48, background:`linear-gradient(135deg,${T.accent},${T.accentDim})`, borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>🧮</div>
            <div><div style={{ fontFamily:T.fontMono, fontSize:T.fs14, fontWeight:700, color:T.accent, letterSpacing:1 }}>ÁREA DO CONTADOR</div><div style={{ fontSize:T.fs12, color:T.textMuted, marginTop:3 }}>Acesso livre · Preencha as quantidades</div></div>
          </button>
          <button onClick={onManager} style={{ background:`linear-gradient(135deg,${T.warmDim}22,${T.warm}11)`, border:`1.5px solid ${T.warm}35`, borderRadius:14, padding:"20px", cursor:"pointer", fontFamily:T.fontBase, display:"flex", alignItems:"center", gap:14, textAlign:"left", width:"100%" }}>
            <div style={{ width:48, height:48, background:`linear-gradient(135deg,${T.warm},${T.warmDim})`, borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>🔐</div>
            <div><div style={{ fontFamily:T.fontMono, fontSize:T.fs14, fontWeight:700, color:T.warm, letterSpacing:1 }}>ÁREA DO GERENTE</div><div style={{ fontSize:T.fs12, color:T.textMuted, marginTop:3 }}>Acesso protegido por senha</div></div>
          </button>
        </div>
      </div>
    </div>
  );
}

function ManagerLogin({ onLogin, onBack, appPass, passHint }) {
  const [pw, setPw]             = useState("");
  const [err, setErr]           = useState("");
  const [show, setShow]         = useState(false);
  const [showHint, setShowHint] = useState(false);
  const submit = () => { if (pw === appPass) onLogin(); else { setErr("Senha incorreta."); setPw(""); } };
  
