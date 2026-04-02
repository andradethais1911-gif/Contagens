import { useState, useEffect, useCallback, useRef } from "react";

// --- UTILITÁRIOS E ESTILOS ---
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

const DEFAULT_PASS = "Teresa";
const UNITS = ["Unidade","Kg","Pacote","Caixa","Litro","Metro","Dúzia"];

const T = {
  bg:"#080d14", surface:"#0f1621", card:"#111827", border:"#1e2d42",
  accent:"#3b82f6", accentDim:"#1d4ed8", warm:"#f97316", warmDim:"#c2410c",
  green:"#22c55e", greenDim:"#15803d", red:"#ef4444", yellow:"#eab308", purple:"#8b5cf6",
  text:"#f1f5f9", textSub:"#94a3b8", textMuted:"#475569",
  fontBase:"'Inter',sans-serif", fontMono:"'JetBrains Mono',monospace",
  fs10:10,fs11:11,fs12:12,fs13:13,fs14:14,fs15:15,fs16:16,fs18:18,fs20:20,fs24:24
};

const daysUntil = s => { const n=new Date();n.setHours(0,0,0,0);const d=new Date(s+"T00:00:00");d.setHours(0,0,0,0);return Math.round((d-n)/86400000); };
const fmtDate = s => { if(!s)return"—";const[y,m,d]=s.split("-");return`${d}/${m}/${y}`; };
const todayStr = () => new Date().toISOString().slice(0,10);
const normPhone = v => v.replace(/\D/g,"");

function getStatus(item, counted) {
  if (counted===undefined||counted===null) return null;
  if (item.min && counted<=item.min) return {label:"ABAIXO DO MÍNIMO",color:T.red,level:"danger"};
  return {label:"OK",color:T.green,level:"ok"};
}

const S = {
  card: (x={}) => ({background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"14px 16px",...x}),
  btn:  (bg=T.accent,full=false,sm=false) => ({background:bg,border:"none",borderRadius:sm?8:10,padding:sm?"7px 12px":"10px 16px",color:bg===T.yellow?"#000":"#fff",fontWeight:600,fontSize:sm?T.fs11:T.fs13,cursor:"pointer",fontFamily:T.fontBase,width:full?"100%":"auto",display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6}),
  input:(x={}) => ({width:"100%",background:T.surface,border:`1.5px solid ${T.border}`,borderRadius:10,padding:"10px 13px",color:T.text,fontSize:T.fs13,outline:"none",boxSizing:"border-box",fontFamily:T.fontBase,...x}),
  label:{fontSize:T.fs11,color:T.textSub,marginBottom:5,fontWeight:600,letterSpacing:.3,textTransform:"uppercase"},
  tag:  color=>({display:"inline-flex",alignItems:"center",padding:"2px 8px",borderRadius:5,fontSize:T.fs10,fontWeight:700,background:color+"1a",color,fontFamily:T.fontMono,border:`1px solid ${color}33`}),
};

// --- WHATSAPP ---
function sendWA(phone, counting, items) {
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

  const msg = `Olá, Teresa! 😁🌟\n\nEstou enviando o relatório da *CONTAGEM* feito hoje, dia ${fmtDate(counting.date)}.\n\n📋 *Quantidades contabilizadas:*\n${lines}${alertas}${comprasMsg}`;

  window.open(`https://wa.me/${normPhone(phone)}?text=${encodeURIComponent(msg)}`, '_blank');
}

// --- COMPONENTES ---

function HomeScreen({onCounter, onManager, scheduledDates}) {
  const next = [...scheduledDates].filter(d=>daysUntil(d)>=0).sort()[0];
  return (
    <div style={{padding:24, maxWidth:480, margin:"0 auto"}}>
      <header style={{textAlign:"center", padding:"40px 0"}}>
        <div style={{fontSize:48, marginBottom:16}}>📦</div>
        <h1 style={{fontSize:T.fs24, fontWeight:800, letterSpacing:"-0.02em", marginBottom:8}}>ESTOQUE PRO</h1>
        <p style={{color:T.textSub, fontSize:T.fs14}}>Gestão Simplificada de Insumos</p>
      </header>

      {next && (
        <div style={S.card({marginBottom:24, background:T.accent+"10", borderColor:T.accent+"30", textAlign:"center"})}>
          <div style={{fontSize:T.fs11, fontWeight:700, color:T.accent, marginBottom:4}}>PRÓXIMA CONTAGEM AGENDADA</div>
          <div style={{fontSize:T.fs20, fontWeight:800}}>{fmtDate(next)}</div>
          <div style={{fontSize:T.fs12, color:T.textSub, marginTop:4}}>Faltam {daysUntil(next)} dias</div>
        </div>
      )}

      <div style={{display:"flex", flexDirection:"column", gap:16}}>
        <button onClick={onCounter} style={S.btn(T.accent, true)}>
          <span style={{fontSize:20}}>📝</span> INICIAR CONTAGEM DIÁRIA
        </button>
        <button onClick={onManager} style={S.btn(T.surface, true)}>
          <span style={{fontSize:20}}>🔑</span> ACESSO DO GERENTE
        </button>
      </div>
    </div>
  );
}

function ManagerLogin({onBack, onLogin, appPass, passHint}) {
  const [val, setVal] = useState("");
  const [err, setErr] = useState(false);
  const handle = () => {
    if(val === (appPass || DEFAULT_PASS)) onLogin();
    else { setErr(true); setTimeout(()=>setErr(false), 2000); }
  };
  return (
    <div style={{padding:24, maxWidth:360, margin:"0 auto", textAlign:"center"}}>
      <button onClick={onBack} style={{background:"none", border:"none", color:T.textSub, cursor:"pointer", marginBottom:40}}>← Voltar</button>
      <div style={{fontSize:40, marginBottom:20}}>🔒</div>
      <h2 style={{marginBottom:8}}>Área do Gerente</h2>
      <p style={{color:T.textSub, fontSize:T.fs13, marginBottom:24}}>Digite a senha de acesso</p>
      <input type="password" value={val} onChange={e=>setVal(e.target.value)} style={S.input({textAlign:"center", fontSize:20, borderColor:err?T.red:T.border})} placeholder="••••••" />
      {passHint && <div style={{fontSize:T.fs11, color:T.textMuted, marginTop:12}}>Dica: {passHint}</div>}
      <button onClick={handle} style={S.btn(T.accent, true, false, {marginTop:24})}>ENTRAR NO PAINEL</button>
    </div>
  );
}

function CounterView({items, onBack, onSubmit, whatsapp}) {
  const [current, setCurrent] = useState(0);
  const [counts, setCounts] = useState({});
  const [confirmed, setConfirmed] = useState({});
  const [val, setVal] = useState("");

  if(!items.length) return <div style={{padding:40, textAlign:"center"}}>Nenhum insumo cadastrado.</div>;

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

  return (
    <div style={{padding:20, maxWidth:400, margin:"0 auto"}}>
      <button onClick={onBack} style={{background:"none", border:"none", color:T.textMuted, marginBottom:20, cursor:"pointer"}}>← VOLTAR</button>
      
      <div style={S.card({textAlign:"center", border: isDone ? `2px solid ${T.green}` : `2px solid ${T.accent}`})}>
        <div style={{fontSize:11, color:T.accent, fontWeight:700, marginBottom:10}}>ITEM {current + 1} DE {items.length}</div>
        <div style={{fontSize:22, fontWeight:800, marginBottom:5}}>{item.name.toUpperCase()}</div>
        <div style={{fontSize:14, color:T.textSub, marginBottom:25}}>{item.unit || "UNIDADE"}</div>

        {!isDone ? (
          <>
            <input type="number" inputMode="numeric" value={val} onChange={e => setVal(e.target.value)} placeholder="0" autoFocus style={S.input({fontSize:40, textAlign:"center", marginBottom:20, fontWeight:700})} />
            <button onClick={handleConfirm} style={S.btn(T.green, true)}>✓ VERIFICADO</button>
          </>
        ) : (
          <>
            <div style={{fontSize:48, fontWeight:800, color:T.green}}>{counts[item.id]}</div>
            <div style={{color:T.green, fontWeight:700, marginBottom:25, fontSize:12}}>CONFERIDO</div>
            {current < items.length - 1 ? (
              <button onClick={next} style={S.btn(T.accent, true)}>PRÓXIMO ITEM →</button>
            ) : (
              <button onClick={finish} style={S.btn(T.warm, true)}>FINALIZAR E ENVIAR</button>
            )}
            <button onClick={()=>setConfirmed(p=>({...p, [item.id]:false}))} style={{marginTop:20, background:"none", border:"none", color:T.textMuted, fontSize:11, cursor:"pointer"}}>CORRIGIR</button>
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
        ctx.fillStyle = i % 2 === 0 ? "#ffffff" : "#f8fafc"; ctx.fillRect(0, y, W, rowH);
        ctx.fillStyle = "#1e293b"; ctx.font = "bold 14px Arial"; ctx.fillText(ci.name.toUpperCase(), 30, y + 28);
        ctx.font = "14px Arial"; ctx.fillStyle = "#64748b"; ctx.fillText(it.unit || "UN", 350, y + 28);
        ctx.fillStyle = "#0f172a"; ctx.font = "bold 16px Arial"; ctx.fillText(String(ci.counted ?? 0), 550, y + 28);
        y += rowH;
    });
  }, [counting, items]);

  return (
    <div style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:20}}>
      <div style={{background:"#fff", padding:15, borderRadius:12, maxWidth:850, width:"100%", maxHeight:"90vh", overflowY:"auto"}}>
        <canvas ref={canvasRef} style={{width:"100%", height:"auto", borderRadius:8, border:"1px solid #ddd"}} />
        <div style={{display:"flex", gap:10, marginTop:15}}>
          <button onClick={() => {
            const a = document.createElement("a");
            a.download = `CONTAGEM_${counting.date}.png`;
            a.href = canvasRef.current.toDataURL();
            a.click();
          }} style={S.btn(T.green, true)}>⬇️ BAIXAR IMAGEM</button>
          <button onClick={onClose} style={S.btn(T.textSub, true)}>FECHAR</button>
        </div>
      </div>
    </div>
  );
}

// --- PAINEL DO GERENTE ---

function ManagerDashboard({items, countings, scheduledDates, whatsapp, appPass, passHint, onBack, setItems, setCountings, setScheduledDates, setWhatsapp, setAppPass, setPassHint}) {
  const [tab, setTab] = useState("items");
  const [editingItem, setEditingItem] = useState(null);

  const addItem = (e) => {
    e.preventDefault();
    const d = new FormData(e.target);
    const newItem = {
      id: Date.now(),
      name: d.get("name"),
      unit: d.get("unit"),
      min: Number(d.get("min")),
      max: Number(d.get("max")),
    };
    setItems([...items, newItem]);
    e.target.reset();
  };

  return (
    <div style={{maxWidth:1000, margin:"0 auto", padding:20}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:30}}>
        <h2 style={{fontFamily:T.fontMono}}>PAINEL GERENCIAL</h2>
        <button onClick={onBack} style={S.btn(T.surface, false, true)}>SAIR</button>
      </div>

      <nav style={{display:"flex", gap:8, marginBottom:24, overflowX:"auto", paddingBottom:8}}>
        <button onClick={()=>setTab("items")} style={S.btn(tab==="items"?T.accent:T.surface, false, true)}>INSUMOS</button>
        <button onClick={()=>setTab("history")} style={S.btn(tab==="history"?T.accent:T.surface, false, true)}>HISTÓRICO</button>
        <button onClick={()=>setTab("config")} style={S.btn(tab==="config"?T.accent:T.surface, false, true)}>CONFIGS</button>
      </nav>

      {tab === "items" && (
        <div style={{display:"grid", gridTemplateColumns:window.innerWidth>768?"1fr 350px":"1fr", gap:24}}>
          <div>
            <h3 style={{marginBottom:16, fontSize:T.fs14}}>ITENS CADASTRADOS ({items.length})</h3>
            <div style={{display:"flex", flexDirection:"column", gap:10}}>
              {items.map(it => (
                <div key={it.id} style={S.card({display:"flex", justifyContent:"space-between", alignItems:"center"})}>
                  <div>
                    <div style={{fontWeight:700}}>{it.name.toUpperCase()}</div>
                    <div style={{fontSize:T.fs11, color:T.textSub}}>{it.unit} • Mín: {it.min} / Max: {it.max}</div>
                  </div>
                  <button onClick={()=>setItems(items.filter(i=>i.id!==it.id))} style={{background:"none", border:"none", color:T.red, cursor:"pointer"}}>Excluir</button>
                </div>
              ))}
            </div>
          </div>
          <div style={S.card({height:"fit-content"})}>
            <h3 style={{marginBottom:16, fontSize:T.fs14}}>NOVO INSUMO</h3>
            <form onSubmit={addItem} style={{display:"flex", flexDirection:"column", gap:12}}>
              <div><label style={S.label}>Nome</label><input name="name" required style={S.input()} placeholder="Ex: Carne Moída" /></div>
              <div><label style={S.label}>Unidade</label>
                <select name="unit" style={S.input()}>{UNITS.map(u=><option key={u} value={u}>{u}</option>)}</select>
              </div>
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
                <div><label style={S.label}>Estoque Mín</label><input name="min" type="number" required style={S.input()} /></div>
                <div><label style={S.label}>Estoque Max</label><input name="max" type="number" required style={S.input()} /></div>
              </div>
              <button type="submit" style={S.btn(T.green, true)}>CADASTRAR ITEM</button>
            </form>
          </div>
        </div>
      )}

      {tab === "history" && (
        <div style={{display:"flex", flexDirection:"column", gap:12}}>
          {countings.map(c => (
            <div key={c.id} style={S.card({display:"flex", justifyContent:"space-between", alignItems:"center"})}>
              <div>
                <div style={{fontWeight:700}}>{c.label} - {fmtDate(c.date)}</div>
                <div style={{fontSize:T.fs11, color:T.textSub}}>{c.items.length} itens conferidos</div>
              </div>
              <button onClick={()=>sendWA(whatsapp, c, items)} style={S.btn(T.green, false, true)}>REENVIAR WHATSAPP</button>
            </div>
          ))}
        </div>
      )}

      {tab === "config" && (
        <div style={{maxWidth:500, display:"flex", flexDirection:"column", gap:24}}>
          <div style={S.card()}>
            <h3 style={{marginBottom:16}}>WhatsApp de Relatórios</h3>
            <input value={whatsapp||""} onChange={e=>setWhatsapp(e.target.value)} placeholder="55869..." style={S.input()} />
            <p style={{fontSize:T.fs11, color:T.textMuted, marginTop:8}}>Inclua o DDD. Ex: 5586999999999</p>
          </div>
          <div style={S.card()}>
            <h3 style={{marginBottom:16}}>Senha do Gerente</h3>
            <input value={appPass||""} onChange={e=>setAppPass(e.target.value)} placeholder="Senha Atual" style={S.input({marginBottom:10})} />
            <input value={passHint||""} onChange={e=>setPassHint(e.target.value)} placeholder="Dica da senha" style={S.input()} />
          </div>
          <div style={S.card()}>
            <h3 style={{marginBottom:16}}>Agendar Próxima Contagem</h3>
            <input type="date" onChange={e=>{
              if(e.target.value) setScheduledDates([...scheduledDates, e.target.value]);
            }} style={S.input()} />
            <div style={{marginTop:10, display:"flex", flexWrap:"wrap", gap:5}}>
              {scheduledDates.map(d=><span key={d} style={S.tag(T.accent)}>{fmtDate(d)}</span>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- APP CORE ---

export default function App() {
  const {items, countings, scheduledDates, appPass, passHint, whatsapp, loading, setItems, setCountings, setScheduledDates, setAppPass, setPassHint, setWhatsapp} = useAppData();
  const [view, setView] = useState("home");
  const [activeCounting, setActiveCounting] = useState(null);

  useEffect(() => { injectFonts(); }, []);

  if (loading) return <div style={{background:T.bg, height:"100vh", display:"flex", alignItems:"center", justifyContent:"center", color:T.text}}>Carregando...</div>;

  const handleFinishCounting = (data) => {
    setCountings(prev => [data, ...prev]);
    setActiveCounting(data);
    if(whatsapp) setTimeout(() => sendWA(whatsapp, data, items), 1000);
  };

  return (
    <div style={{background:T.bg, minHeight:"100vh", color:T.text, fontFamily:T.fontBase, overflowX:"hidden"}}>
      {activeCounting && <ReportModal counting={activeCounting} items={items} onClose={()=>setActiveCounting(null)} />}
      
      {view === "home" && <HomeScreen onCounter={()=>setView("counter")} onManager={()=>setView("manager_login")} scheduledDates={scheduledDates} />}
      
      {view === "manager_login" && <ManagerLogin appPass={appPass} passHint={passHint} onBack={()=>setView("home")} onLogin={()=>setView("manager_dashboard")} />}

      {view === "manager_dashboard" && (
        <ManagerDashboard 
          items={items} countings={countings} scheduledDates={scheduledDates} whatsapp={whatsapp} appPass={appPass} passHint={passHint}
          onBack={()=>setView("home")} setItems={setItems} setCountings={setCountings} setScheduledDates={setScheduledDates} setWhatsapp={setWhatsapp} setAppPass={setAppPass} setPassHint={setPassHint}
        />
      )}

      {view === "counter" && (
        <CounterView items={items} whatsapp={whatsapp} onBack={()=>setView("home")} onSubmit={handleFinishCounting} />
      )}
    </div>
  );
}

function useAppData() {
  const [state,setState] = useState({items:[],countings:[],scheduledDates:[],appPass:DEFAULT_PASS,passHint:"",whatsapp:null});
  const [loading,setLoading] = useState(true);
  const reload = useCallback(async()=>{
    const [i,c,d,p,h,w] = await Promise.all([
      DB.get("items_v2"),DB.get("countings_v2"),DB.get("scheduled_v2"),DB.get("pass_v2"),DB.get("hint_v2"),DB.get("wa_v2")
    ]);
    setState({items:i||[],countings:c||[],scheduledDates:d||[],appPass:p||DEFAULT_PASS,passHint:h||"",whatsapp:w||null});
    setLoading(false);
  },[]);
  useEffect(()=>{reload();},[reload]);
  const s = (k,v,dbk)=>setState(prev=>{
    const n = typeof v==="function"?v(prev[k]):v;
    DB.set(dbk,n); return{...prev,[k]:n};
  });
  return{...state,loading,
    setItems:v=>s("items",v,"items_v2"),
    setCountings:v=>s("countings",v,"countings_v2"),
    setScheduledDates:v=>s("scheduledDates",v,"scheduled_v2"),
    setAppPass:v=>s("appPass",v,"pass_v2"),
    setPassHint:v=>s("passHint",v,"hint_v2"),
    setWhatsapp:v=>s("whatsapp",v,"wa_v2")
  };
}
