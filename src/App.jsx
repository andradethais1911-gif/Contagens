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
      if (!r.ok) return null;
      const j = await r.json();
      if (j.value === null || j.value === undefined) return null;
      return typeof j.value === "string" ? JSON.parse(j.value) : j.value;
    } catch { return null; }
  },
  async set(k, v) {
    try {
      await fetch("/api/storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: k, value: JSON.stringify(v) })
      });
    } catch {}
  }
};

const DEFAULT_PASS = "Teresa";
const UNITS = ["Unidade(s)","Kg","Pacote(s)","Caixa(s)","Litro(s)","Metro(s)","Dúzia(s)"];

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
const fmtCur = v => Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const upper = s => s.toUpperCase();

function getStatus(item, counted) {
  if (counted===undefined||counted===null) return null;
  if (item.min && item.max) {
    if (counted < item.min) return {label:"ABAIXO DO MÍNIMO",color:T.red,level:"danger"};
    if (counted > item.max) return {label:"ACIMA DO MÁXIMO",color:T.purple,level:"over"};
    return {label:"DENTRO DO INTERVALO",color:T.green,level:"ok"};
  }
  if (item.min && counted < item.min) return {label:"ABAIXO DO MÍNIMO",color:T.red,level:"danger"};
  if (item.max && counted > item.max) return {label:"ACIMA DO MÁXIMO",color:T.purple,level:"over"};
  return {label:"OK",color:T.green,level:"ok"};
}

// Compute total acquired qty for an item (base + all purchase records)
function getTotalAcquired(item) {
  const base = Number(item.acquiredQty||0);
  const purchases = (item.purchases||[]).reduce((s,p)=>s+Number(p.qty||0),0);
  return base + purchases;
}

// Get current qty = last validated counting qty, or total acquired if none
function getCurrentQty(item, lastCountingItems) {
  if (!lastCountingItems) return getTotalAcquired(item);
  const ci = lastCountingItems.find(c=>c.id===item.id);
  if (ci && ci.validated) return Number(ci.counted||0);
  return getTotalAcquired(item);
}

const S = {
  card: (x={}) => ({background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"14px 16px",...x}),
  btn:  (bg=T.accent,full=false,sm=false) => ({background:bg,border:"none",borderRadius:sm?8:10,padding:sm?"7px 12px":"10px 16px",color:bg===T.yellow?"#000":"#fff",fontWeight:600,fontSize:sm?T.fs11:T.fs13,cursor:"pointer",fontFamily:T.fontBase,width:full?"100%":"auto",display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6}),
  input:(x={}) => ({width:"100%",background:T.surface,border:`1.5px solid ${T.border}`,borderRadius:10,padding:"10px 13px",color:T.text,fontSize:T.fs13,outline:"none",boxSizing:"border-box",fontFamily:T.fontBase,...x}),
  label:{fontSize:T.fs11,color:T.textSub,marginBottom:5,fontWeight:600,letterSpacing:.3,textTransform:"uppercase"},
  tag:  color=>({display:"inline-flex",alignItems:"center",padding:"2px 8px",borderRadius:5,fontSize:T.fs10,fontWeight:700,background:color+"1a",color,fontFamily:T.fontMono,border:`1px solid ${color}33`}),
  mono: {fontFamily:"'JetBrains Mono',monospace"},
  sec:  {fontSize:T.fs14,fontWeight:700,color:T.text,marginBottom:14}
};

function ConfirmModal({message,onConfirm,onCancel}) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:20,fontFamily:T.fontBase}}>
      <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:"24px 20px",width:"100%",maxWidth:320}}>
        <div style={{fontSize:28,textAlign:"center",marginBottom:12}}>⚠️</div>
        <div style={{fontSize:T.fs14,color:T.text,textAlign:"center",lineHeight:1.6,marginBottom:20}}>{message}</div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onCancel} style={{flex:1,background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:11,color:T.textSub,fontSize:T.fs13,fontWeight:600,cursor:"pointer",fontFamily:T.fontBase}}>Cancelar</button>
          <button onClick={onConfirm} style={{flex:1,background:T.red,border:"none",borderRadius:10,padding:11,color:"#fff",fontSize:T.fs13,fontWeight:700,cursor:"pointer",fontFamily:T.fontBase}}>Excluir</button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({item,counted}) {
  const st = getStatus(item,counted);
  if(!st) return null;
  return <span style={S.tag(st.color)}>{st.label}</span>;
}

function ReportModal({counting,items,onClose}) {
  const canvasRef = useRef();
  const [rendered,setRendered] = useState(false);
  useEffect(()=>{
    const canvas=canvasRef.current; if(!canvas)return;
    const ctx=canvas.getContext("2d");
    const W=800,rowH=38,hH=120,thH=36;
    const list=counting.items||[];
    const H=hH+thH+list.length*rowH+110+40+30;
    canvas.width=W;canvas.height=H;
    ctx.fillStyle="#f8faff";ctx.fillRect(0,0,W,H);
    ctx.fillStyle="#0a1e3c";ctx.fillRect(0,0,W,hH);
    ctx.fillStyle="#3b82f6";ctx.fillRect(0,hH-3,W,3);
    ctx.fillStyle="#fff";ctx.font="bold 22px Arial";ctx.fillText("RELATÓRIO DE CONTAGEM",32,42);
    ctx.font="15px Arial";ctx.fillStyle="#93c5fd";ctx.fillText(counting.label,32,68);
    ctx.font="13px Arial";ctx.fillStyle="#64748b";
    ctx.fillText(`Data: ${fmtDate(counting.date)}`,32,90);
    ctx.fillText(`Gerado: ${new Date().toLocaleString("pt-BR")}`,32,110);
    let y=hH;
    const cols=[{l:"Insumo",x:32},{l:"Unidade",x:220},{l:"Qtd Contabilizada",x:310},{l:"Mínimo",x:450},{l:"Máximo",x:520},{l:"Status",x:595},{l:"Compra Necessária",x:710}];
    ctx.fillStyle="#0a1e3c";ctx.fillRect(0,y,W,thH);
    ctx.font="bold 11px Arial";ctx.fillStyle="#bfdbfe";
    cols.forEach(c=>ctx.fillText(c.l,c.x,y+23));
    y+=thH;
    list.forEach((ci,idx)=>{
      const it=items.find(i=>i.id===ci.id)||ci;
      const st=getStatus(it,ci.counted);
      const need=it.min&&ci.counted<it.min?(it.max?Math.max(it.max-ci.counted,0):Math.max(it.min-ci.counted+it.min,0)):0;
      ctx.fillStyle=idx%2===0?"#fff":"#f0f5ff";ctx.fillRect(0,y,W,rowH);
      ctx.strokeStyle="#dbe8f8";ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(0,y+rowH);ctx.lineTo(W,y+rowH);ctx.stroke();
      ctx.font="600 12px Arial";ctx.fillStyle="#1e293b";ctx.fillText(String(ci.name||it.name||"").slice(0,26),32,y+24);
      ctx.font="12px Arial";ctx.fillStyle="#475569";
      ctx.fillText(it.unit||"—",220,y+24);
      ctx.font="bold 13px Arial";ctx.fillStyle="#1d4ed8";ctx.fillText(String(ci.counted??0),310,y+24);
      ctx.font="12px Arial";ctx.fillStyle="#475569";
      ctx.fillText(String(it.min||"—"),450,y+24);
      ctx.fillText(String(it.max||"—"),520,y+24);
      if(st){
        const bg=st.color===T.red?"#fee2e2":st.color===T.purple?"#ede9fe":"#dcfce7";
        const tc=st.color===T.red?"#b91c1c":st.color===T.purple?"#6d28d9":"#15803d";
        ctx.fillStyle=bg;ctx.beginPath();ctx.roundRect(595,y+8,108,22,5);ctx.fill();
        ctx.font="bold 10px Arial";ctx.fillStyle=tc;ctx.fillText(st.label.slice(0,14),601,y+23);
      }
      if(need>0){
        ctx.font="bold 12px Arial";ctx.fillStyle="#d97706";
        ctx.fillText(`+${need} ${it.unit||""}`,710,y+24);
      } else {
        ctx.font="12px Arial";ctx.fillStyle="#94a3b8";ctx.fillText("—",710,y+24);
      }
      y+=rowH;
    });
    y+=12;
    ctx.fillStyle="#e8f0fe";ctx.beginPath();ctx.roundRect(24,y,W-48,90,10);ctx.fill();
    ctx.strokeStyle="#3b82f6";ctx.lineWidth=1.5;ctx.beginPath();ctx.roundRect(24,y,W-48,90,10);ctx.stroke();
    ctx.font="bold 13px Arial";ctx.fillStyle="#0a1e3c";ctx.fillText("RESUMO",42,y+24);
    const ab=list.filter(ci=>{const it=items.find(i=>i.id===ci.id)||ci;return it.min&&ci.counted<it.min;}).length;
    ctx.font="12px Arial";ctx.fillStyle="#334155";
    ctx.fillText(`Total de insumos: ${list.length}`,42,y+46);
    ctx.fillText(`Abaixo do mínimo: ${ab}`,42,y+66);
    ctx.fillStyle="#94a3b8";ctx.font="11px Arial";ctx.textAlign="center";
    ctx.fillText("Sistema de Gestão de Contagens",W/2,H-14);
    ctx.textAlign="left";
    setRendered(true);
  },[]);
  const download=()=>{const a=document.createElement("a");a.download=`${counting.label.replace(/\s+/g,"_")}.png`;a.href=canvasRef.current.toDataURL("image/png");a.click();};
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.9)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-start",zIndex:9999,padding:12,overflowY:"auto",fontFamily:T.fontBase}}>
      <div style={{width:"100%",maxWidth:860,background:T.card,borderRadius:14,border:`1px solid ${T.border}`,overflow:"hidden"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:`1px solid ${T.border}`}}>
          <div style={{fontWeight:700,fontSize:T.fs13,color:T.text}}>📄 {counting.label}</div>
          <div style={{display:"flex",gap:8}}>
            {rendered&&<button onClick={download} style={{background:T.warm,border:"none",borderRadius:8,padding:"7px 14px",color:"#fff",fontWeight:700,fontSize:T.fs12,cursor:"pointer"}}>⬇ Salvar PNG</button>}
            <button onClick={onClose} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 12px",color:T.textSub,fontWeight:600,fontSize:T.fs12,cursor:"pointer"}}>✕</button>
          </div>
        </div>
        <div style={{padding:12,overflowX:"auto"}}>
          <canvas ref={canvasRef} style={{width:"100%",height:"auto",borderRadius:8,border:`1px solid ${T.border}`}}/>
        </div>
      </div>
    </div>
  );
}

function sendWA(phone, counting, items) {
  const lines=(counting.items||[]).map(ci=>{
    const it=items.find(i=>i.id===ci.id)||ci;
    const min=it.min?` | Mínimo: ${it.min}`:"";
    const max=it.max?` | Máximo: ${it.max}`:"";
    return `  • *${ci.name}*\n    Contabilizado: ${ci.counted??0} ${it.unit||""}${min}${max}`;
  }).join("\n");
  const ab=(counting.items||[]).filter(ci=>{const it=items.find(i=>i.id===ci.id)||ci;return it.min&&ci.counted<it.min;});
  const alertas=ab.length?`\n\n⚠️ *Insumos abaixo do mínimo:*\n${ab.map(ci=>{const it=items.find(i=>i.id===ci.id)||ci;return`  • ${ci.name}: *${ci.counted??0}* (mínimo: ${it.min})`;}).join("\n")}`:"";
  const compras=(counting.items||[]).filter(ci=>{const it=items.find(i=>i.id===ci.id)||ci;return it.min&&ci.counted<it.min;}).map(ci=>{
    const it=items.find(i=>i.id===ci.id)||ci;
    const need=it.max?Math.max(it.max-ci.counted,0):Math.max(it.min-ci.counted+it.min,0);
    return `  • ${ci.name}: *+${need} ${it.unit||""}*`;
  });
  const comprasMsg=compras.length?`\n\n🛒 *Necessidade de Compra:*\n${compras.join("\n")}`:"";
  const msg=`Olá, Teresa! 😁🌟\n\nSegue o relatório da *${counting.label}* referente a ${fmtDate(counting.date)}, com as quantidades contabilizadas e a necessidade de compra conforme o levantamento realizado.\n\n📋 *Quantidades contabilizadas:*\n${lines}${alertas}${comprasMsg}\n\n_Sistema de Gestão de Contagens_`;
  const n = normPhone(phone);
  window.open(`https://wa.me/${n}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
}

function sendWABlocked(phone, reason, nextFuture) {
  const msg=`Olá, Teresa! 😊\n\nEstou tentando realizar a contagem de estoque${nextFuture?` referente a *"${nextFuture.label}"* (prevista para ${fmtDate(nextFuture.date)})`:""},  mas o sistema não está permitindo o registro.\n\n⚠️ *Motivo:* ${reason}\n\nPor favor, verifique o agendamento ou libere o acesso para que eu possa realizar a contagem.\n\n_Sistema de Gestão de Contagens_`;
  const n = normPhone(phone);
  window.open(`https://wa.me/${n}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
}

function useAppData() {
  const [state,setState] = useState({items:[],countings:[],scheduledDates:[],appPass:null,passHint:null,whatsapp:null,purchases:[]});
  const [loading,setLoading] = useState(true);
  const reload = useCallback(async()=>{
    const [items,countings,scheduledDates,appPass,passHint,whatsapp,purchases] = await Promise.all([
      DB.get("items_v2"),DB.get("countings_v2"),DB.get("scheduledDates"),DB.get("appPass"),DB.get("passHint"),DB.get("whatsapp"),DB.get("purchases_v1")
    ]);
    setState({items:items||[],countings:countings||[],scheduledDates:scheduledDates||[],appPass:appPass||DEFAULT_PASS,passHint:passHint||null,whatsapp:whatsapp||null,purchases:purchases||[]});
    setLoading(false);
  },[]);
  useEffect(()=>{injectFonts();reload();},[reload]);
  const save=(key,fn,dbKey)=>setState(prev=>{const next=typeof fn==="function"?fn(prev[key]):fn;DB.set(dbKey||key,next);return{...prev,[key]:next};});
  return{...state,loading,reload,
    setItems:fn=>save("items",fn,"items_v2"),
    setCountings:fn=>save("countings",fn,"countings_v2"),
    setScheduledDates:fn=>save("scheduledDates",fn),
    setPurchases:fn=>save("purchases",fn,"purchases_v1"),
    setAppPass:v=>{DB.set("appPass",v);setState(p=>({...p,appPass:v}));},
    setPassHint:v=>{DB.set("passHint",v);setState(p=>({...p,passHint:v}));},
    setWhatsapp:v=>{DB.set("whatsapp",v);setState(p=>({...p,whatsapp:v}));},
  };
}

function getActiveScheduled(scheduledDates) {
  const today = todayStr();
  const pending = (scheduledDates||[]).filter(sd => !sd.done);
  const todayMatch = pending.find(sd => sd.date === today);
  if (todayMatch) return { sd: todayMatch, status: "today" };
  const overdue = pending.filter(sd => sd.date < today).sort((a,b) => a.date.localeCompare(b.date));
  if (overdue.length > 0) return { sd: overdue[0], status: "overdue" };
  return null;
}

// ─── HOME ───────────────────────────────────────────────────────────────────
function HomeScreen({onManager,onCounter,scheduledDates}) {
  const upcoming=(scheduledDates||[]).filter(sd=>!sd.done&&daysUntil(sd.date)>=0&&daysUntil(sd.date)<=7).sort((a,b)=>a.date.localeCompare(b.date));
  const active = getActiveScheduled(scheduledDates);
  return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,fontFamily:T.fontBase,position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",inset:0,pointerEvents:"none"}}>
        <div style={{position:"absolute",top:"-15%",left:"-25%",width:500,height:500,borderRadius:"50%",background:`radial-gradient(circle,${T.accent}09 0%,transparent 65%)`}}/>
        <div style={{position:"absolute",bottom:"-10%",right:"-20%",width:400,height:400,borderRadius:"50%",background:`radial-gradient(circle,${T.warm}07 0%,transparent 65%)`}}/>
      </div>
      <div style={{position:"relative",width:"100%",maxWidth:380}}>
        <div style={{textAlign:"center"}}>
          <div style={{width:64,height:64,background:`linear-gradient(135deg,${T.accent},${T.accentDim})`,borderRadius:18,display:"flex",alignItems:"center",justifyContent:"center",fontSize:30,margin:"0 auto 16px",boxShadow:`0 8px 24px ${T.accent}30`}}>🏠</div>
          <div style={{fontFamily:T.fontMono,fontSize:T.fs24,fontWeight:700,color:"#ffffff",letterSpacing:2,marginBottom:16}}>GESTÃO DE CONTAGENS</div>
        </div>
        {upcoming.length>0&&(
          <div style={{...S.card({marginBottom:16,background:T.yellow+"0d",border:`1px solid ${T.yellow}30`})}}>
            <div style={{fontSize:T.fs11,fontWeight:700,color:T.yellow,marginBottom:8,textTransform:"uppercase"}}>⏰ Próximas Contagens</div>
            {upcoming.map(sd=>{const d=daysUntil(sd.date);return<div key={sd.id} style={{fontSize:T.fs13,color:T.text,marginBottom:4}}><span style={{color:T.yellow,fontWeight:600}}>{sd.label}</span> — {d===0?"HOJE":`em ${d} dia${d!==1?"s":""}`} <span style={{color:T.textMuted}}>({fmtDate(sd.date)})</span></div>;})}
          </div>
        )}
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <button onClick={onCounter} style={{background:`linear-gradient(135deg,${T.accentDim}22,${T.accent}11)`,border:`1.5px solid ${T.accent}35`,borderRadius:14,padding:"20px",cursor:"pointer",fontFamily:T.fontBase,display:"flex",alignItems:"center",gap:14,textAlign:"left",width:"100%"}}>
            <div style={{width:48,height:48,background:`linear-gradient(135deg,${T.accent},${T.accentDim})`,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>🧮</div>
            <div>
              <div style={{fontFamily:T.fontMono,fontSize:T.fs14,fontWeight:700,color:T.accent,letterSpacing:1}}>ÁREA DO CONTADOR</div>
              <div style={{fontSize:T.fs12,color:T.textMuted,marginTop:3}}>
                {active?(active.status==="today"?`📋 Contagem agendada para HOJE: ${active.sd.label}`:`⚠️ Contagem atrasada: ${active.sd.label} (${fmtDate(active.sd.date)})`):"Acesso livre · Preencha as quantidades"}
              </div>
            </div>
          </button>
          <button onClick={onManager} style={{background:`linear-gradient(135deg,${T.warmDim}22,${T.warm}11)`,border:`1.5px solid ${T.warm}35`,borderRadius:14,padding:"20px",cursor:"pointer",fontFamily:T.fontBase,display:"flex",alignItems:"center",gap:14,textAlign:"left",width:"100%"}}>
            <div style={{width:48,height:48,background:`linear-gradient(135deg,${T.warm},${T.warmDim})`,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>🔐</div>
            <div><div style={{fontFamily:T.fontMono,fontSize:T.fs14,fontWeight:700,color:T.warm,letterSpacing:1}}>ÁREA DO GERENTE</div><div style={{fontSize:T.fs12,color:T.textMuted,marginTop:3}}>Acesso protegido por senha</div></div>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── LOGIN ───────────────────────────────────────────────────────────────────
function ManagerLogin({onLogin,onBack,appPass,passHint}) {
  const [pw,setPw]=useState(""); const [err,setErr]=useState(""); const [show,setShow]=useState(false); const [showHint,setShowHint]=useState(false);
  const submit=()=>{if(pw===appPass)onLogin();else{setErr("Senha incorreta.");setPw("");}};
  return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:T.fontBase}}>
      <div style={{width:"100%",maxWidth:340}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:T.textMuted,cursor:"pointer",fontSize:T.fs13,marginBottom:24,padding:0}}>← Voltar</button>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{width:60,height:60,background:`linear-gradient(135deg,${T.warm},${T.warmDim})`,borderRadius:16,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,margin:"0 auto 14px"}}>🔐</div>
          <div style={{fontFamily:T.fontMono,fontSize:T.fs18,fontWeight:700,color:T.warm}}>ÁREA DO GERENTE</div>
        </div>
        <div style={S.card({padding:"20px"})}>
          <div style={S.label}>Senha de acesso</div>
          <div style={{position:"relative",marginBottom:8}}>
            <input type={show?"text":"password"} placeholder="Digite sua senha" value={pw} onChange={e=>{setPw(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&submit()} style={{...S.input({paddingRight:44,fontSize:T.fs14})}}/>
            <button onClick={()=>setShow(p=>!p)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:T.textMuted,cursor:"pointer",fontSize:T.fs14}}>{show?"🙈":"👁"}</button>
          </div>
          {err&&<div style={{color:T.red,fontSize:T.fs12,marginBottom:10}}>{err}</div>}
          <button onClick={submit} style={{...S.btn(T.warm,true),padding:"12px",fontSize:T.fs14,marginTop:4}}>Entrar</button>
          {passHint&&(
            <div style={{marginTop:14}}>
              <button onClick={()=>setShowHint(p=>!p)} style={{background:"none",border:"none",color:T.textMuted,cursor:"pointer",fontSize:T.fs12,width:"100%",textDecoration:"underline",fontFamily:T.fontBase}}>{showHint?"Ocultar dica":"Esqueci minha senha"}</button>
              {showHint&&<div style={{marginTop:10,background:T.yellow+"0f",border:`1px solid ${T.yellow}30`,borderRadius:10,padding:"10px 14px"}}><div style={{fontSize:T.fs11,color:T.yellow,fontWeight:700,marginBottom:4}}>💡 Dica</div><div style={{fontSize:T.fs13,color:T.text}}>{passHint}</div></div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── COUNTER ─────────────────────────────────────────────────────────────────
function CounterView({items,countings,scheduledDates,onSubmit,onBack,whatsapp}) {
  const [phase,setPhase]=useState("start");
  const [current,setCurrent]=useState(0);
  const [counts,setCounts]=useState({});
  const [confirmed,setConfirmed]=useState({});
  const [inputVal,setInputVal]=useState("");

  const active = getActiveScheduled(scheduledDates);
  const nextSched = active ? active.sd : null;
  const schedStatus = active ? active.status : null;
  const futureScheduled = (scheduledDates||[]).filter(sd=>!sd.done&&sd.date>todayStr()).sort((a,b)=>a.date.localeCompare(b.date));
  const nextFuture = futureScheduled[0]||null;
  const hasScheduled = (scheduledDates||[]).filter(sd=>!sd.done).length>0;
  const isBlocked = hasScheduled && !active;
  const label = nextSched?.label||`CONTAGEM ${countings.length+1}`;
  const countDate = nextSched?.date||todayStr();

  const total=items.length;
  const item=items[current];
  const isConf=confirmed[item?.id];
  const doneCount=items.filter(i=>confirmed[i.id]).length;
  const allDone=doneCount===total&&total>0;

  const doConfirm=()=>{const n=Number(inputVal);if(inputVal===""||isNaN(n)||n<0)return;setCounts(p=>({...p,[item.id]:n}));setConfirmed(p=>({...p,[item.id]:true}));};
  const doNext=()=>{setInputVal("");if(current<total-1)setCurrent(c=>c+1);};
  const doEdit=()=>{setConfirmed(p=>({...p,[item.id]:false}));setInputVal(String(counts[item.id]??""));};
  const goTo=idx=>{setCurrent(idx);setInputVal(confirmed[items[idx].id]?String(counts[items[idx].id]??""):"");};
  const numpad=k=>{if(isConf)return;if(k==="⌫")setInputVal(p=>p.slice(0,-1));else if(k==="✓")doConfirm();else setInputVal(p=>(p===""||p==="0")?String(k):p.length>6?p:p+String(k));};
  const doSend=()=>{
    const result=items.map(i=>({...i,counted:counts[i.id]??0,validated:false}));
    const counting={id:Date.now(),label,date:countDate,items:result,validated:false};
    onSubmit(counting,nextSched);setPhase("done");
    if(whatsapp)setTimeout(()=>sendWA(whatsapp,counting,items),500);
  };

  if(!items.length) return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,fontFamily:T.fontBase,padding:24}}>
      <div style={{fontSize:48}}>⚠️</div>
      <div style={{color:T.yellow,fontWeight:700,fontSize:T.fs16,textAlign:"center"}}>Nenhum insumo cadastrado.</div>
      <button onClick={onBack} style={S.btn(T.accent)}>← Voltar</button>
    </div>
  );

  // Blocked
  if(isBlocked) return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,fontFamily:T.fontBase}}>
      <div style={{width:"100%",maxWidth:380}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:T.textMuted,cursor:"pointer",fontSize:T.fs13,marginBottom:20,padding:0}}>← Voltar</button>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:52,marginBottom:12}}>🔒</div>
          <div style={{fontFamily:T.fontMono,fontSize:T.fs18,fontWeight:700,color:T.red,marginBottom:8}}>CONTAGEM BLOQUEADA</div>
          <div style={{fontSize:T.fs13,color:T.textMuted,lineHeight:1.7}}>Não há contagem agendada para hoje. Somente é possível realizar contagem nas datas agendadas.</div>
        </div>
        {nextFuture&&(
          <div style={{...S.card({marginBottom:16,background:T.yellow+"0a",border:`1px solid ${T.yellow}30`,padding:"16px"})}}>
            <div style={{fontSize:T.fs11,fontWeight:700,color:T.yellow,marginBottom:6,textTransform:"uppercase"}}>📅 Próxima contagem agendada</div>
            <div style={{fontWeight:700,fontSize:T.fs15,color:T.text,marginBottom:4}}>{nextFuture.label}</div>
            <div style={{fontSize:T.fs13,color:T.yellow}}>{fmtDate(nextFuture.date)} · {(()=>{const d=daysUntil(nextFuture.date);return d===1?"em 1 dia":`em ${d} dias`;})()}</div>
          </div>
        )}
        {whatsapp&&(
          <div style={{...S.card({marginBottom:12,background:T.green+"08",border:`1px solid ${T.green}25`,padding:"16px"})}}>
            <div style={{fontSize:T.fs12,color:T.green,fontWeight:700,marginBottom:6}}>📲 Avisar o gerente</div>
            <div style={{fontSize:T.fs12,color:T.textMuted,marginBottom:10,lineHeight:1.6}}>Se você foi orientado a fazer a contagem hoje e o sistema está bloqueado, envie uma mensagem ao gerente explicando a situação.</div>
            <button onClick={()=>sendWABlocked(whatsapp,`Não há contagem agendada para hoje (${fmtDate(todayStr())}). O sistema permite contagem apenas nas datas agendadas.${nextFuture?` A próxima contagem prevista é "${nextFuture.label}" em ${fmtDate(nextFuture.date)}.`:" Nenhuma contagem futura cadastrada no sistema."}`,nextFuture)} style={{...S.btn(T.green,true),padding:"11px",fontSize:T.fs13}}>
              📲 Enviar mensagem ao gerente
            </button>
          </div>
        )}
        <button onClick={onBack} style={{...S.btn(T.surface,true),border:`1px solid ${T.border}`,color:T.textSub,marginTop:4}}>← Voltar ao início</button>
      </div>
    </div>
  );

  if(phase==="start") return (
    <div style={{minHeight:"100vh",background:T.bg,color:T.text,fontFamily:T.fontBase,display:"flex",flexDirection:"column"}}>
      <div style={{background:`linear-gradient(135deg,${T.accentDim}33,${T.bg})`,padding:"22px 18px 18px",borderBottom:`1px solid ${T.border}`}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:T.textMuted,cursor:"pointer",fontSize:T.fs13,marginBottom:10,padding:0}}>← Voltar</button>
        <div style={{fontFamily:T.fontMono,fontSize:T.fs16,fontWeight:700,color:T.accent}}>🧮 ÁREA DO CONTADOR</div>
        <div style={{fontSize:T.fs13,color:T.yellow,marginTop:4,fontWeight:600}}>{label}</div>
        {nextSched&&(
          <div style={{marginTop:6,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{fontSize:T.fs12,color:T.textMuted}}>📅 Data prevista: <b style={{color:T.text}}>{fmtDate(nextSched.date)}</b></span>
            {schedStatus==="overdue"&&<span style={S.tag(T.red)}>ATRASADA</span>}
            {schedStatus==="today"&&<span style={S.tag(T.green)}>HOJE</span>}
          </div>
        )}
      </div>
      {nextSched&&(
        <div style={{padding:"10px 18px",background:schedStatus==="overdue"?T.red+"12":T.yellow+"10",borderBottom:`1px solid ${schedStatus==="overdue"?T.red:T.yellow}25`}}>
          <div style={{fontSize:T.fs13,fontWeight:600,color:schedStatus==="overdue"?T.red:T.yellow}}>
            {schedStatus==="overdue"?`⚠️ Esta contagem deveria ter sido realizada em ${fmtDate(nextSched.date)}. Realize agora para regularizar.`:`📋 Contagem agendada para hoje — realize assim que possível.`}
          </div>
        </div>
      )}
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
        <div style={{width:"100%",maxWidth:380}}>
          <div style={{...S.card({marginBottom:20,background:T.accent+"0a",border:`1px solid ${T.accent}20`,padding:"20px"})}}>
            <div style={{fontWeight:700,color:T.accent,fontSize:T.fs14,marginBottom:14}}>📋 Como fazer a contagem</div>
            {[["1.","Cada insumo aparece um por um na tela."],["2.","Vá até o local e conte fisicamente."],["3.","Digite a quantidade no teclado numérico."],["4.","Toque em ✓ para confirmar."],["5.","Toque em Próximo para o próximo item."],["6.","Ao finalizar, toque em Enviar Contagem."]].map(([n,t],i)=>(
              <div key={i} style={{display:"flex",gap:10,marginBottom:8,alignItems:"flex-start"}}>
                <span style={{fontSize:T.fs12,color:T.accent,fontWeight:700,fontFamily:T.fontMono,minWidth:18,lineHeight:1.6}}>{n}</span>
                <span style={{fontSize:T.fs13,color:T.text,lineHeight:1.6}}>{t}</span>
              </div>
            ))}
          </div>
          <button onClick={()=>setPhase("counting")} style={{...S.btn(T.accent,true),padding:"14px",fontSize:T.fs15}}>▶ Iniciar — {total} {total===1?"insumo":"insumos"}</button>
        </div>
      </div>
    </div>
  );

  if(phase==="counting") {
    const pct=(doneCount/total)*100;
    return (
      <div style={{minHeight:"100vh",background:T.bg,color:T.text,fontFamily:T.fontBase,display:"flex",flexDirection:"column"}}>
        <div style={{background:`linear-gradient(135deg,${T.accentDim}33,${T.bg})`,padding:"14px 18px 12px",borderBottom:`1px solid ${T.border}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <button onClick={()=>setPhase("start")} style={{background:"none",border:"none",color:T.textMuted,cursor:"pointer",fontSize:T.fs13,padding:0}}>← Voltar</button>
            <span style={{fontFamily:T.fontMono,fontSize:T.fs12,color:T.textSub}}>{doneCount}/{total} confirmados</span>
          </div>
          <div style={{fontSize:T.fs12,color:T.yellow,fontWeight:600,marginBottom:6}}>{label} · {fmtDate(countDate)}</div>
          <div style={{height:5,background:T.surface,borderRadius:4}}>
            <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${T.accent},${T.green})`,borderRadius:4,transition:"width .4s"}}/>
          </div>
        </div>
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",padding:"18px 16px 0",overflowY:"auto"}}>
          <div style={{width:"100%",maxWidth:400}}>
            {/* Item card - NO min/max shown */}
            <div style={{...S.card({marginBottom:14,textAlign:"center",padding:"24px 20px",border:`1.5px solid ${isConf?T.green:T.accent}30`,background:isConf?T.green+"06":T.accent+"06"})}}>
              <div style={{fontSize:T.fs11,color:T.textMuted,marginBottom:6,fontFamily:T.fontMono,letterSpacing:1,textTransform:"uppercase"}}>Insumo {current+1} de {total}</div>
              <div style={{fontSize:T.fs24,fontWeight:800,color:T.text,lineHeight:1.2,marginBottom:10}}>{item.name}</div>
              <span style={{display:"inline-flex",alignItems:"center",background:T.accent+"18",border:`1px solid ${T.accent}30`,borderRadius:20,padding:"4px 14px",fontSize:T.fs12,color:T.accent,fontWeight:600}}>{item.unit||"Unidade(s)"}</span>
            </div>
            {isConf?(
              <div style={{...S.card({marginBottom:14,padding:"20px",background:T.green+"0a",border:`1.5px solid ${T.green}30`})}}>
                <div style={{textAlign:"center",marginBottom:10}}>
                  <div style={{fontSize:T.fs12,color:T.green,fontWeight:700,marginBottom:6,textTransform:"uppercase"}}>✅ Quantidade registrada</div>
                  <div style={{fontFamily:T.fontMono,fontSize:52,fontWeight:700,color:T.green}}>{counts[item.id]}</div>
                  <div style={{fontSize:T.fs12,color:T.textMuted,marginTop:2}}>{item.unit||"Unidade(s)"}</div>
                </div>
                <div style={{display:"flex",justifyContent:"center",marginTop:12}}><button onClick={doEdit} style={{...S.btn(T.textMuted),padding:"6px 14px",fontSize:T.fs12}}>✏️ Editar</button></div>
              </div>
            ):(
              <div style={{marginBottom:14}}>
                <input type="number" min="0" inputMode="numeric" placeholder="0" value={inputVal} onChange={e=>setInputVal(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doConfirm()} autoFocus style={{...S.input({fontSize:44,textAlign:"center",padding:"16px",fontFamily:T.fontMono,fontWeight:700,borderColor:inputVal!==""?T.accent:T.border,marginBottom:10})}}/>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                  {[1,2,3,4,5,6,7,8,9,"⌫",0,"✓"].map((k,i)=>(
                    <button key={i} onClick={()=>numpad(k)} style={{background:k==="✓"?T.green:T.surface,border:`1px solid ${k==="✓"?T.green:T.border}`,borderRadius:12,padding:"16px 0",fontSize:k==="✓"?T.fs18:T.fs20,fontWeight:700,color:k==="✓"?"#fff":k==="⌫"?T.textSub:T.text,cursor:"pointer",fontFamily:T.fontMono}}>{k}</button>
                  ))}
                </div>
              </div>
            )}
            <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
              {!isConf&&<button onClick={doConfirm} disabled={inputVal===""} style={{...S.btn(inputVal!==""?T.green:T.textMuted,true),padding:"13px",fontSize:T.fs14,opacity:inputVal!==""?1:.45}}>✓ Confirmar</button>}
              {isConf&&current<total-1&&<button onClick={doNext} style={{...S.btn(T.accent,true),padding:"13px",fontSize:T.fs14}}>Próximo → ({current+2}/{total})</button>}
              {allDone&&<button onClick={doSend} style={{...S.btn(T.green,true),padding:"13px",fontSize:T.fs14}}>✅ Enviar{whatsapp?" + 📲":""}</button>}
            </div>
          </div>
        </div>
        <div style={{padding:"10px 12px",borderTop:`1px solid ${T.border}`,display:"flex",gap:6,overflowX:"auto",flexShrink:0,background:T.surface}}>
          {items.map((it,idx)=>{const done=confirmed[it.id],cur=idx===current;return(
            <button key={it.id} onClick={()=>goTo(idx)} style={{background:cur?T.accent:done?T.green+"22":T.card,border:`1px solid ${cur?T.accent:done?T.green:T.border}`,borderRadius:8,padding:"6px 10px",fontSize:T.fs11,fontWeight:600,color:cur?"#fff":done?T.green:T.textMuted,cursor:"pointer",whiteSpace:"nowrap",fontFamily:T.fontBase}}>{done&&!cur?"✓ ":""}{it.name}</button>
          );})}
        </div>
      </div>
    );
  }

  return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:0,fontFamily:T.fontBase,padding:24}}>
      <div style={{width:72,height:72,background:`linear-gradient(135deg,${T.green},${T.greenDim})`,borderRadius:20,display:"flex",alignItems:"center",justifyContent:"center",fontSize:34,marginBottom:16}}>✅</div>
      <div style={{fontFamily:T.fontMono,fontSize:T.fs20,color:T.green,textAlign:"center",marginBottom:6}}>CONTAGEM ENVIADA!</div>
      <div style={{fontSize:T.fs13,color:T.textMuted,textAlign:"center",marginBottom:8}}>Dados salvos com sucesso</div>
      <div style={{fontSize:T.fs12,color:T.yellow,textAlign:"center",marginBottom:24}}>⏳ Aguardando validação do gerente</div>
      <div style={{...S.card({maxWidth:340,width:"100%",marginBottom:20})}}>
        <div style={{fontSize:T.fs13,color:T.text,lineHeight:2.2}}>
          <div>💾 <span style={{color:T.green,fontWeight:600}}>Contagem salva</span> no histórico</div>
          {whatsapp&&<div>📲 <span style={{color:T.green,fontWeight:600}}>Relatório enviado</span> via WhatsApp</div>}
        </div>
      </div>
      <button onClick={onBack} style={{...S.btn(T.surface,true),border:`1px solid ${T.border}`,color:T.textSub}}>← Início</button>
    </div>
  );
}

// ─── MANAGER PANEL ───────────────────────────────────────────────────────────
function ManagerPanel({data,onBack}) {
  const {items,countings,scheduledDates,appPass,passHint,whatsapp,purchases,setItems,setCountings,setScheduledDates,setAppPass,setPassHint,setWhatsapp,setPurchases}=data;
  const TABS=["📊 Dashboard","📦 Insumos","📋 Contagens","🛒 Compras","⚙️ Config"];
  const [tab,setTab]=useState(0);
  return (
    <div style={{minHeight:"100vh",background:T.bg,color:T.text,fontFamily:T.fontBase,paddingBottom:70}}>
      <div style={{background:`linear-gradient(135deg,${T.warmDim}22,${T.bg})`,padding:"20px 18px 0",borderBottom:`1px solid ${T.border}`}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:T.textMuted,cursor:"pointer",fontSize:T.fs13,marginBottom:10,padding:0}}>← Sair</button>
        <div style={{fontFamily:T.fontMono,fontSize:T.fs15,fontWeight:700,color:T.warm,marginBottom:12}}>🔐 PAINEL DO GERENTE</div>
        <div style={{display:"flex",gap:2,overflowX:"auto"}}>
          {TABS.map((t,i)=><button key={i} onClick={()=>setTab(i)} style={{background:tab===i?T.warm:"transparent",border:`1px solid ${tab===i?T.warm:T.border}`,borderBottom:tab===i?"none":"1px solid transparent",borderRadius:"10px 10px 0 0",padding:"8px 10px",color:tab===i?"#000":T.textMuted,fontWeight:600,fontSize:T.fs11,cursor:"pointer",fontFamily:T.fontBase,whiteSpace:"nowrap"}}>{t}</button>)}
        </div>
      </div>
      <div style={{padding:"18px 16px"}}>
        {tab===0&&<DashTab items={items} countings={countings} scheduledDates={scheduledDates}/>}
        {tab===1&&<ItemsTab items={items} setItems={setItems} countings={countings}/>}
        {tab===2&&<CountTab items={items} countings={countings} setCountings={setCountings} setItems={setItems} scheduledDates={scheduledDates} setScheduledDates={setScheduledDates}/>}
        {tab===3&&<BuyTab items={items} setItems={setItems} countings={countings} purchases={purchases} setPurchases={setPurchases}/>}
        {tab===4&&<CfgTab appPass={appPass} setAppPass={setAppPass} passHint={passHint} setPassHint={setPassHint} whatsapp={whatsapp} setWhatsapp={setWhatsapp}/>}
      </div>
    </div>
  );
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
function DashTab({items,countings,scheduledDates}) {
  const pendingScheduled = (scheduledDates||[]).filter(sd=>!sd.done).sort((a,b)=>a.date.localeCompare(b.date));
  const nextSched = pendingScheduled[0]||null;
  const dtn = nextSched ? daysUntil(nextSched.date) : null;
  const schedColor = dtn===null?T.textSub:dtn<0?T.red:dtn===0?T.yellow:dtn<=3?T.yellow:T.green;
  const schedLabel = dtn===null?"—":dtn<0?`${Math.abs(dtn)} dia${Math.abs(dtn)!==1?"s":""} em atraso`:dtn===0?"HOJE":`em ${dtn} dia${dtn!==1?"s":""}`;

  const lastC=countings.length?[...countings].sort((a,b)=>Number(b.id||0)-Number(a.id||0))[0]:null;
  const lc={};if(lastC)(lastC.items||[]).forEach(ci=>{lc[ci.id]=ci.counted;});
  const vA=items.reduce((s,i)=>s+(Number(i.value||0)*getTotalAcquired(i)),0);
  const vC=items.reduce((s,i)=>s+(Number(i.value||0)*(lc[i.id]??0)),0);

  // Pending purchases value = sum of (need * value) for items below max
  const vPending=items.reduce((s,i)=>{
    const cur=lc[i.id]??0;
    let need=0;
    if(i.max&&cur<i.max) need=i.max-cur;
    else if(!i.max&&i.min&&cur<i.min) need=i.min-cur+Number(i.min||0);
    return s+(Number(i.value||0)*need);
  },0);

  const abMin=items.filter(i=>i.min&&(lc[i.id]??0)<i.min).length;
  const acMax=items.filter(i=>i.max&&(lc[i.id]??0)>i.max).length;
  const inRange=items.filter(i=>{const c=lc[i.id];if(c===undefined)return false;if(i.min&&i.max)return c>=i.min&&c<=i.max;if(i.min)return c>=i.min;if(i.max)return c<=i.max;return true;}).length;

  const ex=Object.keys(lc).length;
  const dQ=ex-items.length; const dV=vC-vA;
  const vc=vC===0&&vA===0?T.textSub:vC<vA?T.red:vC===vA?T.green:T.accent;

  const Stat=({icon,label,value,sub,color,small=false})=>(
    <div style={S.card({padding:"14px"})}>
      <div style={{fontSize:T.fs18,marginBottom:4}}>{icon}</div>
      <div style={{fontFamily:T.fontMono,fontSize:small?T.fs13:T.fs20,fontWeight:700,color:color||T.accent,lineHeight:1.2}}>{value}</div>
      <div style={{fontSize:T.fs11,color:T.textMuted,fontWeight:600,marginTop:3,textTransform:"uppercase",lineHeight:1.4}}>{label}</div>
      {sub&&<div style={{fontSize:T.fs10,color:T.textMuted,marginTop:2}}>{sub}</div>}
    </div>
  );

  return (
    <div style={{marginTop:4}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <Stat icon="📦" label="Insumos Cadastrados" value={items.length} color={T.accent}/>
        <Stat icon="🧮" label="Insumos Contabilizados" value={lastC?ex:"—"} sub={lastC?lastC.label:"Sem contagem"} color={T.green}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <Stat icon="💳" label="Valor Total Adquirido" value={fmtCur(vA)} color={T.warm} small/>
        <Stat icon="💰" label="Valor Total Contabilizado" value={fmtCur(vC)} sub={lastC?lastC.label:"Sem contagem"} color={vc} small/>
      </div>
      {lastC&&vPending>0&&(
        <div style={{marginBottom:10}}>
          <Stat icon="🛒" label="Valor Total Pendente de Compra" value={fmtCur(vPending)} sub="Baseado na programação de compras" color={T.yellow} small/>
        </div>
      )}
      <div style={{marginBottom:10}}>
        <div style={S.card({padding:"14px"})}>
          <div style={{fontSize:T.fs18,marginBottom:4}}>⏰</div>
          <div style={{fontFamily:T.fontMono,fontSize:T.fs20,fontWeight:700,color:schedColor,lineHeight:1.2}}>{schedLabel}</div>
          <div style={{fontSize:T.fs11,color:T.textMuted,fontWeight:600,marginTop:3,textTransform:"uppercase"}}>Próxima Contagem Agendada</div>
          {nextSched&&<div style={{fontSize:T.fs10,color:T.textMuted,marginTop:2}}>{nextSched.label} · {fmtDate(nextSched.date)}</div>}
          {!nextSched&&<div style={{fontSize:T.fs10,color:T.textMuted,marginTop:2}}>Nenhum agendamento pendente</div>}
        </div>
      </div>

      {/* Quantity alerts - 3 categories */}
      {lastC&&(abMin>0||acMax>0||inRange>0)&&(
        <div style={{...S.card({marginBottom:10,border:`1px solid ${T.border}`})}}>
          <div style={{fontSize:T.fs12,fontWeight:700,color:T.text,marginBottom:10}}>📊 Status das Quantidades</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
            <div style={{background:T.red+"10",borderRadius:10,padding:"10px 8px",textAlign:"center"}}>
              <div style={{fontSize:T.fs20,fontWeight:700,color:T.red,fontFamily:T.fontMono}}>{abMin}</div>
              <div style={{fontSize:T.fs10,color:T.red,fontWeight:600,marginTop:2,lineHeight:1.3}}>Abaixo do Mínimo</div>
            </div>
            <div style={{background:T.green+"10",borderRadius:10,padding:"10px 8px",textAlign:"center"}}>
              <div style={{fontSize:T.fs20,fontWeight:700,color:T.green,fontFamily:T.fontMono}}>{inRange}</div>
              <div style={{fontSize:T.fs10,color:T.green,fontWeight:600,marginTop:2,lineHeight:1.3}}>Dentro do Intervalo</div>
            </div>
            <div style={{background:T.purple+"10",borderRadius:10,padding:"10px 8px",textAlign:"center"}}>
              <div style={{fontSize:T.fs20,fontWeight:700,color:T.purple,fontFamily:T.fontMono}}>{acMax}</div>
              <div style={{fontSize:T.fs10,color:T.purple,fontWeight:600,marginTop:2,lineHeight:1.3}}>Acima do Máximo</div>
            </div>
          </div>
          {/* Items below min */}
          {abMin>0&&(
            <div style={{marginBottom:8}}>
              <div style={{fontSize:T.fs10,color:T.red,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>⬇ Abaixo do mínimo</div>
              {items.filter(i=>i.min&&(lc[i.id]??0)<i.min).map(i=>(
                <div key={i.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 8px",background:T.red+"0a",borderRadius:7,marginBottom:4}}>
                  <span style={{fontSize:T.fs12,color:T.text,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,marginRight:8}}>{i.name}</span>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                    <span style={{fontFamily:T.fontMono,fontSize:T.fs12,color:T.red,fontWeight:700}}>{lc[i.id]??0}</span>
                    <span style={{fontSize:T.fs10,color:T.textMuted}}>Mínimo: {i.min}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* Items in range */}
          {inRange>0&&(
            <div style={{marginBottom:8}}>
              <div style={{fontSize:T.fs10,color:T.green,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>✅ Dentro do intervalo</div>
              {items.filter(i=>{const c=lc[i.id];if(c===undefined)return false;if(i.min&&i.max)return c>=i.min&&c<=i.max;if(i.min)return c>=i.min;if(i.max)return c<=i.max;return true;}).map(i=>(
                <div key={i.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 8px",background:T.green+"0a",borderRadius:7,marginBottom:4}}>
                  <span style={{fontSize:T.fs12,color:T.text,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,marginRight:8}}>{i.name}</span>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                    <span style={{fontFamily:T.fontMono,fontSize:T.fs12,color:T.green,fontWeight:700}}>{lc[i.id]??0}</span>
                    {i.min&&<span style={{fontSize:T.fs10,color:T.textMuted}}>Mínimo: {i.min}</span>}
                    {i.max&&<span style={{fontSize:T.fs10,color:T.textMuted}}>Máximo: {i.max}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* Items above max */}
          {acMax>0&&(
            <div>
              <div style={{fontSize:T.fs10,color:T.purple,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>⬆ Acima do máximo</div>
              {items.filter(i=>i.max&&(lc[i.id]??0)>i.max).map(i=>(
                <div key={i.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 8px",background:T.purple+"0a",borderRadius:7,marginBottom:4}}>
                  <span style={{fontSize:T.fs12,color:T.text,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,marginRight:8}}>{i.name}</span>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                    <span style={{fontFamily:T.fontMono,fontSize:T.fs12,color:T.purple,fontWeight:700}}>{lc[i.id]??0}</span>
                    <span style={{fontSize:T.fs10,color:T.textMuted}}>Máximo: {i.max}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <Stat icon="🔢" label="Diferença em Quantidade" value={lastC?`${dQ>=0?"+":""}${dQ}`:"—"} color={dQ>=0?T.green:T.red}/>
        <Stat icon="💹" label="Diferença em Valor" value={lastC?fmtCur(dV):"—"} color={dV<0?T.red:dV===0?T.green:T.accent} small/>
      </div>
    </div>
  );
}

// ─── ITEMS TAB ───────────────────────────────────────────────────────────────
function ItemsTab({items,setItems,countings}) {
  const empty={name:"",unit:"Unidade(s)",value:"",min:"",max:"",attachment:null,attachmentName:""};
  const [form,setForm]=useState(empty); const [edit,setEdit]=useState(null); const [err,setErr]=useState("");
  const [showForm,setShowForm]=useState(false); const [confirm,setConfirm]=useState(null);
  const fileRef=useRef();
  const lastC=countings.length?[...countings].sort((a,b)=>Number(b.id||0)-Number(a.id||0))[0]:null;
  const lc={};if(lastC)(lastC.items||[]).forEach(ci=>{lc[ci.id]=ci.counted;});

  const handleFile=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>setForm(p=>({...p,attachment:ev.target.result,attachmentName:f.name}));r.readAsDataURL(f);};
  const save=()=>{
    if(!form.name.trim()){setErr("Nome é obrigatório.");return;}
    const it={...form,name:upper(form.name.trim()),min:Number(form.min)||0,max:Number(form.max)||0,value:Number(form.value)||0};
    if(edit!==null){setItems(prev=>prev.map(i=>i.id===edit?{...i,...it}:i));setEdit(null);}
    else{setItems(prev=>[...prev,{id:Date.now(),...it,purchases:[],acquiredQty:0}]);}
    setForm(empty);setErr("");setShowForm(false);
  };
  const startEdit=it=>{setEdit(it.id);setForm({name:it.name,unit:it.unit||"Unidade(s)",value:String(it.value||""),min:String(it.min||""),max:String(it.max||""),attachment:it.attachment||null,attachmentName:it.attachmentName||""});setShowForm(true);};

  return (
    <div>
      {confirm&&<ConfirmModal message={`Deseja excluir "${confirm.name}"?`} onConfirm={()=>{setItems(prev=>prev.filter(i=>i.id!==confirm.id));setConfirm(null);}} onCancel={()=>setConfirm(null)}/>}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,marginTop:2}}>
        <div style={{...S.sec,marginBottom:0}}>Insumos <span style={{color:T.textMuted,fontWeight:400}}>({items.length})</span></div>
        <button onClick={()=>{setEdit(null);setForm(empty);setShowForm(p=>!p);}} style={S.btn(showForm?T.textMuted:T.green,false,true)}>{showForm?"✕ Fechar":"➕ Novo"}</button>
      </div>
      {showForm&&(
        <div style={{...S.card({marginBottom:16,border:`1px solid ${T.green}25`,padding:"18px"})}}>
          <div style={{fontWeight:700,marginBottom:14,color:T.green,fontSize:T.fs14}}>{edit!==null?"✏️ Editar":"➕ Novo Insumo"}</div>
          <div style={S.label}>Nome *</div>
          <input placeholder="Ex: TOALHA DE BANHO" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value.toUpperCase()}))} style={{...S.input({marginBottom:12,textTransform:"uppercase"})}}/>
          <div style={S.label}>Unidade</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>{UNITS.map(u=><button key={u} onClick={()=>setForm(p=>({...p,unit:u}))} style={{background:form.unit===u?T.accent:T.surface,border:`1px solid ${form.unit===u?T.accent:T.border}`,borderRadius:8,padding:"6px 12px",color:form.unit===u?"#fff":T.textSub,fontWeight:600,fontSize:T.fs12,cursor:"pointer",fontFamily:T.fontBase}}>{u}</button>)}</div>
          <div style={{marginBottom:12}}>
            <div style={S.label}>Valor Unitário (R$)</div>
            <input type="number" placeholder="0,00" value={form.value} onChange={e=>setForm(p=>({...p,value:e.target.value}))} onBlur={e=>{const n=parseFloat(e.target.value);if(!isNaN(n))setForm(p=>({...p,value:n.toFixed(2)}));}} style={S.input()}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
            <div><div style={S.label}>Quantidade mínima</div><input type="number" placeholder="Mínimo" value={form.min} onChange={e=>setForm(p=>({...p,min:e.target.value}))} style={S.input()}/></div>
            <div><div style={S.label}>Quantidade máxima</div><input type="number" placeholder="Máximo" value={form.max} onChange={e=>setForm(p=>({...p,max:e.target.value}))} style={S.input()}/></div>
          </div>
          <div style={S.label}>Anexo</div>
          <button onClick={()=>fileRef.current.click()} style={{...S.btn(T.purple,true,true),marginBottom:10,justifyContent:"flex-start",gap:8}}>📎 {form.attachmentName||"Selecionar arquivo"}</button>
          <input ref={fileRef} type="file" accept="image/*,.pdf" onChange={handleFile} style={{display:"none"}}/>
          {form.attachment?.startsWith("data:image")&&<img src={form.attachment} alt="" style={{width:"100%",maxHeight:110,objectFit:"cover",borderRadius:8,marginBottom:10}}/>}
          {err&&<div style={{color:T.red,fontSize:T.fs12,marginBottom:10}}>{err}</div>}
          <div style={{display:"flex",gap:8}}>
            <button onClick={save} style={S.btn(T.green)}>{edit!==null?"Salvar":"Cadastrar"}</button>
            <button onClick={()=>{setShowForm(false);setEdit(null);}} style={{...S.btn(T.surface),border:`1px solid ${T.border}`,color:T.textSub}}>Cancelar</button>
          </div>
        </div>
      )}
      {items.length===0&&<div style={{textAlign:"center",color:T.textMuted,padding:"40px 0",fontSize:T.fs13}}>Nenhum insumo cadastrado ainda.</div>}
      {items.map(it=>{
        const counted=lc[it.id];
        const st=counted!==undefined?getStatus(it,counted):null;
        return (
          <div key={it.id} style={{...S.card({marginBottom:10,border:`1px solid ${st?(st.level==="danger"?T.red:st.level==="over"?T.purple:T.green)+"30":T.border}`})}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2,flexWrap:"wrap"}}>
                  <div style={{fontWeight:700,fontSize:T.fs14}}>{it.name}</div>
                  {st&&<StatusBadge item={it} counted={counted}/>}
                </div>
                <div style={{fontSize:T.fs12,color:T.accent,marginBottom:8}}>{it.unit}</div>
                {counted!==undefined&&<div style={{fontSize:T.fs12,marginBottom:4}}>Última contagem: <b style={{color:st?.color||T.text,fontFamily:T.fontMono}}>{counted} {it.unit}</b></div>}
                <div style={{display:"flex",gap:12,flexWrap:"wrap",fontSize:T.fs12,color:T.textMuted}}>
                  {it.value>0&&<span>Valor unitário: <b style={{color:T.yellow}}>{fmtCur(it.value)}</b></span>}
                  <span>Total adquirido: <b style={{color:T.text}}>{getTotalAcquired(it)} {it.unit}</b></span>
                </div>
                {(it.min||it.max)&&<div style={{fontSize:T.fs12,color:T.textMuted,marginTop:4}}>{it.min?`Mínimo: ${it.min}`:""}{it.min&&it.max?" · ":""}{it.max?`Máximo: ${it.max}`:""}</div>}
                {/* Purchase history inline */}
                {(it.purchases||[]).length>0&&(
                  <div style={{marginTop:8,background:T.surface,borderRadius:8,padding:"8px 10px"}}>
                    <div style={{fontSize:T.fs10,color:T.textMuted,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>📦 Histórico de compras</div>
                    {(it.purchases||[]).map((p,i)=>(
                      <div key={i} style={{fontSize:T.fs11,color:T.textSub,display:"flex",justifyContent:"space-between",marginBottom:2}}>
                        <span>{fmtDate(p.date)}</span>
                        <span style={{fontFamily:T.fontMono,color:T.green,fontWeight:600}}>+{p.qty} {it.unit}</span>
                        {p.note&&<span style={{color:T.textMuted}}>{p.note}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {it.attachment?.startsWith("data:image")&&<img src={it.attachment} alt="" style={{width:56,height:56,objectFit:"cover",borderRadius:8,marginTop:8}}/>}
                {it.attachmentName&&!it.attachment?.startsWith("data:image")&&<div style={{fontSize:T.fs11,color:T.purple,marginTop:4}}>📎 {it.attachmentName}</div>}
              </div>
              <div style={{display:"flex",gap:6,marginLeft:10,flexShrink:0}}>
                <button onClick={()=>startEdit(it)} style={S.btn(T.accent,false,true)}>✏️</button>
                <button onClick={()=>setConfirm({id:it.id,name:it.name})} style={S.btn(T.red,false,true)}>🗑</button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── COUNTINGS TAB ───────────────────────────────────────────────────────────
function CountTab({items,countings,setCountings,setItems,scheduledDates,setScheduledDates}) {
  const [subTab,setSubTab]=useState("history");
  const [sel,setSel]=useState(null);
  const [schForm,setSchForm]=useState({label:"",date:""});
  const [schEditId,setSchEditId]=useState(null);
  const [schErr,setSchErr]=useState("");
  const [expanded,setExpanded]=useState({});
  const [confirm,setConfirm]=useState(null);
  const [showReport,setShowReport]=useState(false);
  const [repC,setRepC]=useState(null);
  const SUBS=[["history","📋 Histórico"],["schedule","📅 Agendamentos"],["evolution","📈 Evolução"]];
  // Sort by id (Date.now() at creation) descending — most recently created first = ÚLTIMA
  const sorted=[...countings].sort((a,b)=>Number(b.id||0)-Number(a.id||0));
  const sortedSch=[...scheduledDates].sort((a,b)=>a.date.localeCompare(b.date));

  const saveSchedule=()=>{
    if(!schForm.label.trim()||!schForm.date){setSchErr("Preencha o nome e a data.");return;}
    if(schEditId!==null){
      setScheduledDates(prev=>prev.map(s=>s.id===schEditId?{...s,...schForm}:s));
      setSchEditId(null);
    } else {
      setScheduledDates(prev=>[...prev,{id:Date.now(),...schForm,done:false}]);
    }
    setSchForm({label:"",date:""});setSchErr("");
  };
  const startEditSch=(sd)=>{setSchEditId(sd.id);setSchForm({label:sd.label,date:sd.date});};

  // Validate counting → mark items as validated and update currentQty
  const validateCounting=(c)=>{
    setCountings(prev=>prev.map(x=>x.id===c.id?{...x,validated:true,items:(x.items||[]).map(ci=>({...ci,validated:true}))}:x));
    setItems(prev=>prev.map(it=>{
      const ci=(c.items||[]).find(i=>i.id===it.id);
      if(ci) return {...it, currentQty: ci.counted};
      return it;
    }));
  };

  if(sel) return (
    <div>
      {showReport&&repC&&<ReportModal counting={repC} items={items} onClose={()=>setShowReport(false)}/>}
      <button onClick={()=>setSel(null)} style={{background:"none",border:"none",color:T.textMuted,cursor:"pointer",fontSize:T.fs13,marginBottom:14,padding:0}}>← Voltar</button>
      <div style={S.card({marginBottom:12})}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontWeight:700,fontSize:T.fs15}}>{sel.label}</div>
            <div style={{fontSize:T.fs12,color:T.textMuted,marginBottom:10}}>{fmtDate(sel.date)}</div>
          </div>
          {sel.validated?<span style={S.tag(T.green)}>✅ VALIDADA</span>:<span style={S.tag(T.yellow)}>⏳ AGUARDANDO</span>}
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={()=>{setRepC(sel);setShowReport(true);}} style={S.btn(T.accent,false,true)}>📄 Relatório</button>
          {!sel.validated&&<button onClick={()=>validateCounting(sel)} style={S.btn(T.green,false,true)}>✅ Validar contagem</button>}
        </div>
      </div>
      {!sel.validated&&<div style={{...S.card({marginBottom:12,background:T.yellow+"0a",border:`1px solid ${T.yellow}30`,padding:"12px 14px"})}}>
        <div style={{fontSize:T.fs12,color:T.yellow,lineHeight:1.6}}>⚠️ Ao validar, as quantidades contabilizadas serão registradas como <b>quantidade atual</b> de cada insumo.</div>
      </div>}
      <div style={{...S.sec,marginBottom:12}}>Insumos Contados</div>
      {(sel.items||[]).map(ci=>{const it=items.find(i=>i.id===ci.id)||ci;const st=getStatus(it,ci.counted);return(
        <div key={ci.id} style={{...S.card({marginBottom:8}),display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{fontWeight:600,fontSize:T.fs13}}>{ci.name||it.name}</div><div style={{fontSize:T.fs12,color:T.accent}}>{it.unit}</div></div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{textAlign:"right"}}><div style={{fontSize:T.fs10,color:T.textMuted,marginBottom:1}}>Quantidade Contabilizada</div><span style={{...S.mono,fontSize:T.fs20,fontWeight:700,color:T.accent}}>{ci.counted}</span></div>
            {st&&<StatusBadge item={it} counted={ci.counted}/>}
          </div>
        </div>
      );})}
    </div>
  );

  return (
    <div>
      {confirm&&<ConfirmModal message={confirm.message} onConfirm={confirm.onConfirm} onCancel={()=>setConfirm(null)}/>}
      {showReport&&repC&&<ReportModal counting={repC} items={items} onClose={()=>setShowReport(false)}/>}
      <div style={{display:"flex",gap:2,marginBottom:16,background:T.surface,borderRadius:10,padding:3,border:`1px solid ${T.border}`}}>
        {SUBS.map(([k,l])=><button key={k} onClick={()=>setSubTab(k)} style={{flex:1,background:subTab===k?T.card:"transparent",border:subTab===k?`1px solid ${T.border}`:"1px solid transparent",borderRadius:8,padding:"8px 4px",color:subTab===k?T.text:T.textMuted,fontWeight:subTab===k?700:500,fontSize:T.fs11,cursor:"pointer",fontFamily:T.fontBase}}>{l}</button>)}
      </div>

      {subTab==="history"&&(
        <div>
          {sorted.length===0&&<div style={{textAlign:"center",color:T.textMuted,padding:"40px 0",fontSize:T.fs13}}>Nenhuma contagem registrada ainda.</div>}
          {sorted.map((c,idx)=>{
            const isLast=idx===0;
            const isExp=expanded[c.id];
            const ciList=c.items||[];
            const visible=isExp?ciList:ciList.slice(0,3);
            return(
              <div key={c.id} style={S.card({marginBottom:10})}>
                {/* Header row with actions on top, horizontal */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:2}}>
                      <div style={{fontWeight:700,fontSize:T.fs14}}>{c.label}</div>
                      {isLast&&<span style={S.tag(T.green)}>ÚLTIMA</span>}
                      {c.validated?<span style={S.tag(T.green)}>✅ VALIDADA</span>:<span style={S.tag(T.yellow)}>⏳ PENDENTE</span>}
                    </div>
                    <div style={{fontSize:T.fs12,color:T.textMuted}}>{fmtDate(c.date)} · {ciList.length} insumos</div>
                  </div>
                  {/* Actions horizontal on right */}
                  <div style={{display:"flex",gap:6,flexShrink:0,marginLeft:10}}>
                    <button onClick={()=>setSel(c)} style={S.btn(T.accent,false,true)}>👁</button>
                    {!c.validated&&<button onClick={()=>validateCounting(c)} style={S.btn(T.green,false,true)} title="Validar">✅</button>}
                    <button onClick={()=>setConfirm({message:`Excluir "${c.label}"?`,onConfirm:()=>{setCountings(prev=>prev.filter(x=>x.id!==c.id));setConfirm(null);}})} style={S.btn(T.red,false,true)}>🗑</button>
                  </div>
                </div>
                {/* Items list with max and needed */}
                {visible.map(ci=>{
                  const it=items.find(i=>i.id===ci.id)||ci;
                  const need = it.min && ci.counted < it.min
                    ? (it.max ? Math.max(it.max - ci.counted, 0) : Math.max(it.min - ci.counted, 0))
                    : 0;
                  return(
                  <div key={ci.id} style={{padding:"7px 0",borderBottom:`1px solid ${T.border}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <span style={{fontSize:T.fs12,color:T.text,fontWeight:600,flex:1,marginRight:8}}>{ci.name}</span>
                      <div style={{textAlign:"right",flexShrink:0}}>
                        <div style={{fontFamily:"monospace",fontSize:T.fs13,fontWeight:700,color:T.accent}}>{ci.counted} <span style={{fontSize:T.fs11,color:T.textMuted}}>{ci.unit||it.unit||""}</span></div>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:12,marginTop:3,flexWrap:"wrap"}}>
                      <span style={{fontSize:T.fs11,color:T.textMuted}}>Contabilizado: <b style={{color:T.accent}}>{ci.counted}</b></span>
                      {it.max?<span style={{fontSize:T.fs11,color:T.textMuted}}>Máximo: <b style={{color:T.green}}>{it.max}</b></span>:null}
                      {need>0?<span style={{fontSize:T.fs11,color:T.yellow,fontWeight:700}}>Necessário: +{need}</span>:
                        it.max?<span style={{fontSize:T.fs11,color:T.green}}>✓ Atingido</span>:null}
                    </div>
                  </div>
                );})}
                {ciList.length>3&&<button onClick={()=>setExpanded(p=>({...p,[c.id]:!p[c.id]}))} style={{background:"none",border:"none",color:T.accent,cursor:"pointer",fontSize:T.fs12,marginTop:6,padding:0,fontFamily:T.fontBase,fontWeight:600}}>{isExp?"▲ Recolher":`▼ Ver mais ${ciList.length-3} itens`}</button>}
              </div>
            );
          })}
        </div>
      )}

      {subTab==="schedule"&&(
        <div>
          <div style={{...S.card({marginBottom:14,border:`1px solid ${T.yellow}25`,padding:"18px"})}}>
            <div style={{fontWeight:700,color:T.yellow,marginBottom:12,fontSize:T.fs14}}>{schEditId!==null?"✏️ Editar Agendamento":"➕ Agendar Contagem"}</div>
            <div style={S.label}>Nome</div>
            <input placeholder="Ex: CONTAGEM MENSAL" value={schForm.label} onChange={e=>setSchForm(p=>({...p,label:e.target.value.toUpperCase()}))} style={{...S.input({marginBottom:10,textTransform:"uppercase"})}}/>
            <div style={S.label}>Data</div>
            <input type="date" value={schForm.date} onChange={e=>setSchForm(p=>({...p,date:e.target.value}))} style={{...S.input({marginBottom:10})}}/>
            {schErr&&<div style={{color:T.red,fontSize:T.fs12,marginBottom:8}}>{schErr}</div>}
            <div style={{display:"flex",gap:8}}>
              <button onClick={saveSchedule} style={S.btn(T.yellow)}><span style={{color:"#000"}}>{schEditId!==null?"Salvar":"Agendar"}</span></button>
              {schEditId!==null&&<button onClick={()=>{setSchEditId(null);setSchForm({label:"",date:""});setSchErr("");}} style={{...S.btn(T.surface),border:`1px solid ${T.border}`,color:T.textSub}}>Cancelar</button>}
            </div>
          </div>
          {sortedSch.length===0&&<div style={{textAlign:"center",color:T.textMuted,padding:"30px 0",fontSize:T.fs13}}>Nenhuma contagem agendada.</div>}
          {sortedSch.map(sd=>{
            const days=daysUntil(sd.date),ov=days<0&&!sd.done;
            const color=sd.done?T.green:ov?T.red:days<=2?T.yellow:T.text;
            return(
              <div key={sd.id} style={{...S.card({marginBottom:10,border:`1px solid ${color}20`}),display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:T.fs13,color}}>{sd.label}</div>
                  <div style={{fontSize:T.fs11,color:T.textMuted,marginTop:2}}>
                    {fmtDate(sd.date)}{" "}
                    {sd.done?"· ✅ Concluído (pelo contador)":ov?"· ⚠️ ATRASADA — aguardando realização":days===0?"· 📋 HOJE":`· em ${days} dia${days!==1?"s":""}`}
                  </div>
                </div>
                <div style={{display:"flex",gap:6,marginLeft:8}}>
                  {!sd.done&&<button onClick={()=>startEditSch(sd)} style={S.btn(T.accent,false,true)}>✏️</button>}
                  <button onClick={()=>setConfirm({message:`Excluir "${sd.label}"?`,onConfirm:()=>{setScheduledDates(prev=>prev.filter(s=>s.id!==sd.id));setConfirm(null);}})} style={S.btn(T.red,false,true)}>🗑</button>
                </div>
              </div>
            );
          })}
          <div style={{...S.card({marginTop:8,background:T.accent+"08",border:`1px solid ${T.accent}20`,padding:"12px 14px"})}}>
            <div style={{fontSize:T.fs11,color:T.textSub,lineHeight:1.7}}>
              ℹ️ O status <b style={{color:T.green}}>Concluído</b> é marcado automaticamente quando o contador realiza a contagem. Contagens <b style={{color:T.red}}>atrasadas</b> ficam disponíveis para realizar e são concluídas ao enviar.
            </div>
          </div>
        </div>
      )}
      {subTab==="evolution"&&<EvoTab items={items} countings={countings}/>}
    </div>
  );
}

// ─── BUY TAB ─────────────────────────────────────────────────────────────────
function BuyTab({items,setItems,countings,purchases,setPurchases}) {
  const [subTab,setSubTab]=useState("program");
  const lastC=countings.length?[...countings].sort((a,b)=>b.date?.localeCompare(a.date))[0]:null;
  const lc={};if(lastC)(lastC.items||[]).forEach(ci=>{lc[ci.id]=ci.counted;});

  // Recalculate suggestion considering already purchased quantities
  const getPurchasedQty = (itemId) => (purchases||[]).filter(p=>p.itemId===itemId).reduce((s,p)=>s+Number(p.qty||0),0);

  const allSug=items.filter(i=>{
    const cur=(lc[i.id]??0) + getPurchasedQty(i.id);
    if(i.max&&cur<i.max) return true;
    if(!i.max&&i.min&&cur<i.min) return true;
    return false;
  }).map(i=>{
    const curBase=lc[i.id]??0;
    const alreadyBought=getPurchasedQty(i.id);
    const cur=curBase+alreadyBought;
    const need=i.max?Math.max(i.max-cur,0):Math.max(i.min-cur+i.min,0);
    return{...i,curBase,alreadyBought,cur,need,est:Number(i.value||0)*need};
  }).filter(i=>i.need>0);

  const [sel,setSel]=useState(()=>Object.fromEntries(allSug.map(i=>[i.id,true])));
  useEffect(()=>{setSel(prev=>{const next={};allSug.forEach(i=>{next[i.id]=prev[i.id]!==undefined?prev[i.id]:true;});return next;});},[countings.length,JSON.stringify((purchases||[]).map(p=>p.id))]);

  // Purchase modal (add or edit)
  const [buyModal,setBuyModal]=useState(null);
  const [editPurchaseId,setEditPurchaseId]=useState(null);
  const [buyQty,setBuyQty]=useState("");
  const [buyDate,setBuyDate]=useState(todayStr());
  const [buyNote,setBuyNote]=useState("");
  const [buyAttach,setBuyAttach]=useState(null);
  const [buyAttachName,setBuyAttachName]=useState("");
  const [confirmDel,setConfirmDel]=useState(null);
  const buyFileRef=useRef();

  const openBuy=(it)=>{setEditPurchaseId(null);setBuyModal(it);setBuyQty(String(it.need));setBuyDate(todayStr());setBuyNote("");setBuyAttach(null);setBuyAttachName("");};
  const openEditPurchase=(p)=>{
    const it=items.find(i=>i.id===p.itemId);
    setEditPurchaseId(p.id);
    setBuyModal(it||{id:p.itemId,name:p.itemName,unit:"",value:0,need:0});
    setBuyQty(String(p.qty));setBuyDate(p.date);setBuyNote(p.note||"");setBuyAttach(p.attachment||null);setBuyAttachName(p.attachmentName||"");
  };

  const confirmBuy=()=>{
    const qty=Number(buyQty);
    if(!qty||qty<=0) return;
    if(editPurchaseId!==null){
      // Edit existing purchase in global list
      setPurchases(prev=>(prev||[]).map(p=>p.id===editPurchaseId?{...p,qty,date:buyDate,note:buyNote,attachment:buyAttach,attachmentName:buyAttachName}:p));
      // Also update inline purchase inside item
      setItems(prev=>prev.map(it=>{
        if(it.id!==buyModal.id) return it;
        return {...it,purchases:(it.purchases||[]).map(p=>p.id===editPurchaseId?{...p,qty,date:buyDate,note:buyNote,attachment:buyAttach,attachmentName:buyAttachName}:p)};
      }));
    } else {
      // New purchase
      const purchase={id:Date.now(),itemId:buyModal.id,itemName:buyModal.name,itemValue:Number(buyModal.value||0),qty,date:buyDate,note:buyNote,attachment:buyAttach,attachmentName:buyAttachName};
      setPurchases(prev=>[...(prev||[]),purchase]);
      setItems(prev=>prev.map(it=>{
        if(it.id!==buyModal.id) return it;
        return {...it,purchases:[...(it.purchases||[]),{id:purchase.id,qty,date:buyDate,note:buyNote,attachment:buyAttach,attachmentName:buyAttachName}]};
      }));
    }
    setBuyModal(null);setEditPurchaseId(null);
  };

  const deletePurchase=(p)=>{
    setPurchases(prev=>(prev||[]).filter(x=>x.id!==p.id));
    setItems(prev=>prev.map(it=>{
      if(it.id!==p.itemId) return it;
      return {...it,purchases:(it.purchases||[]).filter(x=>x.id!==p.id)};
    }));
    setConfirmDel(null);
  };

  const selItems=allSug.filter(i=>sel[i.id]);
  const totalEst=selItems.reduce((s,i)=>s+i.est,0);
  const toggleAll=()=>{const all=allSug.every(i=>sel[i.id]);setSel(Object.fromEntries(allSug.map(i=>[i.id,!all])));};

  // Group purchases by item for history
  const allPurchases=[...(purchases||[])].sort((a,b)=>(b.date||"").localeCompare(a.date||""));
  const itemsWithPurchases=[...new Set(allPurchases.map(p=>p.itemId))].map(itemId=>{
    const it=items.find(i=>i.id===itemId)||{id:itemId,name:allPurchases.find(p=>p.itemId===itemId)?.itemName||"?",unit:"",value:0};
    const ps=allPurchases.filter(p=>p.itemId===itemId).sort((a,b)=>(b.date||"").localeCompare(a.date||""));
    const totalQty=ps.reduce((s,p)=>s+Number(p.qty||0),0);
    const totalVal=ps.reduce((s,p)=>s+Number(p.qty||0)*Number(p.itemValue||it.value||0),0);
    return{it,ps,totalQty,totalVal};
  });
  const [selHistory,setSelHistory]=useState(null); // null = all selected by default
  const isHistSel = (id) => selHistory===null || !!selHistory[id];
  const toggleHistSel=(id)=>{
    // If null (all selected), convert to explicit map first
    const base = selHistory===null ? Object.fromEntries(itemsWithPurchases.map(g=>[g.it.id,true])) : {...selHistory};
    base[id]=!base[id];
    setSelHistory(base);
  };
  const toggleAllHist=()=>{
    const allSel = itemsWithPurchases.every(g=>isHistSel(g.it.id));
    if(allSel) setSelHistory(Object.fromEntries(itemsWithPurchases.map(g=>[g.it.id,false])));
    else setSelHistory(null);
  };
  const selHistItems=itemsWithPurchases.filter(g=>isHistSel(g.it.id));
  const totalHistVal=selHistItems.reduce((s,g)=>s+g.totalVal,0);
  const totalHistQty=selHistItems.reduce((s,g)=>s+g.totalQty,0);

  return (
    <div>
      {/* Confirm delete */}
      {confirmDel&&<ConfirmModal message={`Excluir esta compra de ${confirmDel.qty} ${items.find(i=>i.id===confirmDel.itemId)?.unit||""} de "${confirmDel.itemName}"?`} onConfirm={()=>deletePurchase(confirmDel)} onCancel={()=>setConfirmDel(null)}/>}

      {/* Buy/Edit modal */}
      {buyModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:20,fontFamily:T.fontBase,overflowY:"auto"}}>
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:"22px 18px",width:"100%",maxWidth:360}}>
            <div style={{fontWeight:700,fontSize:T.fs15,color:T.green,marginBottom:4}}>{editPurchaseId?"✏️ Editar Compra":"🛒 Registrar Compra"}</div>
            <div style={{fontSize:T.fs13,color:T.textSub,marginBottom:14}}>{buyModal.name}</div>
            <div style={S.label}>Quantidade comprada</div>
            <input type="number" value={buyQty} onChange={e=>setBuyQty(e.target.value)} onBlur={e=>{const n=parseFloat(e.target.value);if(!isNaN(n))setBuyQty(String(n));}} style={{...S.input({marginBottom:10})}}/>
            <div style={S.label}>Data da compra</div>
            <input type="date" value={buyDate} onChange={e=>setBuyDate(e.target.value)} style={{...S.input({marginBottom:10})}}/>
            <div style={S.label}>Observação (opcional)</div>
            <input placeholder="Ex: Fornecedor XYZ" value={buyNote} onChange={e=>setBuyNote(e.target.value)} style={{...S.input({marginBottom:10})}}/>
            <div style={S.label}>Anexo (nota fiscal, etc)</div>
            <button onClick={()=>buyFileRef.current.click()} style={{...S.btn(T.purple,true,true),marginBottom:buyAttach?8:14,justifyContent:"flex-start"}}>📎 {buyAttachName||"Selecionar arquivo"}</button>
            <input ref={buyFileRef} type="file" accept="image/*,.pdf" onChange={e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{setBuyAttach(ev.target.result);setBuyAttachName(f.name);};r.readAsDataURL(f);}} style={{display:"none"}}/>
            {buyAttach?.startsWith("data:image")&&<img src={buyAttach} alt="" style={{width:"100%",maxHeight:90,objectFit:"cover",borderRadius:8,marginBottom:10}}/>}
            <div style={{display:"flex",gap:8}}>
              <button onClick={confirmBuy} style={S.btn(T.green)}>{editPurchaseId?"💾 Salvar":"✅ Confirmar"}</button>
              <button onClick={()=>{setBuyModal(null);setEditPurchaseId(null);}} style={{...S.btn(T.surface),border:`1px solid ${T.border}`,color:T.textSub}}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <div style={{display:"flex",gap:2,marginBottom:16,background:T.surface,borderRadius:10,padding:3,border:`1px solid ${T.border}`}}>
        {[["program","🛒 Programação"],["history","📦 Compras Realizadas"]].map(([k,l])=>(
          <button key={k} onClick={()=>setSubTab(k)} style={{flex:1,background:subTab===k?T.card:"transparent",border:subTab===k?`1px solid ${T.border}`:"1px solid transparent",borderRadius:8,padding:"8px 4px",color:subTab===k?T.text:T.textMuted,fontWeight:subTab===k?700:500,fontSize:T.fs11,cursor:"pointer",fontFamily:T.fontBase}}>{l}</button>
        ))}
      </div>

      {subTab==="program"&&(
        <div>
          <div style={{...S.card({marginBottom:16,background:T.accent+"08",border:`1px solid ${T.accent}20`,padding:"14px 16px"})}}>
            <div style={{fontWeight:700,color:T.accent,fontSize:T.fs14,marginBottom:4}}>🛒 Programação de Compras</div>
            <div style={{fontSize:T.fs12,color:T.textMuted}}>
              {lastC?`Baseado na última contagem: ${lastC.label} · ${fmtDate(lastC.date)}`:"Realize pelo menos uma contagem para gerar sugestões."}
            </div>
            <div style={{fontSize:T.fs11,color:T.textMuted,marginTop:4}}>Itens abaixo do máximo. Compras já registradas são descontadas automaticamente.</div>
          </div>
          {!lastC&&<div style={{textAlign:"center",color:T.textMuted,padding:"40px 0",fontSize:T.fs13}}>Realize pelo menos uma contagem para ver sugestões.</div>}
          {lastC&&allSug.length===0&&<div style={{textAlign:"center",color:T.green,padding:"40px 0",fontWeight:600,fontSize:T.fs14}}>✅ Todos os insumos já atingiram o máximo!<br/><span style={{fontSize:T.fs12,color:T.textMuted,fontWeight:400}}>Incluindo compras já registradas.</span></div>}
          {allSug.length>0&&(
            <>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{fontSize:T.fs12,color:T.textMuted}}>{selItems.length} de {allSug.length} itens</div>
                <button onClick={toggleAll} style={{...S.btn(T.surface,false,true),border:`1px solid ${T.border}`,color:T.textSub,fontSize:T.fs11}}>{allSug.every(i=>sel[i.id])?"Desmarcar todos":"Selecionar todos"}</button>
              </div>
              {allSug.map(it=>(
                <div key={it.id} style={{...S.card({marginBottom:10,border:`1px solid ${sel[it.id]?T.accent:T.border}`,background:sel[it.id]?T.accent+"06":T.card})}}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                    <div onClick={()=>setSel(p=>({...p,[it.id]:!p[it.id]}))} style={{width:20,height:20,borderRadius:5,border:`2px solid ${sel[it.id]?T.accent:T.textMuted}`,background:sel[it.id]?T.accent:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:2,cursor:"pointer"}}>
                      {sel[it.id]&&<span style={{color:"#fff",fontSize:12,fontWeight:900}}>✓</span>}
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:T.fs14,marginBottom:2}}>{it.name}</div>
                      <div style={{fontSize:T.fs12,color:T.accent,marginBottom:10}}>{it.unit}</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
                        <div style={{background:T.surface,borderRadius:9,padding:"9px 8px"}}>
                          <div style={{fontSize:T.fs10,color:T.textMuted,marginBottom:2,textTransform:"uppercase",fontWeight:600}}>Contado na Última Contagem</div>
                          <div style={{fontFamily:T.fontMono,fontSize:T.fs15,fontWeight:700,color:T.red}}>{it.curBase}</div>
                          {it.alreadyBought>0&&<div style={{fontSize:T.fs10,color:T.green}}>+{it.alreadyBought} comprado</div>}
                        </div>
                        <div style={{background:T.surface,borderRadius:9,padding:"9px 8px"}}>
                          <div style={{fontSize:T.fs10,color:T.textMuted,marginBottom:2,textTransform:"uppercase",fontWeight:600}}>Necessário</div>
                          <div style={{fontFamily:T.fontMono,fontSize:T.fs15,fontWeight:700,color:T.yellow}}>+{it.need}</div>
                        </div>
                        <div style={{background:T.surface,borderRadius:9,padding:"9px 8px"}}>
                          <div style={{fontSize:T.fs10,color:T.textMuted,marginBottom:2,textTransform:"uppercase",fontWeight:600}}>Valor Unitário</div>
                          <div style={{fontFamily:T.fontMono,fontSize:T.fs12,fontWeight:700,color:T.textSub}}>{fmtCur(it.value)}</div>
                        </div>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:T.green+"0a",border:`1px solid ${T.green}20`,borderRadius:9,padding:"7px 10px",marginBottom:8}}>
                        <div style={{fontSize:T.fs11,color:T.textMuted,textTransform:"uppercase",fontWeight:600}}>Valor estimado</div>
                        <div style={{fontFamily:T.fontMono,fontSize:T.fs13,fontWeight:700,color:T.green}}>{fmtCur(it.est)}</div>
                      </div>
                      {(it.min||it.max)&&<div style={{fontSize:T.fs11,color:T.textMuted,marginBottom:8}}>Mínimo: {it.min||"—"} · Máximo: {it.max||"—"}</div>}
                      <button onClick={()=>openBuy(it)} style={{...S.btn(T.green,true,true),fontSize:T.fs12}}>🛒 Registrar compra</button>
                    </div>
                  </div>
                </div>
              ))}
              <div style={{...S.card({border:`1px solid ${T.yellow}30`,background:T.yellow+"08"}),display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4}}>
                <div style={{fontWeight:700,color:T.yellow,fontSize:T.fs14}}>💰 Total Estimado (selecionados)</div>
                <div style={{fontFamily:T.fontMono,fontSize:T.fs18,fontWeight:700,color:T.yellow}}>{fmtCur(totalEst)}</div>
              </div>
              <div style={{fontSize:T.fs10,color:T.textMuted,marginTop:6}}>* Quantidade contada na última contagem validada</div>
            </>
          )}
        </div>
      )}

      {subTab==="history"&&(
        <div>
          <div style={{...S.card({marginBottom:14,background:T.green+"08",border:`1px solid ${T.green}20`,padding:"12px 14px"})}}>
            <div style={{fontWeight:700,color:T.green,fontSize:T.fs13,marginBottom:2}}>📦 Compras Realizadas</div>
            <div style={{fontSize:T.fs11,color:T.textMuted}}>Agrupado por insumo. Selecione para calcular o total de compras.</div>
          </div>

          {itemsWithPurchases.length===0&&<div style={{textAlign:"center",color:T.textMuted,padding:"40px 0",fontSize:T.fs13}}>Nenhuma compra registrada ainda.</div>}

          {itemsWithPurchases.length>0&&(
            <>
              {/* Select all + grand total */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <button onClick={toggleAllHist} style={{...S.btn(T.surface,false,true),border:`1px solid ${T.border}`,color:T.textSub,fontSize:T.fs11}}>{itemsWithPurchases.every(g=>selHistory[g.it.id])?"Desmarcar todos":"Selecionar todos"}</button>
                <div style={{fontSize:T.fs12,color:T.textMuted}}>{selHistItems.length} de {itemsWithPurchases.length} selecionados</div>
              </div>

              {itemsWithPurchases.map(({it,ps,totalQty,totalVal})=>{
                const isSel=isHistSel(it.id);
                return(
                  <div key={it.id} style={{...S.card({marginBottom:12,border:`1px solid ${isSel?T.green:T.border}`,background:isSel?T.green+"05":T.card})}}>
                    {/* Item header with checkbox */}
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                      <div onClick={()=>toggleHistSel(it.id)} style={{width:20,height:20,borderRadius:5,border:`2px solid ${isSel?T.green:T.textMuted}`,background:isSel?T.green:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,cursor:"pointer"}}>
                        {isSel&&<span style={{color:"#fff",fontSize:12,fontWeight:900}}>✓</span>}
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:700,fontSize:T.fs14}}>{it.name}</div>
                        <div style={{fontSize:T.fs11,color:T.accent}}>{it.unit}</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontFamily:T.fontMono,fontSize:T.fs13,fontWeight:700,color:T.green}}>{fmtCur(totalVal)}</div>
                        <div style={{fontSize:T.fs10,color:T.textMuted}}>{totalQty} {it.unit} total</div>
                      </div>
                    </div>
                    {/* Individual purchases */}
                    {ps.map(p=>(
                      <div key={p.id} style={{background:T.surface,borderRadius:9,padding:"9px 12px",marginBottom:6}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:p.note?4:0}}>
                          <div>
                            <div style={{fontSize:T.fs12,color:T.text,fontWeight:600}}>{fmtDate(p.date)}</div>
                            {p.note&&<div style={{fontSize:T.fs11,color:T.textMuted}}>📝 {p.note}</div>}
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <div style={{textAlign:"right"}}>
                              <div style={{fontFamily:T.fontMono,fontSize:T.fs14,fontWeight:700,color:T.green}}>+{p.qty}</div>
                              <div style={{fontSize:T.fs10,color:T.textMuted}}>{fmtCur(Number(p.qty)*Number(p.itemValue||it.value||0))}</div>
                            </div>
                            <div style={{display:"flex",gap:4}}>
                              <button onClick={()=>openEditPurchase(p)} style={{...S.btn(T.accent,false,true),padding:"5px 8px",fontSize:T.fs10}}>✏️</button>
                              <button onClick={()=>setConfirmDel(p)} style={{...S.btn(T.red,false,true),padding:"5px 8px",fontSize:T.fs10}}>🗑</button>
                            </div>
                          </div>
                        </div>
                        {p.attachment?.startsWith("data:image")&&<img src={p.attachment} alt="" style={{width:"100%",maxHeight:80,objectFit:"cover",borderRadius:7,marginTop:6}}/>}
                        {p.attachmentName&&!p.attachment?.startsWith("data:image")&&<div style={{fontSize:T.fs10,color:T.purple,marginTop:4}}>📎 {p.attachmentName}</div>}
                      </div>
                    ))}
                    {/* Item subtotal */}
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:T.green+"08",borderRadius:8,padding:"7px 10px",marginTop:4}}>
                      <span style={{fontSize:T.fs11,color:T.textMuted,fontWeight:600,textTransform:"uppercase"}}>Subtotal do insumo</span>
                      <span style={{fontFamily:T.fontMono,fontSize:T.fs13,fontWeight:700,color:T.green}}>{fmtCur(totalVal)}</span>
                    </div>
                  </div>
                );
              })}

              {/* Grand total of selected */}
              {selHistItems.length>0&&(
                <div style={{...S.card({border:`1px solid ${T.yellow}30`,background:T.yellow+"08",padding:"14px 16px"})}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <div style={{fontWeight:700,color:T.yellow,fontSize:T.fs14}}>💰 Total Selecionado</div>
                    <div style={{fontFamily:T.fontMono,fontSize:T.fs18,fontWeight:700,color:T.yellow}}>{fmtCur(totalHistVal)}</div>
                  </div>
                  <div style={{fontSize:T.fs11,color:T.textMuted}}>{selHistItems.length} insumo{selHistItems.length!==1?"s":""} · {totalHistQty} unidades no total</div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── EVOLUTION TAB ───────────────────────────────────────────────────────────
function EvoTab({items,countings}) {
  const [selItem,setSelItem]=useState("all");
  const sorted=[...countings].sort((a,b)=>a.date?.localeCompare(b.date));
  const getSeries=()=>{
    const init=selItem==="all"
      ?{qty:items.reduce((s,i)=>s+Number(i.acquiredQty||0),0),label:"Aquisição Inicial",date:null}
      :(()=>{const it=items.find(i=>i.id===Number(selItem));return{qty:Number(it?.acquiredQty||0),label:"Aquisição Inicial",date:null};})();
    const rows=sorted.map(c=>{
      if(selItem==="all"){const qty=(c.items||[]).reduce((s,ci)=>s+ci.counted,0);return{qty,label:c.label,date:c.date};}
      const ci=(c.items||[]).find(i=>i.id===Number(selItem));
      return{qty:ci?.counted??0,label:c.label,date:c.date};
    });
    return[init,...rows];
  };
  const series=getSeries();
  const baseline=series[0]?.qty||0;
  const maxQ=Math.max(...series.map(d=>d.qty),baseline,1);
  const si=selItem==="all"?null:items.find(i=>i.id===Number(selItem));
  const minR=si?.min||null;const maxR=si?.max||null;
  return (
    <div>
      <div style={{marginBottom:14}}>
        <div style={S.label}>Filtrar por insumo</div>
        <select value={selItem} onChange={e=>setSelItem(e.target.value)} style={S.input()}>
          <option value="all">Todos os insumos (total geral)</option>
          {items.map(i=><option key={i.id} value={String(i.id)}>{i.name}</option>)}
        </select>
      </div>
      {sorted.length===0&&<div style={{textAlign:"center",color:T.textMuted,padding:"40px 0",fontSize:T.fs13}}>Nenhuma contagem registrada ainda.</div>}
      {sorted.length>0&&(
        <>
          <div style={S.card({marginBottom:14,padding:"16px 14px"})}>
            <div style={{fontWeight:700,marginBottom:4,color:T.accent,fontSize:T.fs13}}>📊 Evolução em Quantidade</div>
            <div style={{fontSize:T.fs11,color:T.textMuted,marginBottom:14}}>Barra laranja = referência inicial. Verde = maior, vermelho = menor.</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {series.map((d,i)=>{
                const pct=maxQ>0?(d.qty/maxQ)*100:0;
                const isB=i===0;
                const diff=i>0?d.qty-baseline:null;
                const bc=isB?T.warm:diff===null?T.accent:diff>=0?T.green:T.red;
                return (
                  <div key={i}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                      <div style={{fontSize:T.fs12,color:isB?T.warm:T.text,fontWeight:isB?700:500,flex:1,paddingRight:8,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                        {d.label}{d.date?<span style={{color:T.textMuted,fontSize:T.fs10}}> · {fmtDate(d.date)}</span>:""}
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                        {diff!==null&&<span style={{fontSize:T.fs11,fontWeight:700,color:diff>0?T.green:diff<0?T.red:T.textMuted,fontFamily:T.fontMono}}>{diff>0?`+${diff}`:diff<0?String(diff):"="}</span>}
                        <span style={{fontFamily:T.fontMono,fontSize:T.fs13,fontWeight:700,color:bc,minWidth:30,textAlign:"right"}}>{d.qty}</span>
                      </div>
                    </div>
                    <div style={{position:"relative",height:18,background:T.surface,borderRadius:6,overflow:"hidden"}}>
                      {!isB&&baseline>0&&<div style={{position:"absolute",left:`${(baseline/maxQ)*100}%`,top:0,bottom:0,width:2,background:T.warm+"88",zIndex:2}}/>}
                      {minR&&maxR&&<><div style={{position:"absolute",left:`${(minR/maxQ)*100}%`,top:0,bottom:0,width:1,background:T.red+"66",zIndex:2}}/><div style={{position:"absolute",left:`${(maxR/maxQ)*100}%`,top:0,bottom:0,width:1,background:T.purple+"66",zIndex:2}}/></>}
                      <div style={{height:"100%",width:`${pct}%`,background:bc,borderRadius:6,transition:"width .5s",opacity:.85}}/>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:12,fontSize:T.fs10,color:T.textMuted}}>
              <span>🟧 Inicial</span><span>🟩 Maior</span><span>🟥 Menor</span>
              {minR&&<span style={{color:T.red}}>│ mínimo ({minR})</span>}
              {maxR&&<span style={{color:T.purple}}>│ máximo ({maxR})</span>}
            </div>
          </div>
          <div style={S.card()}>
            <div style={{fontWeight:700,marginBottom:12,color:T.purple,fontSize:T.fs13}}>📋 Tabela Comparativa</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",minWidth:400}}>
                <thead>
                  <tr style={{background:T.surface}}>{["Contagem","Data","Insumo","Quantidade","Diferença"].map((h,i)=><th key={i} style={{padding:"7px 8px",textAlign:"left",color:T.textMuted,fontWeight:600,fontSize:T.fs11,whiteSpace:"nowrap"}}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {series.map((d,i)=>{const prev=i>0?series[i-1]:null;const diff=prev?d.qty-prev.qty:null;return(
                    <tr key={i} style={{borderBottom:`1px solid ${T.border}`}}>
                      <td style={{padding:"7px 8px",fontWeight:i===0?700:500,color:i===0?T.warm:T.text,fontSize:T.fs12,whiteSpace:"nowrap"}}>{d.label}</td>
                      <td style={{padding:"7px 8px",color:T.textMuted,fontSize:T.fs12,whiteSpace:"nowrap"}}>{d.date?fmtDate(d.date):"—"}</td>
                      <td style={{padding:"7px 8px",color:T.textSub,fontSize:T.fs12}}>{selItem==="all"?"Todos":si?.name||"—"}</td>
                      <td style={{padding:"7px 8px",fontFamily:T.fontMono,color:T.accent,fontSize:T.fs12,fontWeight:600}}>{d.qty}</td>
                      <td style={{padding:"7px 8px"}}>{diff!==null?<span style={{color:diff>0?T.green:diff<0?T.red:T.textMuted,fontWeight:700,fontFamily:T.fontMono,fontSize:T.fs12}}>{diff>0?"+":""}{diff}</span>:<span style={{color:T.textMuted,fontSize:T.fs12}}>—</span>}</td>
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── CONFIG TAB ───────────────────────────────────────────────────────────────
function CfgTab({appPass,setAppPass,passHint,setPassHint,whatsapp,setWhatsapp}) {
  const [cur,setCur]=useState(""); const [nw,setNw]=useState(""); const [cf,setCf]=useState("");
  const [hint,setHint]=useState(passHint||""); const [phone,setPhone]=useState(whatsapp||"");
  const [show,setShow]=useState(false); const [msg,setMsg]=useState(null); const [wMsg,setWMsg]=useState(null);
  useEffect(()=>{setPhone(whatsapp||"");},[whatsapp]);
  const savePass=()=>{
    if(cur!==appPass){setMsg({text:"Senha atual incorreta.",ok:false});return;}
    if(nw.length<4){setMsg({text:"Mínimo 4 caracteres.",ok:false});return;}
    if(nw!==cf){setMsg({text:"As senhas não coincidem.",ok:false});return;}
    setAppPass(nw);if(hint.trim())setPassHint(hint.trim());
    setCur("");setNw("");setCf("");setMsg({text:"✅ Senha salva!",ok:true});
  };
  const savePhone=()=>{const n=normPhone(phone);if(n.length<10){setWMsg({text:"Número inválido.",ok:false});return;}setWhatsapp(n);setWMsg({text:"✅ WhatsApp salvo!",ok:true});};
  return (
    <div>
      <div style={S.card({marginBottom:14,padding:"18px"})}>
        <div style={{fontWeight:700,fontSize:T.fs14,marginBottom:14}}>🔑 Alterar Senha</div>
        <div style={S.label}>Senha atual</div><input type={show?"text":"password"} placeholder="Senha atual" value={cur} onChange={e=>{setCur(e.target.value);setMsg(null);}} style={{...S.input({marginBottom:10})}}/>
        <div style={S.label}>Nova senha</div><input type={show?"text":"password"} placeholder="Nova senha" value={nw} onChange={e=>{setNw(e.target.value);setMsg(null);}} style={{...S.input({marginBottom:10})}}/>
        <div style={S.label}>Confirmar nova senha</div><input type={show?"text":"password"} placeholder="Repita a nova senha" value={cf} onChange={e=>{setCf(e.target.value);setMsg(null);}} style={{...S.input({marginBottom:10})}}/>
        <div style={S.label}>Dica de senha</div><input placeholder='"Nome do meu pet"' value={hint} onChange={e=>setHint(e.target.value)} style={{...S.input({marginBottom:10})}}/>
        <label style={{display:"flex",alignItems:"center",gap:6,color:T.textMuted,fontSize:T.fs12,cursor:"pointer",marginBottom:14}}><input type="checkbox" checked={show} onChange={e=>setShow(e.target.checked)}/> Mostrar senhas</label>
        {msg&&<div style={{color:msg.ok?T.green:T.red,fontSize:T.fs12,marginBottom:10,fontWeight:600}}>{msg.text}</div>}
        <button onClick={savePass} style={S.btn(T.warm,true)}>Salvar Senha</button>
      </div>
      <div style={S.card({padding:"18px"})}>
        <div style={{fontWeight:700,fontSize:T.fs14,marginBottom:4}}>📲 WhatsApp</div>
        {whatsapp&&<div style={{fontSize:T.fs12,color:T.green,marginBottom:10}}>✅ Número ativo: <span style={S.mono}>+{whatsapp}</span></div>}
        <div style={S.label}>Número (DDI + DDD + número)</div>
        <input placeholder="Ex: 5586999436523" value={phone} onChange={e=>{setPhone(e.target.value);setWMsg(null);}} style={{...S.input({marginBottom:6,...S.mono})}}/>
        <div style={{fontSize:T.fs11,color:T.textMuted,marginBottom:12}}>Exemplo: 55 + 86 + número</div>
        {wMsg&&<div style={{color:wMsg.ok?T.green:T.red,fontSize:T.fs12,marginBottom:10,fontWeight:600}}>{wMsg.text}</div>}
        <button onClick={savePhone} style={S.btn(T.green)}>💾 Salvar número</button>
      </div>
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const data = useAppData();
  const [screen, setScreen] = useState("home");

  const goHome = useCallback(() => setScreen("home"), []);
  const goManager = useCallback(() => setScreen("manager"), []);
  const goManagerLogin = useCallback(() => setScreen("managerLogin"), []);
  const goCounter = useCallback(() => setScreen("counter"), []);

  // Show loader only on very first load, never block navigation
  if (data.loading && screen === "home") {
    return (
      <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:T.fontBase}}>
        <div style={{color:T.textMuted,fontFamily:T.fontMono,fontSize:T.fs13}}>Carregando…</div>
      </div>
    );
  }

  const renderScreen = () => {
    switch(screen) {
      case "managerLogin":
        return <ManagerLogin appPass={data.appPass} passHint={data.passHint} onLogin={goManager} onBack={goHome}/>;
      case "manager":
        return <ManagerPanel data={data} onBack={goHome}/>;
      case "counter": {
        const handleSubmit = (counting, sd) => {
          data.setCountings(prev => [...prev, counting]);
          if (sd) data.setScheduledDates(prev => prev.map(s => s.id === sd.id ? {...s, done:true} : s));
        };
        return <CounterView items={data.items} countings={data.countings} scheduledDates={data.scheduledDates} onSubmit={handleSubmit} onBack={goHome} whatsapp={data.whatsapp}/>;
      }
      case "home":
      default:
        return <HomeScreen onManager={goManagerLogin} onCounter={goCounter} scheduledDates={data.scheduledDates}/>;
    }
  };

  return renderScreen();
}
