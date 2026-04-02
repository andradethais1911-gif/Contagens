import { useState, useEffect, useCallback, useRef } from "react";

function injectFonts() {
  if (document.getElementById("app-fonts")) return;
  const l = document.createElement("link");
  l.id = "app-fonts";
  l.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap";
  l.rel = "stylesheet";
  document.head.appendChild(l);
}

const DB = {
  async get(k) {
    try {
      const r = await fetch(`/api/storage?key=${encodeURIComponent(k)}`);
      if (r.ok) {
        const j = await r.json();
        if (j.value) return JSON.parse(j.value);
      }
    } catch (e) {}
    const local = localStorage.getItem(k);
    return local ? JSON.parse(local) : null;
  },
  async set(k, v) {
    localStorage.setItem(k, JSON.stringify(v));
    try {
      await fetch("/api/storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: k, value: JSON.stringify(v) })
      });
    } catch (e) {}
  }
};

const T = {
  bg:"#080d14", surface:"#0f1621", card:"#111827", border:"#1e2d42",
  accent:"#3b82f6", accentDim:"#1d4ed8", green:"#22c55e", text:"#f1f5f9", textSub:"#94a3b8", textMuted:"#475569",
  fontBase:"'Inter',sans-serif", fontMono:"'JetBrains Mono',monospace",
  fs12:12, fs13:13, fs14:14, fs24:24
};

const fmtDate = s => { if(!s)return"—";const[y,m,d]=s.split("-");return`${d}/${m}/${y}`; };
const todayStr = () => new Date().toISOString().slice(0,10);
const normPhone = v => v.replace(/\D/g,"");

const S = {
  card: (x={}) => ({background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"14px 16px",...x}),
  btn:  (bg=T.accent,full=false) => ({background:bg,border:"none",borderRadius:10,padding:"12px 16px",color:"#fff",fontWeight:600,fontSize:T.fs13,cursor:"pointer",fontFamily:T.fontBase,width:full?"100%":"auto",display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6}),
  input:(x={}) => ({width:"100%",background:T.surface,border:`1.5px solid ${T.border}`,borderRadius:10,padding:"10px 13px",color:T.text,fontSize:T.fs13,outline:"none",boxSizing:"border-box",fontFamily:T.fontBase,...x}),
};

// --- WHATSAPP REVISADO ---
function sendWA(phone, counting, items) {
  const nomeContagemAlta = "CONTAGEM"; // Título fixo em Caixa Alta
  
  const lines = (counting.items || []).map(ci => {
    const it = items.find(i => i.id === ci.id) || ci;
    return `  • *${ci.name.toUpperCase()}*\n    Quantidade: ${ci.counted ?? 0} ${it.unit || ""}`;
  }).join("\n");

  const ab = (counting.items || []).filter(ci => {
    const it = items.find(i => i.id === ci.id) || ci;
    return it.min && ci.counted <= it.min;
  });

  const alertas = ab.length ? `\n\n⚠️ *Itens abaixo do mínimo:*\n${ab.map(ci => {
    const it = items.find(i => i.id === ci.id) || ci;
    return `  • ${ci.name.toUpperCase()}: *${ci.counted ?? 0}* (mín: ${it.min})`;
  }).join("\n")}` : "";

  const compras = (counting.items || []).filter(ci => {
    const it = items.find(i => i.id === ci.id) || ci;
    return it.min && ci.counted <= it.min;
  }).map(ci => {
    const it = items.find(i => i.id === ci.id) || ci;
    const alvo = it.max || (it.min * 2);
    const need = Math.max(alvo - ci.counted, 0);
    return `  • ${ci.name.toUpperCase()}: *+${need} ${it.unit || ""}*`;
  });

  const comprasMsg = compras.length ? `\n\n🛒 *Necessidade de compra:*\n${compras.join("\n")}` : "";

  const msg = `Olá, Teresa! 😁🌟\n\nEstou enviando o relatório da *${nomeContagemAlta}* feito hoje, dia ${fmtDate(counting.date)}.\n\n📋 *Quantidades contabilizadas:*\n${lines}${alertas}${comprasMsg}\n\n_Sistema de Gestão de Contagens_`;

  window.open(`https://wa.me/${normPhone(phone)}?text=${encodeURIComponent(msg)}`, '_blank');
}

export default function App() {
  const {items, whatsapp, loading, setCountings} = useAppData();
  const [view, setView] = useState("home");
  const [activeReport, setActiveReport] = useState(null);

  useEffect(() => { injectFonts(); }, []);

  if(loading) return <div style={{background:T.bg, color:"#fff", height:"100vh", display:"flex", alignItems:"center", justifyContent:"center"}}>Carregando...</div>;

  const onFinish = (data) => {
    setCountings(prev => [data, ...prev]);
    setActiveReport(data);
    if(whatsapp) {
      setTimeout(() => sendWA(whatsapp, data, items), 1000);
    }
  };

  return (
    <div style={{background:T.bg, minHeight:"100vh", color:T.text, fontFamily:T.fontBase}}>
      {activeReport && <ReportModal counting={activeReport} items={items} onClose={()=>setActiveReport(null)} />}
      
      {view === "home" && (
        <div style={{padding:40, textAlign:"center", display:"flex", flexDirection:"column", gap:20, alignItems:"center", justifyContent:"center", height:"80vh"}}>
          <div style={{fontSize:50}}>📦</div>
          <h2 style={{fontFamily:T.fontMono, letterSpacing:2}}>CONTROLE DE ESTOQUE</h2>
          <button onClick={()=>setView("counter")} style={S.btn(T.accent, true)}>INICIAR NOVA CONTAGEM</button>
        </div>
      )}

      {view === "counter" && (
        <CounterView 
          items={items} 
          onBack={()=>setView("home")} 
          onSubmit={onFinish}
        />
      )}
    </div>
  );
}

function CounterView({items, onBack, onSubmit}) {
  const [current, setCurrent] = useState(0);
  const [counts, setCounts] = useState({});
  const [confirmed, setConfirmed] = useState({});
  const [val, setVal] = useState("");

  const item = items[current];
  const isDone = confirmed[item?.id];

  const handleConfirm = () => {
    if(val === "") return;
    setCounts(p => ({...p, [item.id]: Number(val)}));
    setConfirmed(p => ({...p, [item.id]: true}));
  };

  const next = () => {
    setVal("");
    if(current < items.length - 1) setCurrent(c => c+1);
  };

  const finish = () => {
    onSubmit({
      id: Date.now(),
      label: "CONTAGEM",
      date: todayStr(),
      items: items.map(i => ({...i, counted: counts[i.id] || 0}))
    });
  };

  if(!items?.length) return <div style={{padding:40, textAlign:"center"}}>Nenhum insumo cadastrado.</div>;

  return (
    <div style={{padding:20, maxWidth:400, margin:"0 auto"}}>
      <button onClick={onBack} style={{background:"none", border:"none", color:T.textMuted, marginBottom:20, cursor:"pointer"}}>← VOLTAR</button>
      
      <div style={S.card({textAlign:"center", border: isDone ? `2px solid ${T.green}` : `2px solid ${T.accent}`})}>
        <div style={{fontSize:11, color:T.accent, fontWeight:700, marginBottom:10}}>ITEM {current + 1} DE {items.length}</div>
        <div style={{fontSize:22, fontWeight:800, marginBottom:5}}>{item.name.toUpperCase()}</div>
        <div style={{fontSize:14, color:T.textSub, marginBottom:25}}>{item.unit || "UNIDADE"}</div>

        {!isDone ? (
          <>
            <input 
              type="number" 
              inputMode="numeric"
              value={val} 
              onChange={e => setVal(e.target.value)} 
              placeholder="0"
              autoFocus
              style={S.input({fontSize:40, textAlign:"center", marginBottom:20, fontWeight:700})}
            />
            <button onClick={handleConfirm} style={S.btn(T.green, true)}>✓ VERIFICADO</button>
          </>
        ) : (
          <>
            <div style={{fontSize:48, fontWeight:800, color:T.green}}>{counts[item.id]}</div>
            <div style={{color:T.green, fontWeight:700, marginBottom:25, fontSize:12}}>QUANTIDADE REGISTRADA</div>
            
            {current < items.length - 1 ? (
              <button onClick={next} style={S.btn(T.accent, true)}>PRÓXIMO ITEM →</button>
            ) : (
              <button onClick={finish} style={S.btn("#f97316", true)}>FINALIZAR E ENVIAR</button>
            )}
            
            <button onClick={()=>setConfirmed(p=>({...p, [item.id]:false}))} style={{marginTop:20, background:"none", border:"none", color:T.textMuted, fontSize:11, cursor:"pointer", textDecoration:"underline"}}>CORRIGIR VALOR</button>
          </>
        )}
      </div>
    </div>
  );
}

function ReportModal({counting, items, onClose}) {
  const canvasRef = useRef();
  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv.getContext("2d");
    const list = counting.items || [];
    const W = 800;
    const rowH = 45;
    const H = 150 + (list.length * rowH) + 60;
    
    cv.width = W; cv.height = H;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0,0,W,H);
    ctx.fillStyle = "#0f172a"; ctx.fillRect(0,0,W,120);
    ctx.fillStyle = "#ffffff"; ctx.font = "bold 28px Arial"; ctx.fillText("CONTAGEM", 30, 50);
    ctx.font = "16px Arial"; ctx.fillStyle = "#94a3b8"; ctx.fillText(`DATA: ${fmtDate(counting.date)}`, 30, 85);
    
    let y = 120;
    ctx.fillStyle = "#f1f5f9"; ctx.fillRect(0, y, W, 40);
    ctx.fillStyle = "#475569"; ctx.font = "bold 13px Arial";
    ctx.fillText("INSUMO", 30, y+25); ctx.fillText("UNIDADE", 350, y+25); ctx.fillText("CONTABILIZADO", 550, y+25);
    
    y += 40;
    list.forEach((ci, i) => {
        const it = items.find(item => item.id === ci.id) || ci;
        ctx.fillStyle = i % 2 === 0 ? "#ffffff" : "#f8fafc";
        ctx.fillRect(0, y, W, rowH);
        ctx.fillStyle = "#1e293b"; ctx.font = "bold 14px Arial";
        ctx.fillText(ci.name.toUpperCase(), 30, y + 28);
        ctx.font = "14px Arial"; ctx.fillStyle = "#64748b";
        ctx.fillText(it.unit || "UN", 350, y + 28);
        ctx.fillStyle = "#0f172a"; ctx.font = "bold 16px Arial";
        ctx.fillText(String(ci.counted ?? 0), 550, y + 28);
        y += rowH;
    });
  }, [counting, items]);

  return (
    <div style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:20}}>
      <div style={{background:"#fff", padding:15, borderRadius:12, maxWidth:850, width:"100%"}}>
        <canvas ref={canvasRef} style={{width:"100%", height:"auto", borderRadius:8, border:"1px solid #ddd"}} />
        <div style={{display:"flex", gap:10, marginTop:15}}>
          <button onClick={() => {
            const a = document.createElement("a");
            a.download = `CONTAGEM_${counting.date}.png`;
            a.href = canvasRef.current.toDataURL();
            a.click();
          }} style={S.btn("#22c55e", true)}>⬇️ BAIXAR IMAGEM</button>
          <button onClick={onClose} style={S.btn("#64748b", true)}>FECHAR</button>
        </div>
      </div>
    </div>
  );
}

function useAppData() {
  const [state,setState] = useState({items:[],countings:[],whatsapp:null});
  const [loading,setLoading] = useState(true);
  
  const reload = useCallback(async()=>{
    const [items,countings,whatsapp] = await Promise.all([
      DB.get("items_v2"), DB.get("countings_v2"), DB.get("whatsapp")
    ]);
    setState({items:items||[], countings:countings||[], whatsapp:whatsapp||null});
    setLoading(false);
  },[]);

  useEffect(()=>{ reload(); },[reload]);

  return {
    ...state, loading,
    setItems: v => { DB.set("items_v2", v); setState(p => ({...p, items: v})); },
    setCountings: v => { 
        const next = typeof v === 'function' ? v(state.countings) : v;
        DB.set("countings_v2", next); 
        setState(p => ({...p, countings: next})); 
    },
    setWhatsapp: v => { DB.set("whatsapp", v); setState(p => ({...p, whatsapp: v})); }
  };
}
