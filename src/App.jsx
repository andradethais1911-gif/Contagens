import { useState, useEffect, useCallback, useRef } from "react";
import React from "react";

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
      const r = await fetch(`/api/storage?key=${encodeURIComponent(k)}`, {cache:"no-store"});
      if (!r.ok) return null;
      const text = await r.text();
      if (!text || text.trim()==="") return null;
      const j = JSON.parse(text);
      if (j.value === null || j.value === undefined) return null;
      if (typeof j.value !== "string") return j.value;
      try { return JSON.parse(j.value); } catch { return j.value; }
    } catch { return null; }
  },
  async set(k, v) {
    try {
      await fetch("/api/storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
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
  text:"#f1f5f9", textSub:"#94a3b8", textMuted:"#64748b",
  fontBase:"'Inter',sans-serif", fontMono:"'JetBrains Mono',monospace",
  fs10:10,fs11:11,fs12:12,fs13:13,fs14:14,fs15:15,fs16:16,fs18:18,fs20:20,fs24:24
};



const daysUntil = s => { const n=new Date();n.setHours(0,0,0,0);const d=new Date(s+"T00:00:00");d.setHours(0,0,0,0);return Math.round((d-n)/86400000); };
const fmtDate = s => { if(!s)return"—";const[y,m,d]=s.split("-");return`${d}/${m}/${y}`; };
const todayStr = () => { const d=new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; };
const nowISO = () => new Date().toISOString(); // full datetime for countings/purchases
// Compare datetime strings: works for both "2026-04-04" and "2026-04-04T12:00:00Z"
const dateOf = s => s ? s.slice(0,10) : ""; // extract YYYY-MM-DD from any format
const normPhone = v => String(v||"").replace(/\D/g,"");
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
  // Cards com profundidade sutil — borda fina + sombra interna suave
  card: (x={}) => ({background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:"14px 16px",...x}),
  // Botões com gradiente sutil e sombra colorida
  btn:  (bg=T.accent,full=false,sm=false) => ({
    background:bg,
    border:"none",
    borderRadius:sm?9:11,
    padding:sm?"7px 14px":"10px 18px",
    color:"#fff",
    fontWeight:700,
    fontSize:sm?T.fs11:T.fs13,
    cursor:"pointer",
    fontFamily:T.fontBase,
    width:full?"100%":"auto",
    display:"inline-flex",
    alignItems:"center",
    justifyContent:"center",
    gap:6,
    letterSpacing:.2
  }),
  // Inputs com foco suave
  input:(x={}) => ({width:"100%",background:T.surface,border:`1.5px solid ${T.border}`,borderRadius:11,padding:"10px 13px",color:T.text,fontSize:T.fs13,outline:"none",boxSizing:"border-box",fontFamily:T.fontBase,...x}),
  label:{fontSize:T.fs11,color:T.textSub,marginBottom:5,fontWeight:700,letterSpacing:.4,textTransform:"uppercase"},
  // Tags com brilho de borda
  tag:  color=>({display:"inline-flex",alignItems:"center",padding:"2px 9px",borderRadius:6,fontSize:T.fs10,fontWeight:700,background:color+"18",color,fontFamily:T.fontMono,border:`1px solid ${color}33`}),
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
    const cols=[{l:"Insumo",x:32},{l:"Unidade",x:220},{l:"Quantidade Contabilizada",x:310},{l:"Mínimo",x:450},{l:"Máximo",x:520},{l:"Status",x:595},{l:"Compra Necessária",x:710}];
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
            {rendered&&<button onClick={download} style={{background:T.warm,border:"none",borderRadius:8,padding:"7px 14px",color:"#fff",fontWeight:700,fontSize:T.fs12,cursor:"pointer"}}>Salvar PNG</button>}
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

function openWA(url) {
  const a=document.createElement("a");
  a.href=url;a.target="_blank";a.rel="noopener noreferrer";
  document.body.appendChild(a);a.click();document.body.removeChild(a);
}

function buildWAMsg(counting, items) {
  const lines=(counting.items||[]).map(ci=>{
    const it=items.find(i=>i.id===ci.id)||ci;
    return `  - ${ci.name}: ${ci.counted??0} ${it.unit||""}`;
  }).join("\n");
  return `Olá, Teresa.\n\nSegue o relatório da contagem *${counting.label}*, realizada em ${fmtDate(counting.date)}.\n\n*Quantidades contabilizadas:*\n${lines}\n\nSolicito que acesse o sistema para verificar e validar esta contagem. Ao aprovar, o sistema gerará automaticamente a programação de compras para os insumos que precisam de reposição. Caso a contagem seja reprovada, um agendamento de recontagem será criado automaticamente. Nesse caso, por favor sinalize aqui via WhatsApp se será necessária a recontagem para que eu possa me programar.\n\n_Sistema de Gestão de Contagens_`;
}

function sendWA(phone, counting, items) {
  openWA(`https://wa.me/${normPhone(phone)}?text=${encodeURIComponent(buildWAMsg(counting,items))}`);
}

function sendWABlocked(phone, reason, nextFuture) {
  const msg=`Olá, Teresa.\n\nEstou tentando realizar a contagem de estoque${nextFuture?` referente a *${nextFuture.label}* (prevista para ${fmtDate(nextFuture.date)})`:""}, porém o sistema não está permitindo o acesso.\n\nMotivo: ${reason}\n\nPor favor, verifique o agendamento ou oriente como devo proceder.\n\n_Sistema de Gestão de Contagens_`;
  openWA(`https://wa.me/${normPhone(phone)}?text=${encodeURIComponent(msg)}`);
}

function useAppData() {
  const [state,setState] = useState({items:[],countings:[],scheduledDates:[],appPass:null,passHint:null,whatsapp:null,purchases:[]});
  const [loading,setLoading] = useState(true);
  const reload = useCallback(async()=>{
    try {
      const [items,countings,scheduledDates,appPass,passHint,whatsapp,purchases] = await Promise.all([
        DB.get("items_v2"),DB.get("countings_v2"),DB.get("scheduledDates"),DB.get("appPass"),DB.get("passHint"),DB.get("whatsapp"),DB.get("purchases_v1")
      ]);
      setState({items:items||[],countings:countings||[],scheduledDates:scheduledDates||[],appPass:appPass||DEFAULT_PASS,passHint:passHint||null,whatsapp:whatsapp||null,purchases:purchases||[]});
    } catch(e) {
      // Network error — use empty defaults so app still renders
      setState(p=>({...p,appPass:p.appPass||DEFAULT_PASS}));
    } finally {
      setLoading(false);
    }
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
  // Theme-aware decorative colors
  const glowA = `${T.accent}09`;
  const glowB = `${T.warm}07`;
  const cardBg = `linear-gradient(135deg,${T.accentDim}22,${T.accent}11)`;
  const cardBgW = `linear-gradient(135deg,${T.warmDim}22,${T.warm}11)`;
  return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,fontFamily:T.fontBase,position:"relative",overflow:"hidden"}}>
      {/* Decorative blobs */}
      <div style={{position:"absolute",inset:0,pointerEvents:"none"}}>
        <div style={{position:"absolute",top:"-15%",left:"-25%",width:500,height:500,borderRadius:"50%",background:`radial-gradient(circle,${glowA} 0%,transparent 65%)`}}/>
        <div style={{position:"absolute",bottom:"-10%",right:"-20%",width:400,height:400,borderRadius:"50%",background:`radial-gradient(circle,${glowB} 0%,transparent 65%)`}}/>

      </div>
      <div style={{position:"relative",width:"100%",maxWidth:380}}>

        {/* Logo + title */}
        <div style={{textAlign:"center",paddingTop:8,marginBottom:28}}>
          <div style={{width:72,height:72,background:`linear-gradient(135deg,${T.accent},${T.accentDim})`,borderRadius:20,display:"flex",alignItems:"center",justifyContent:"center",fontSize:32,margin:"0 auto 18px"}}>🏠</div>
          <div style={{fontFamily:T.fontMono,fontSize:T.fs24,fontWeight:700,color:T.text,letterSpacing:2,marginBottom:4}}>GESTÃO DE CONTAGENS</div>
          <div style={{fontSize:T.fs12,color:T.textMuted,letterSpacing:.5}}>Sistema de controle de estoque</div>
        </div>
        {/* Upcoming countings */}
        {upcoming.length>0&&(
          <div style={{background:T.yellow+"0d",border:`1px solid ${T.yellow}30`,borderRadius:12,padding:"12px 14px",marginBottom:16}}>
            <div style={{fontSize:T.fs11,fontWeight:700,color:T.yellow,marginBottom:8,textTransform:"uppercase",letterSpacing:.5}}>⏰ Próximas contagens</div>
            {upcoming.map(sd=>{const d=daysUntil(sd.date);return<div key={sd.id} style={{fontSize:T.fs12,color:T.text,marginBottom:3}}><span style={{color:T.yellow,fontWeight:700}}>{sd.label}</span> <span style={{color:T.textMuted}}>— {d===0?"HOJE":`em ${d} dia${d!==1?"s":""}`} ({fmtDate(sd.date)})</span></div>;})}
          </div>
        )}
        {/* Area buttons */}
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <button onClick={onCounter} style={{background:cardBg,border:`1px solid ${T.accent}30`,borderRadius:18,padding:"20px",cursor:"pointer",fontFamily:T.fontBase,display:"flex",alignItems:"center",gap:16,textAlign:"left",width:"100%"}}>
            <div style={{width:52,height:52,background:`linear-gradient(135deg,${T.accent},${T.accentDim})`,borderRadius:14,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>🧮</div>
            <div style={{flex:1}}>
              <div style={{fontFamily:T.fontMono,fontSize:T.fs14,fontWeight:700,color:T.accent,letterSpacing:1,marginBottom:4}}>ÁREA DO CONTADOR</div>
              <div style={{fontSize:T.fs12,color:T.textMuted,lineHeight:1.5}}>
                {active?(active.status==="today"?`📋 Contagem agendada para HOJE: ${active.sd.label}`:`⚠️ Contagem atrasada: ${active.sd.label} (${fmtDate(active.sd.date)})`):"Acesso livre · Preencha as quantidades"}
              </div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          <button onClick={onManager} style={{background:cardBgW,border:`1px solid ${T.warm}30`,borderRadius:18,padding:"20px",cursor:"pointer",fontFamily:T.fontBase,display:"flex",alignItems:"center",gap:16,textAlign:"left",width:"100%"}}>
            <div style={{width:52,height:52,background:`linear-gradient(135deg,${T.warm},${T.warmDim})`,borderRadius:14,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>🔐</div>
            <div style={{flex:1}}>
              <div style={{fontFamily:T.fontMono,fontSize:T.fs14,fontWeight:700,color:T.warm,letterSpacing:1,marginBottom:4}}>ÁREA DO GERENTE</div>
              <div style={{fontSize:T.fs12,color:T.textMuted}}>Acesso protegido por senha</div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.warm} strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
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
            <input type={show?"text":"password"} placeholder="Digite sua senha" value={pw} onChange={e=>{setPw(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&submit()} style={{...S.input({paddingRight:44})}}/>
            <button onClick={()=>setShow(p=>!p)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:T.textMuted,cursor:"pointer",fontSize:T.fs14}}>{show?(<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>):(<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>)}</button>
          </div>
          {err&&<div style={{color:T.red,fontSize:T.fs12,marginBottom:10}}>{err}</div>}
          <button onClick={submit} style={{...S.btn(T.warm,true),marginTop:4}}>Entrar</button>
          {passHint&&(
            <div style={{marginTop:14}}>
              <button onClick={()=>setShowHint(p=>!p)} style={{background:"none",border:"none",color:T.textMuted,cursor:"pointer",fontSize:T.fs12,width:"100%",textDecoration:"underline",fontFamily:T.fontBase}}>{showHint?"Ocultar dica":"Esqueci minha senha"}</button>
              {showHint&&<div style={{marginTop:10,background:T.yellow+"0f",border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 14px"}}><div style={{fontSize:T.fs11,color:T.yellow,fontWeight:700,marginBottom:4}}>💡 Dica</div><div style={{fontSize:T.fs13,color:T.text}}>{passHint}</div></div>}
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
  const [savedCounting,setSavedCounting]=useState(null);

  const active = getActiveScheduled(scheduledDates);
  const nextSched = active ? active.sd : null;
  const schedStatus = active ? active.status : null;
  const futureScheduled = (scheduledDates||[]).filter(sd=>!sd.done&&sd.date>todayStr()).sort((a,b)=>a.date.localeCompare(b.date));
  const nextFuture = futureScheduled[0]||null;
  const hasScheduled = (scheduledDates||[]).filter(sd=>!sd.done).length>0;
  const isBlocked = !active; // ALWAYS blocked unless there is an active scheduled date today or overdue
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
    const counting={id:Date.now(),label,date:countDate,datetime:nowISO(),items:result,validated:false};
    onSubmit(counting,nextSched);
    setSavedCounting(counting);
    setPhase("done");
  };

  if(!items.length) return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,fontFamily:T.fontBase,padding:24}}>
      <div style={{color:T.yellow,fontWeight:700,fontSize:T.fs16,textAlign:"center"}}>Nenhum insumo cadastrado.</div>
      <div style={{fontSize:T.fs13,color:T.textMuted,textAlign:"center"}}>Peça à Teresa para cadastrar os insumos no sistema.</div>
      <button onClick={onBack} style={S.btn(T.accent)}>← Voltar</button>
    </div>
  );

  // Done screen — must come BEFORE isBlocked check
  if(phase==="done") return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:0,fontFamily:T.fontBase,padding:24}}>
      <div style={{fontFamily:T.fontMono,fontSize:T.fs20,color:T.green,textAlign:"center",marginBottom:8,fontWeight:700}}>CONTAGEM FINALIZADA</div>
      <div style={{fontSize:T.fs13,color:T.textMuted,textAlign:"center",marginBottom:24,lineHeight:1.6}}>Contagem salva com sucesso. Envie o relatório para Teresa para que ela possa verificar e validar no sistema.</div>
      <div style={{width:"100%",maxWidth:340,display:"flex",flexDirection:"column",gap:12}}>
        {whatsapp&&savedCounting?(
          <a
            href={`https://wa.me/${normPhone(whatsapp)}?text=${encodeURIComponent(buildWAMsg(savedCounting,items))}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{display:"block",width:"100%",background:T.green,color:"#fff",fontWeight:700,fontSize:T.fs14,padding:"14px",borderRadius:10,textAlign:"center",textDecoration:"none",boxSizing:"border-box",fontFamily:T.fontBase}}
          >
            Enviar relatório para Teresa
          </a>
        ):(
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:"14px",textAlign:"center"}}>
            <div style={{fontSize:T.fs13,color:T.textMuted,marginBottom:4}}>Enviar relatório para Teresa</div>
            <div style={{fontSize:T.fs11,color:T.textMuted}}>Configure o WhatsApp na Aba Segurança para habilitar este botão.</div>
          </div>
        )}
        <button onClick={onBack} style={{...S.btn(T.surface,true),border:`1px solid ${T.border}`,color:T.textSub}}>← Voltar ao início</button>
      </div>
    </div>
  );

  if(phase==="start") return (
    <div style={{minHeight:"100vh",background:T.bg,color:T.text,fontFamily:T.fontBase,display:"flex",flexDirection:"column"}}>
      <div style={{background:T.surface,padding:"18px 18px 14px",borderBottom:`1px solid ${T.border}`}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:T.textMuted,cursor:"pointer",fontSize:T.fs13,marginBottom:10,padding:0,fontFamily:T.fontBase}}>← Voltar</button>
        <div style={{fontFamily:T.fontMono,fontSize:T.fs15,fontWeight:700,color:T.accent,marginBottom:2}}>ÁREA DO CONTADOR</div>
        <div style={{fontSize:T.fs13,color:T.text,fontWeight:600}}>{label}</div>
        {nextSched&&(
          <div style={{marginTop:6,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{fontSize:T.fs12,color:T.textMuted}}>Data prevista: <b style={{color:T.text}}>{fmtDate(nextSched.date)}</b></span>
            {schedStatus==="overdue"&&<span style={S.tag(T.red)}>ATRASADA</span>}
            {schedStatus==="today"&&<span style={S.tag(T.green)}>HOJE</span>}
          </div>
        )}
      </div>
      {nextSched&&schedStatus==="overdue"&&(
        <div style={{padding:"10px 18px",background:T.red+"10",borderBottom:`1px solid ${T.red}25`}}>
          <div style={{fontSize:T.fs12,color:T.red,fontWeight:600}}>Esta contagem deveria ter sido realizada em {fmtDate(nextSched.date)}. Realize agora para regularizar.</div>
        </div>
      )}
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
        <div style={{width:"100%",maxWidth:380}}>
          <div style={{...S.card({marginBottom:20,padding:"20px"})}}>
            <div style={{fontWeight:700,color:T.text,fontSize:T.fs14,marginBottom:14}}>Como realizar a contagem</div>
            {[["1.","Cada insumo aparece um por um na tela."],["2.","Vá até o local e conte fisicamente."],["3.","Digite a quantidade no teclado numérico."],["4.","Toque em ✓ para confirmar."],["5.","Use o rodapé para navegar entre insumos."],["6.","Ao finalizar todos, toque em Finalizar contagem."]].map(([n,t],i)=>(
              <div key={i} style={{display:"flex",gap:10,marginBottom:8,alignItems:"flex-start"}}>
                <span style={{fontSize:T.fs12,color:T.accent,fontWeight:700,fontFamily:T.fontMono,minWidth:18,lineHeight:1.6}}>{n}</span>
                <span style={{fontSize:T.fs13,color:T.textSub,lineHeight:1.6}}>{t}</span>
              </div>
            ))}
          </div>
          <button onClick={()=>setPhase("counting")} style={{...S.btn(T.accent,true),padding:"14px",fontSize:T.fs14,fontWeight:700}}>Iniciar — {total} {total===1?"insumo":"insumos"}</button>
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
            <div style={{...S.card({marginBottom:14,textAlign:"center",padding:"24px 20px",border:`1.5px solid ${isConf?T.green:T.accent}40`,background:isConf?T.green+"08":T.accent+"08",})}}>
              <div style={{fontSize:T.fs11,color:T.textMuted,marginBottom:6,fontFamily:T.fontMono,letterSpacing:1,textTransform:"uppercase"}}>Insumo {current+1} de {total}</div>
              <div style={{fontSize:T.fs24,fontWeight:800,color:T.text,lineHeight:1.2,marginBottom:10}}>{item.name}</div>
              <span style={{display:"inline-flex",alignItems:"center",background:T.accent+"18",border:`1px solid ${T.accent}30`,borderRadius:20,padding:"4px 14px",fontSize:T.fs12,color:T.accent,fontWeight:600}}>{item.unit||"Unidade(s)"}</span>
            </div>
            {isConf?(
              <div style={{...S.card({marginBottom:14,padding:"20px",background:T.green+"0a",border:`1px solid ${T.border}`})}}>
                <div style={{textAlign:"center",marginBottom:10}}>
                  <div style={{fontSize:T.fs12,color:T.green,fontWeight:700,marginBottom:6,textTransform:"uppercase"}}>✅ Quantidade registrada</div>
                  <div style={{fontFamily:T.fontMono,fontSize:52,fontWeight:700,color:T.green}}>{counts[item.id]}</div>
                  <div style={{fontSize:T.fs12,color:T.textMuted,marginTop:2}}>{item.unit||"Unidade(s)"}</div>
                </div>
                <div style={{display:"flex",justifyContent:"center",marginTop:12}}><button onClick={doEdit} style={{...S.btn(T.textMuted),padding:"6px 14px",fontSize:T.fs12}}>Editar</button></div>
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
              {!isConf&&!allDone&&<button onClick={doConfirm} disabled={inputVal===""} style={{...S.btn(inputVal!==""?T.green:T.textMuted,true),padding:"13px",fontSize:T.fs14,opacity:inputVal!==""?1:.45}}>✓ Confirmar</button>}
              {isConf&&current<total-1&&!allDone&&<button onClick={doNext} style={{...S.btn(T.accent,true),padding:"13px",fontSize:T.fs14}}>Próximo → ({current+2}/{total})</button>}
              {allDone&&(
                <>
                  <button onClick={doSend} style={{...S.btn(T.green,true),padding:"14px",fontSize:T.fs15,fontWeight:700}}>Finalizar contagem</button>
                  {whatsapp?(
                    <a
                      href={`https://wa.me/${normPhone(whatsapp)}?text=${encodeURIComponent(buildWAMsg({id:0,label,date:countDate,items:items.map(i=>({...i,counted:counts[i.id]??0}))},items))}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{display:"block",width:"100%",background:T.accent,color:"#fff",fontWeight:700,fontSize:T.fs14,padding:"14px",borderRadius:10,textAlign:"center",textDecoration:"none",boxSizing:"border-box",fontFamily:T.fontBase}}
                      onClick={doSend}
                    >
                      Enviar relatório para Teresa
                    </a>
                  ):(
                    <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:"12px",textAlign:"center"}}>
                      <div style={{fontSize:T.fs11,color:T.textMuted}}>Configure o WhatsApp na Aba Segurança para enviar o relatório para Teresa.</div>
                    </div>
                  )}
                </>
              )}
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

  // Blocked — last resort, only if no phase matches
  if(isBlocked) return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,fontFamily:T.fontBase}}>
      <div style={{width:"100%",maxWidth:380}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:T.textMuted,cursor:"pointer",fontSize:T.fs13,marginBottom:20,padding:0}}>← Voltar</button>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontFamily:T.fontMono,fontSize:T.fs18,fontWeight:700,color:T.red,marginBottom:8}}>CONTAGEM BLOQUEADA</div>
          <div style={{fontSize:T.fs13,color:T.textMuted,lineHeight:1.7}}>Não há contagem agendada para hoje. Somente é possível realizar contagem nas datas agendadas.</div>
        </div>
        {nextFuture&&(
          <div style={{...S.card({marginBottom:16,background:T.yellow+"0a",border:`1px solid ${T.border}`,padding:"16px"})}}>
            <div style={{fontSize:T.fs11,fontWeight:700,color:T.yellow,marginBottom:6,textTransform:"uppercase"}}>📅 Próxima contagem agendada</div>
            <div style={{fontWeight:700,fontSize:T.fs15,color:T.text,marginBottom:4}}>{nextFuture.label}</div>
            <div style={{fontSize:T.fs13,color:T.yellow}}>{fmtDate(nextFuture.date)} · {(()=>{const d=daysUntil(nextFuture.date);return d===1?"em 1 dia":`em ${d} dias`;})()}</div>
          </div>
        )}
        {whatsapp&&(
          <div style={{...S.card({marginBottom:12,background:T.green+"08",border:`1px solid ${T.border}`,padding:"16px"})}}>
            <div style={{fontSize:T.fs13,color:T.text,fontWeight:700,marginBottom:6}}>Avisar Teresa</div>
            <div style={{fontSize:T.fs12,color:T.textMuted,marginBottom:10,lineHeight:1.6}}>Se você foi orientado a fazer a contagem hoje e o sistema está bloqueado, envie uma mensagem ao gerente explicando a situação.</div>
            {(()=>{
              const proximaInfo = nextFuture ? ` A próxima prevista é "${nextFuture.label}" em ${fmtDate(nextFuture.date)}.` : " Nenhuma contagem futura cadastrada.";
              const destinoInfo = nextFuture ? ` referente a *"${nextFuture.label}"* (prevista para ${fmtDate(nextFuture.date)})` : "";
              const msg=`Olá, Teresa.\n\nEstou tentando realizar a contagem de estoque${destinoInfo}, porém o sistema não está permitindo o acesso. Não há contagem agendada para hoje (${fmtDate(todayStr())}).${proximaInfo}\n\nPor favor, oriente como devo proceder.\n\n_Sistema de Gestão de Contagens_`;
              return(
                <a href={`https://wa.me/${normPhone(whatsapp)}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer"
                  style={{display:"block",background:T.green,color:"#fff",fontWeight:700,fontSize:T.fs13,padding:"11px",borderRadius:10,textAlign:"center",textDecoration:"none",fontFamily:T.fontBase}}>
                  📲 Enviar mensagem para Teresa
                </a>
              );
            })()}
          </div>
        )}
        <button onClick={onBack} style={{...S.btn(T.surface,true),border:`1px solid ${T.border}`,color:T.textSub,marginTop:4}}>← Voltar ao início</button>
      </div>
    </div>
  );

  return null;
}

// ─── MANAGER PANEL ───────────────────────────────────────────────────────────
function ManagerPanel({data,onBack}) {
  const {items,countings,scheduledDates,appPass,passHint,whatsapp,purchases,setItems,setCountings,setScheduledDates,setAppPass,setPassHint,setWhatsapp,setPurchases}=data;
  const TABS=["📊 Dashboard","📦 Insumos","📋 Contagens","🛒 Compras","🔒 Segurança","📖 Instruções"];
  const [tab,setTab]=useState(0);
  const [countSubTab,setCountSubTab]=useState("history");
  const [buySubTab,setBuySubTab]=useState("program");
  const navigate=(tabIdx,subTab=null)=>{
    setTab(tabIdx);
    if(tabIdx===2&&subTab) setCountSubTab(subTab);
    if(tabIdx===3&&subTab) setBuySubTab(subTab);
  };
  return (
    <div style={{minHeight:"100vh",background:T.bg,color:T.text,fontFamily:T.fontBase,paddingBottom:70}}>
      <div style={{background:`linear-gradient(135deg,${T.warmDim}22,${T.bg})`,borderBottom:`1px solid ${T.border}`}}>
        <div style={{padding:"20px 18px 0"}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:T.textMuted,cursor:"pointer",fontSize:T.fs13,marginBottom:10,padding:0}}>← Sair</button>
        <div style={{fontFamily:T.fontMono,fontSize:T.fs15,fontWeight:700,color:T.warm,marginBottom:12,letterSpacing:1}}>🔐 PAINEL DO GERENTE</div>
        <div style={{display:"flex",gap:2,overflowX:"auto"}}>
          {TABS.map((t,i)=><button key={i} onClick={()=>setTab(i)} style={{background:tab===i?T.warm:"transparent",border:`1px solid ${tab===i?T.warm:T.border}`,borderBottom:tab===i?"none":"1px solid transparent",borderRadius:"10px 10px 0 0",padding:"8px 10px",color:tab===i?"#fff":T.textMuted,fontWeight:600,fontSize:T.fs11,cursor:"pointer",fontFamily:T.fontBase,whiteSpace:"nowrap"}}>{t}</button>)}
        </div>
        </div>
      </div>
      <div style={{padding:"18px 16px"}}>
        {tab===0&&<DashTab items={items} countings={countings} scheduledDates={scheduledDates} purchases={purchases} onNavigate={navigate}/>}
        {tab===1&&<ItemsTab items={items} setItems={setItems} countings={countings}/>}
        {tab===2&&<CountTab items={items} countings={countings} setCountings={setCountings} setItems={setItems} scheduledDates={scheduledDates} setScheduledDates={setScheduledDates} purchases={purchases} initialSubTab={countSubTab}/>}
        {tab===3&&<BuyTab items={items} setItems={setItems} countings={countings} purchases={purchases} setPurchases={setPurchases} initialSubTab={buySubTab}/>}
        {tab===4&&<CfgTab appPass={appPass} setAppPass={setAppPass} passHint={passHint} setPassHint={setPassHint} whatsapp={whatsapp} setWhatsapp={setWhatsapp}/>}
        {tab===5&&<InstructionsTab/>}
      </div>
    </div>
  );
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
function DashTab({items,countings,scheduledDates,purchases,onNavigate}) {
  const [view,setView]=useState("cards"); // "cards" | "charts"
  const sortedCountings=[...countings].sort((a,b)=>Number(b.id||0)-Number(a.id||0));
  const lastC=sortedCountings.find(c=>c.validated)||null;
  const lc={};if(lastC)(lastC.items||[]).forEach(ci=>{lc[ci.id]=ci.counted;});

  const vA=items.reduce((s,i)=>s+(Number(i.value||0)*getTotalAcquired(i)),0);
  const vC=items.reduce((s,i)=>s+(Number(i.value||0)*(lc[i.id]??0)),0);
  const ex=Object.keys(lc).length;
  const dQ=ex-items.length;
  const dV=vC-vA;
  const qtdA=items.reduce((s,i)=>s+getTotalAcquired(i),0);
  const qtdC=lastC?items.reduce((s,i)=>s+(lc[i.id]??0),0):null;
  const dQtd=qtdC!==null?qtdC-qtdA:null;
  const colorQtdC=qtdC===null?T.textMuted:qtdC<qtdA?T.red:qtdC===qtdA?T.green:T.purple;
  const colorDQtd=dQtd===null?T.textMuted:dQtd===0?T.green:dQtd>0?T.purple:T.red;

  // Programação de compras
  const dashLastC=sortedCountings.find(c=>c.validated)||null;
  const dashLc={};if(dashLastC)(dashLastC.items||[]).forEach(ci=>{dashLc[ci.id]=ci.counted;});
  const getPostBoughtDash=(itemId)=>{
    if(!dashLastC) return (purchases||[]).filter(p=>p.itemId===itemId).reduce((s,p)=>s+Number(p.qty||0),0);
    const cutoff = dashLastC.datetime || (dashLastC.date+"T23:59:59Z");
    return (purchases||[]).filter(p=>{
      const pdt = p.datetime || (p.date+"T00:00:00Z");
      return p.itemId===itemId && pdt > cutoff;
    }).reduce((s,p)=>s+Number(p.qty||0),0);
  };
  const getTotalBoughtDash=(itemId)=>(purchases||[]).filter(p=>p.itemId===itemId).reduce((s,p)=>s+Number(p.qty||0),0);
  const needItems=items.filter(i=>{
    const alreadyBought=getTotalBoughtDash(i.id);
    const hasValidated=dashLc[i.id]!==undefined;
    const postBought=getPostBoughtDash(i.id);
    const base=hasValidated?(dashLc[i.id]+postBought):alreadyBought;
    if(i.max&&base<i.max) return true;
    if(!i.max&&i.min&&base<i.min) return true;
    return false;
  }).map(i=>{
    const alreadyBought=getTotalBoughtDash(i.id);
    const hasValidated=dashLc[i.id]!==undefined;
    const postBought=getPostBoughtDash(i.id);
    const base=hasValidated?(dashLc[i.id]+postBought):alreadyBought;
    const need=i.max?Math.max(i.max-base,0):Math.max((i.min||0)-base,0);
    return{...i,need,est:Number(i.value||0)*need};
  }).filter(i=>i.need>0);
  const totalNeedItems=needItems.length;
  const totalNeedQty=needItems.reduce((s,i)=>s+i.need,0);
  const totalNeedVal=needItems.reduce((s,i)=>s+i.est,0);
  const colorNeed=items.length===0||totalNeedItems===0?T.textMuted:T.red;

  const abMin=items.filter(i=>i.min&&(lc[i.id]??0)<i.min).length;
  const acMax=items.filter(i=>i.max&&(lc[i.id]??0)>i.max).length;
  const inRange=items.filter(i=>{const c=lc[i.id];if(c===undefined)return false;if(i.min&&i.max)return c>=i.min&&c<=i.max;if(i.min)return c>=i.min;if(i.max)return c<=i.max;return true;}).length;

  const allSch=[...(scheduledDates||[])].sort((a,b)=>a.date.localeCompare(b.date));
  const schPending=allSch.filter(s=>!s.done&&s.date>=todayStr());
  const schOverdue=allSch.filter(s=>!s.done&&s.date<todayStr());
  const countingsVerified=sortedCountings.filter(c=>c.validated||c.rejected).length;
  const countingsValidated=sortedCountings.filter(c=>c.validated).length; // keep for other uses
  const countingsPendingVal=sortedCountings.filter(c=>!c.validated&&!c.rejected).length;

  // Colors driven by comparison logic
  const colorContabilizados = !lastC ? T.textMuted : ex===items.length ? T.green : ex<items.length ? T.red : T.purple;
  const colorDiffQtd = !lastC ? T.textSub : dQ>=0 ? T.green : T.red;
  const colorVContabilizado = !lastC ? T.textSub : vC===0&&vA===0 ? T.textSub : vC<vA ? T.red : T.green;
  const colorDiffVal = !lastC ? T.textSub : dV>=0 ? T.green : T.red;
  const colorPendingVal = countingsPendingVal===0 ? T.green : T.red;

  const Card=({icon,value,label,sub,color,onClick=null})=>{
    const isEmpty = value==="—";
    return(
    <div onClick={onClick||undefined} style={{
      background:T.card,
      border:`1px solid ${T.border}`,
      borderRadius:14,
      padding:"11px 9px",
      cursor:onClick?"pointer":"default",
      display:"flex",
      flexDirection:"column",
      gap:3,
    }}>
      <div style={{fontSize:T.fs14,lineHeight:1}}>{icon}</div>
      <div style={{fontFamily:T.fontMono,fontSize:T.fs16,fontWeight:700,color:isEmpty?T.textMuted:color,lineHeight:1.1,marginTop:2}}>{value}</div>
      <div style={{fontSize:T.fs10,color:T.textMuted,fontWeight:700,textTransform:"uppercase",lineHeight:1.35,letterSpacing:.3,flex:1}}>{label}</div>
      {sub&&<div style={{fontSize:T.fs10,color:T.textMuted,lineHeight:1.3}}>{sub}</div>}
      <div style={{marginTop:4,background:isEmpty?T.textMuted+"18":color+"22",borderRadius:4,padding:"2px 6px",alignSelf:"flex-start"}}>
        <span style={{fontSize:T.fs10,color:isEmpty?T.textMuted:color,fontWeight:800,letterSpacing:.5}}>VER →</span>
      </div>
    </div>
  );};

  // Donut chart — pure SVG, handles empty slices, big % labels
  const PieChart=({slices,size=140})=>{
    // Filter out empty slices — use gray ring if all empty
    const active=slices.filter(sl=>sl.value>0&&!sl.empty);
    const cx=size/2,cy=size/2,R=size/2-6,r=R*0.46;
    if(active.length===0) return(
      <svg width={size} height={size}>
        <circle cx={cx} cy={cy} r={(R+r)/2} fill="none" stroke={T.border} strokeWidth={R-r} strokeLinecap="round"/>
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize={T.fs16} fontWeight="700" fill={T.textMuted} fontFamily={T.fontMono}>—</text>
      </svg>
    );
    let cum=0;
    const total=active.reduce((s,x)=>s+x.value,0);
    const paths=active.map((sl,i)=>{
      const pct=sl.value/total;
      const start=cum; cum+=pct;
      const a1=start*2*Math.PI-Math.PI/2;
      const a2=cum*2*Math.PI-Math.PI/2;
      const lg=pct>0.5?1:0;
      const ox1=cx+R*Math.cos(a1),oy1=cy+R*Math.sin(a1);
      const ox2=cx+R*Math.cos(a2),oy2=cy+R*Math.sin(a2);
      const ix1=cx+r*Math.cos(a2),iy1=cy+r*Math.sin(a2);
      const ix2=cx+r*Math.cos(a1),iy2=cy+r*Math.sin(a1);
      const d=`M${ox1},${oy1} A${R},${R} 0 ${lg},1 ${ox2},${oy2} L${ix1},${iy1} A${r},${r} 0 ${lg},0 ${ix2},${iy2} Z`;
      const midA=(start+pct/2)*2*Math.PI-Math.PI/2;
      const labelR=(R+r)/2;
      const lx=cx+labelR*Math.cos(midA),ly=cy+labelR*Math.sin(midA);
      // Only show % if slice is big enough — font size matches card value (T.fs16)
      return(
        <g key={i}>
          <path d={pct>=1?`M${cx},${cy-R} A${R},${R} 0 1,1 ${cx-0.001},${cy-R} L${cx},${cy-r} A${r},${r} 0 1,0 ${cx+0.001},${cy-r} Z`:d} fill={sl.color}/>
        </g>
      );
    });
    // Single % label in center — first colored slice (index 0) percentage
    const mainPct=active.length>0?Math.round((active[0].value/total)*100):null;
    return(
      <svg width={size} height={size}>
        {paths}
        {mainPct!==null&&<text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize={T.fs16} fontWeight="700" fill="#fff" fontFamily={T.fontMono}>{mainPct}%</text>}
      </svg>
    );
  };

  return (
    <div style={{marginTop:4}}>
      {/* View toggle */}
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
        <div style={{display:"flex",gap:2,background:T.surface,borderRadius:8,padding:2,border:`1px solid ${T.border}`}}>
          <button onClick={()=>setView("cards")} style={{background:view==="cards"?T.card:"transparent",border:view==="cards"?`1px solid ${T.border}`:"1px solid transparent",borderRadius:6,padding:"5px 12px",color:view==="cards"?T.text:T.textMuted,fontWeight:600,fontSize:T.fs11,cursor:"pointer",fontFamily:T.fontBase}}>📊 Cards</button>
          <button onClick={()=>setView("charts")} style={{background:view==="charts"?T.card:"transparent",border:view==="charts"?`1px solid ${T.border}`:"1px solid transparent",borderRadius:6,padding:"5px 12px",color:view==="charts"?T.text:T.textMuted,fontWeight:600,fontSize:T.fs11,cursor:"pointer",fontFamily:T.fontBase}}>🥧 Gráficos</button>
        </div>
      </div>

      {view==="charts"&&(()=>{
        // Gráfico 1: % de INSUMOS CONTABILIZADOS (ex/items.length)
        // Gráfico 2: % de VALOR TOTAL CONTABILIZADO (vC/vA)
        // Gráfico 3: % de CONTAGENS VALIDADAS (countingsValidated/sortedCountings.length)
        // Cor do valor contabilizado/validado: cinza=sem dado, verde=igual, roxo=acima, vermelho=abaixo
        const noInsumos = items.length===0;
        const noValor   = vA===0;
        const noCount   = sortedCountings.length===0;

        const contColor  = noInsumos||!lastC||ex===0 ? T.textMuted : ex<items.length?T.red:ex===items.length?T.green:T.purple;
        const valColor   = noValor||!lastC||vC===0   ? T.textMuted : vC<vA?T.red:vC===vA?T.green:T.purple;
        const validColor = noCount||countingsVerified===0 ? T.textMuted : countingsVerified<sortedCountings.length?T.red:countingsVerified===sortedCountings.length?T.green:T.purple;

        const contDiff = !lastC||noInsumos ? null : ex-items.length;
        const valDiff  = !lastC||noValor   ? null : vC-vA;
        const validDiff= noCount           ? null : countingsVerified-sortedCountings.length;

        const diffColor=(d)=> d===null?T.textMuted:d===0?T.green:d>0?T.purple:T.red;
        const fmtDiff=(d,isCur=false)=>d===null?"—":isCur?(d>0?"+":"")+fmtCur(d):(d>0?"+":"")+d;

        // Linha de dado: LABEL: VALOR — sem quadrado, alinhado à esquerda
        const DataRow=({label,value,color=T.text})=>(
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",padding:"4px 0",borderBottom:`1px solid ${T.border}44`}}>
            <span style={{fontSize:T.fs10,color:T.textMuted,fontWeight:700,textTransform:"uppercase",letterSpacing:.3,flexShrink:0,marginRight:6}}>{label}</span>
            <span style={{fontFamily:T.fontMono,fontSize:T.fs13,fontWeight:700,color,textAlign:"right"}}>{value}</span>
          </div>
        );

        // Novos: qtd adquirida vs contabilizada, e itens dentro da margem
        const noQtd   = qtdA===0;
        const qtdColor= noQtd||qtdC===null?T.textMuted:qtdC<qtdA?T.red:qtdC===qtdA?T.green:T.purple;
        const noMargin= !lastC||items.length===0;
        const inRangeColor= noMargin?T.textMuted:inRange===items.length?T.green:inRange>0?T.yellow:T.red;

        const noNeed = items.length===0;
        const needColor = noNeed||totalNeedVal===0?T.textMuted:T.red;
        const SectionLabel=({label})=>(
          <div style={{fontSize:9,color:T.textMuted,fontWeight:700,textTransform:"uppercase",letterSpacing:.6,marginBottom:4,paddingLeft:2}}>{label}</div>
        );

        // Pill de seção dentro do card
        const Sec=({label,color=T.textMuted})=>(
          <div style={{fontSize:8,color,fontWeight:700,textTransform:"uppercase",letterSpacing:.7,
            background:color+"18",borderRadius:4,padding:"2px 6px",alignSelf:"flex-start",marginBottom:2}}>{label}</div>
        );

        return(
        <>
        {/* Linha 1: Insumos, Quantidades, Status */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
          {/* G1: Insumos contabilizados */}
          <div style={{...S.card({padding:"14px 12px"}),display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
            <Sec label="INSUMOS"/>
            <div style={{fontSize:T.fs10,color:T.textMuted,fontWeight:700,textTransform:"uppercase",letterSpacing:.4,textAlign:"center"}}>🧮 INSUMOS CONTABILIZADOS</div>
            <PieChart size={130} slices={[
              {value:lastC&&ex>0?ex:0, color:contColor, empty:noInsumos||!lastC||ex===0},
              {value:noInsumos?1:Math.max(items.length-(lastC?ex:0),0), color:T.surface, empty:noInsumos},
            ]}/>
            <div style={{width:"100%"}}>
              <DataRow label="INSUMOS CADASTRADOS"    value={noInsumos?"—":items.length}  color={noInsumos?T.textMuted:T.accent}/>
              <DataRow label="INSUMOS CONTABILIZADOS" value={!lastC||ex===0?"—":ex}       color={contColor}/>
              <DataRow label="DIFERENÇA (INSUMOS)"    value={fmtDiff(contDiff)}           color={diffColor(contDiff)}/>
            </div>
          </div>
          {/* G2: Quantidade total contabilizada */}
          <div style={{...S.card({padding:"14px 12px"}),display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
            <Sec label="QUANTIDADES"/>
            <div style={{fontSize:T.fs10,color:T.textMuted,fontWeight:700,textTransform:"uppercase",letterSpacing:.4,textAlign:"center"}}>📊 QUANTIDADE TOTAL CONTABILIZADA</div>
            <PieChart size={130} slices={[
              {value:qtdC!==null&&qtdC>0?qtdC:0, color:qtdColor, empty:noQtd||qtdC===null||qtdC===0},
              {value:noQtd?1:Math.max(qtdA-(qtdC||0),0), color:T.surface, empty:noQtd},
            ]}/>
            <div style={{width:"100%"}}>
              <DataRow label="QUANTIDADE TOTAL ADQUIRIDA"     value={noQtd?"—":qtdA}            color={noQtd?T.textMuted:T.accent}/>
              <DataRow label="QUANTIDADE TOTAL CONTABILIZADA" value={qtdC===null||qtdC===0?"—":qtdC} color={qtdColor}/>
              <DataRow label="DIFERENÇA (QUANTIDADE)"  value={dQtd===null?"—":`${dQtd>0?"+":""}${dQtd}`} color={diffColor(dQtd)}/>
            </div>
          </div>
          {/* G3: Itens dentro da margem */}
          <div style={{...S.card({padding:"14px 12px"}),display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
            <Sec label="STATUS DAS QUANTIDADES"/>
            <div style={{fontSize:T.fs10,color:T.textMuted,fontWeight:700,textTransform:"uppercase",letterSpacing:.4,textAlign:"center"}}>✅ INSUMOS DENTRO DA MARGEM</div>
            <PieChart size={130} slices={[
              {value:noMargin?0:inRange, color:inRangeColor, empty:noMargin||inRange===0},
              {value:noMargin?1:Math.max(items.length-inRange,0), color:T.surface, empty:noMargin||items.length===0},
            ]}/>
            <div style={{width:"100%"}}>
              <DataRow label="INSUMOS ABAIXO DO MÍNIMO" value={noMargin?"—":abMin}   color={noMargin?T.textMuted:abMin>0?T.red:T.green}/>
              <DataRow label="INSUMOS DENTRO DA MARGEM" value={noMargin?"—":inRange} color={noMargin?T.textMuted:inRangeColor}/>
              <DataRow label="INSUMOS ACIMA DO MÁXIMO"  value={noMargin?"—":acMax}   color={noMargin?T.textMuted:acMax>0?T.purple:T.green}/>
            </div>
          </div>
        </div>
        {/* Linha 2: Capital, Programação, Contagens */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8,marginTop:14}}>
          {/* G4: Valor total contabilizado */}
          <div style={{...S.card({padding:"14px 12px"}),display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
            <Sec label="CAPITAL"/>
            <div style={{fontSize:T.fs10,color:T.textMuted,fontWeight:700,textTransform:"uppercase",letterSpacing:.4,textAlign:"center"}}>💰 VALOR TOTAL CONTABILIZADO</div>
            <PieChart size={130} slices={[
              {value:lastC&&vC>0?vC:0, color:valColor, empty:noValor||!lastC||vC===0},
              {value:noValor?1:Math.max(vA-(lastC?vC:0),0), color:T.surface, empty:noValor},
            ]}/>
            <div style={{width:"100%"}}>
              <DataRow label="VALOR TOTAL ADQUIRIDO"     value={noValor?"—":fmtCur(vA)}        color={noValor?T.textMuted:T.accent}/>
              <DataRow label="VALOR TOTAL CONTABILIZADO" value={!lastC||vC===0?"—":fmtCur(vC)} color={valColor}/>
              <DataRow label="DIFERENÇA (VALOR)"         value={fmtDiff(valDiff,true)}          color={diffColor(valDiff)}/>
            </div>
          </div>
          {/* G5: Valor total previsto */}
          <div style={{...S.card({padding:"14px 12px"}),display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
            <Sec label="PROGRAMAÇÃO DE COMPRAS"/>
            <div style={{fontSize:T.fs10,color:T.textMuted,fontWeight:700,textTransform:"uppercase",letterSpacing:.4,textAlign:"center"}}>💸 VALOR TOTAL PREVISTO</div>
            <PieChart size={130} slices={[
              {value:noNeed||totalNeedVal===0?0:totalNeedVal, color:needColor, empty:noNeed||totalNeedVal===0},
              {value:noNeed||totalNeedVal===0?1:Math.max(vA-totalNeedVal,0), color:T.surface, empty:noNeed||totalNeedVal===0||vA===0},
            ]}/>
            <div style={{width:"100%"}}>
              <DataRow label="VALOR TOTAL ADQUIRIDO"  value={vA===0?"—":fmtCur(vA)}                            color={vA===0?T.textMuted:T.accent}/>
              <DataRow label="VALOR TOTAL PREVISTO"   value={noNeed||totalNeedVal===0?"—":fmtCur(totalNeedVal)} color={needColor}/>
              <DataRow label="QUANTIDADE NECESSÁRIA"  value={noNeed||totalNeedQty===0?"—":totalNeedQty}         color={needColor}/>
            </div>
          </div>
          {/* G6: Contagens validadas */}
          <div style={{...S.card({padding:"14px 12px"}),display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
            <Sec label="STATUS DAS CONTAGENS"/>
            <div style={{fontSize:T.fs10,color:T.textMuted,fontWeight:700,textTransform:"uppercase",letterSpacing:.4,textAlign:"center"}}>✅ CONTAGENS VERIFICADAS</div>
            <PieChart size={130} slices={[
              {value:noCount?0:countingsVerified, color:validColor, empty:noCount||countingsVerified===0},
              {value:noCount?1:Math.max(sortedCountings.length-countingsVerified,0), color:T.surface, empty:noCount},
            ]}/>
            <div style={{width:"100%"}}>
              <DataRow label="CONTAGENS REGISTRADAS" value={noCount?"—":sortedCountings.length}                         color={noCount?T.textMuted:T.accent}/>
              <DataRow label="CONTAGENS VERIFICADAS" value={noCount||countingsVerified===0?"—":countingsVerified}       color={validColor}/>
              <DataRow label="CONTAGENS PENDENTES"   value={noCount||countingsPendingVal===0?"—":countingsPendingVal}   color={noCount?T.textMuted:countingsPendingVal>0?T.yellow:T.green}/>
            </div>
          </div>
        </div>
        </>
        );
      })()}

      {view==="cards"&&<div>

      {/* INSUMOS */}
      <div style={{fontSize:T.fs10,color:T.textSub,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>INSUMOS</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
        <Card icon="📦" label="INSUMOS CADASTRADOS"     value={items.length===0?"—":items.length}        color={items.length===0?T.textMuted:T.accent}            onClick={()=>onNavigate(1)}/>
        <Card icon="🧮" label="INSUMOS CONTABILIZADOS"  value={lastC?ex:"—"} color={lastC?colorContabilizados:T.textMuted} onClick={()=>onNavigate(2)}/>
        <Card icon="🔢" label="DIFERENÇA (INSUMOS)"     value={lastC?`${dQ>0?"+":""}${dQ}`:"—"} color={lastC?colorDiffQtd:T.textMuted} onClick={()=>onNavigate(2,"evolution")}/>
      </div>

      {/* QUANTIDADES */}
      <div style={{fontSize:T.fs10,color:T.textSub,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>QUANTIDADES</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
        <Card icon="📥" label="QUANTIDADE TOTAL ADQUIRIDA"     value={qtdA===0?"—":qtdA}                              color={qtdA===0?T.textMuted:T.accent}      onClick={()=>onNavigate(3,"history")}/>
        <Card icon="📊" label="QUANTIDADE TOTAL CONTABILIZADA" value={qtdC===null?"—":qtdC}                           color={qtdC===null?T.textMuted:colorQtdC}  onClick={()=>onNavigate(2)}/>
        <Card icon="⚖️" label="DIFERENÇA (QUANTIDADE)"         value={dQtd===null?"—":`${dQtd>0?"+":""}${dQtd}`}     color={colorDQtd}                          onClick={()=>onNavigate(2,"evolution")}/>
      </div>

      {/* STATUS DAS QUANTIDADES */}
      <div style={{marginBottom:8}}>
        <div style={{fontSize:T.fs10,color:T.textSub,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>STATUS DAS QUANTIDADES</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          <Card icon="⬇️" label="INSUMOS ABAIXO DO MÍNIMO" value={!lastC?"—":abMin}   color={!lastC?T.textMuted:abMin>0?T.red:T.green}    onClick={()=>onNavigate(1)}/>
          <Card icon="✅" label="INSUMOS DENTRO DA MARGEM"  value={!lastC?"—":inRange} color={!lastC?T.textMuted:inRange===items.length?T.green:inRange>0?T.green:T.red} onClick={()=>onNavigate(1)}/>
          <Card icon="⬆️" label="INSUMOS ACIMA DO MÁXIMO"   value={!lastC?"—":acMax}   color={!lastC?T.textMuted:acMax===0?T.green:T.purple} onClick={()=>onNavigate(1)}/>
        </div>
      </div>

      {/* CAPITAL */}
      <div style={{fontSize:T.fs10,color:T.textSub,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>CAPITAL</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
        <Card icon="💳" label="VALOR TOTAL ADQUIRIDO"     value={vA===0?"—":fmtCur(vA)}            color={vA===0?T.textMuted:T.accent}           onClick={()=>onNavigate(3,"history")}/>
        <Card icon="💰" label="VALOR TOTAL CONTABILIZADO" value={lastC&&vC>0?fmtCur(vC):"—"} color={lastC&&vC>0?colorVContabilizado:T.textMuted} onClick={()=>onNavigate(2)}/>
        <Card icon="💹" label="DIFERENÇA (VALOR)"         value={lastC?fmtCur(dV):"—"}  color={lastC?colorDiffVal:T.textMuted}       onClick={()=>onNavigate(2,"evolution")}/>
      </div>

      {/* PROGRAMAÇÃO DE COMPRAS */}
      <div style={{fontSize:T.fs10,color:T.textSub,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>PROGRAMAÇÃO DE COMPRAS</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
        <Card icon="🛒" label="INSUMOS NECESSÁRIOS"  value={items.length===0?"—":totalNeedItems}  color={items.length===0?T.textMuted:totalNeedItems===0?T.green:T.red}  onClick={()=>onNavigate(3,"program")}/>
        <Card icon="📦" label="QUANTIDADE NECESSÁRIA" value={items.length===0?"—":totalNeedQty}   color={items.length===0?T.textMuted:totalNeedQty===0?T.green:T.red}  onClick={()=>onNavigate(3,"program")}/>
        <Card icon="💸" label="VALOR TOTAL PREVISTO"  value={items.length===0?"—":fmtCur(totalNeedVal)} color={items.length===0?T.textMuted:totalNeedVal===0?T.green:T.red} onClick={()=>onNavigate(3,"program")}/>
      </div>

      {/* STATUS DAS CONTAGENS */}
      <div style={{marginBottom:8}}>
        <div style={{fontSize:T.fs10,color:T.textSub,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>STATUS DAS CONTAGENS</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          <Card
            icon="📋"
            label="CONTAGENS REGISTRADAS"
            value={sortedCountings.length===0?"—":sortedCountings.length}
            color={sortedCountings.length>0?T.accent:T.textMuted}
            onClick={()=>onNavigate(2,"history")}
          />
          <Card
            icon="✅"
            label="CONTAGENS VERIFICADAS"
            value={sortedCountings.length===0?"—":countingsVerified}
            color={sortedCountings.length===0?T.textMuted:countingsVerified===sortedCountings.length?T.green:T.red}
            onClick={()=>onNavigate(2,"history")}
          />
          <Card
            icon="⏳"
            label="CONTAGENS PENDENTES"
            value={sortedCountings.length===0?"—":countingsPendingVal}
            color={sortedCountings.length===0?T.textMuted:colorPendingVal}
            onClick={()=>onNavigate(2,"schedule")}
          />
        </div>
      </div>

      </div>} {/* end cards view */}

    </div>
  );
}

function PurchaseGroup({label,color,items,unit}) {
  const [open,setOpen]=useState(false);
  const total=items.reduce((s,p)=>s+Number(p.qty||0),0);
  return(
    <div style={{marginBottom:4}}>
      <div onClick={()=>setOpen(p=>!p)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",padding:"4px 0"}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{...S.tag(color),fontSize:T.fs10}}>{label}</span>
          <span style={{fontSize:T.fs11,color:T.textMuted}}>{items.length} compra{items.length!==1?"s":""}</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontFamily:T.fontMono,fontSize:T.fs11,color,fontWeight:700}}>+{total} {unit}</span>
          <span style={{fontSize:T.fs10,color:T.textMuted}}>{open?"▲":"▼"}</span>
        </div>
      </div>
      {open&&items.map((p,i)=>(
        <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"3px 0 3px 12px",borderLeft:`2px solid ${color}44`}}>
          <span style={{fontSize:T.fs11,color:T.textMuted}}>{fmtDate(p.date)}{p.note?` · ${p.note}`:""}</span>
          <span style={{fontFamily:T.fontMono,fontSize:T.fs11,color,fontWeight:600}}>+{p.qty}</span>
        </div>
      ))}
    </div>
  );
}

// ─── ITEMS TAB ───────────────────────────────────────────────────────────────
function ItemsTab({items,setItems,countings}) {
  const empty={name:"",unit:"Unidade(s)",value:"",min:"",max:"",attachment:null,attachmentName:""};
  const [form,setForm]=useState(empty); const [edit,setEdit]=useState(null); const [err,setErr]=useState("");
  const [showForm,setShowForm]=useState(false); const [confirm,setConfirm]=useState(null);
  const [search,setSearch]=useState("");
  const fileRef=useRef();
  const lastC=countings.length?[...countings].sort((a,b)=>Number(b.id||0)-Number(a.id||0))[0]:null;
  const lc={};if(lastC)(lastC.items||[]).forEach(ci=>{lc[ci.id]=ci.counted;});
  const filtered=items.filter(it=>!search||it.name.toLowerCase().includes(search.toLowerCase()));

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
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,marginTop:2}}>
        <div style={{...S.sec,marginBottom:0}}>Insumos <span style={{color:T.textMuted,fontWeight:400}}>({items.length})</span></div>
        <button onClick={()=>{setEdit(null);setForm(empty);setShowForm(p=>!p);}} style={S.btn(showForm?T.textMuted:T.green,false,true)}>{showForm?"✕ Fechar":"+ Novo"}</button>
      </div>
      <input placeholder="🔍 Pesquisar insumo..." value={search} onChange={e=>setSearch(e.target.value)} style={{...S.input({marginBottom:10})}}/>
      {showForm&&(
        <div style={{...S.card({marginBottom:16,border:`1px solid ${T.border}`,padding:"18px"})}}>
          <div style={{fontWeight:700,marginBottom:14,color:T.green,fontSize:T.fs14}}>{edit!==null?"Editar insumo":"Novo insumo"}</div>
          <div style={S.label}>Nome *</div>
          <input placeholder="Ex: TOALHA DE BANHO" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value.toUpperCase()}))} style={{...S.input({marginBottom:12,textTransform:"uppercase",fontSize:T.fs13})}}/>
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
      {filtered.length===0&&items.length>0&&<div style={{textAlign:"center",color:T.textMuted,padding:"30px 0",fontSize:T.fs13}}>Nenhum resultado para "{search}".</div>}
      {filtered.map(it=>{
        const counted=lc[it.id];
        const st=counted!==undefined?getStatus(it,counted):null;
        return (
          <div key={it.id} style={{...S.card({marginBottom:10,border:`1px solid ${T.border}`})}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
              <div style={{flex:1,minWidth:0,overflow:"hidden"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2,flexWrap:"wrap"}}>
                  <div style={{fontWeight:700,fontSize:T.fs14}}>{it.name}</div>
                  {st&&<StatusBadge item={it} counted={counted}/>}
                </div>
                <div style={{fontSize:T.fs12,color:T.accent,marginBottom:8}}>{it.unit}</div>
                {counted!==undefined&&<div style={{fontSize:T.fs12,marginBottom:4}}>Última contagem: <b style={{color:st?.color||T.text}}>{counted} {it.unit}</b></div>}
                <div style={{display:"flex",gap:12,flexWrap:"wrap",fontSize:T.fs12,color:T.textMuted}}>
                  {it.value>0&&<span>Valor unitário: <b style={{color:T.yellow}}>{fmtCur(it.value)}</b></span>}
                  <span>Total adquirido: <b style={{color:T.text}}>{getTotalAcquired(it)} {it.unit}</b></span>
                </div>
                {(it.min||it.max)&&<div style={{fontSize:T.fs12,color:T.textMuted,marginTop:4}}>{it.min?<span>Mínimo: <b style={{color:T.warm}}>{it.min}</b></span>:""}{it.min&&it.max?" · ":""}{it.max?<span>Máximo: <b style={{color:T.purple}}>{it.max}</b></span>:""}</div>}
                {(it.purchases||[]).length>0&&(()=>{
                  const initials=(it.purchases||[]).filter(p=>p.pType==="initial");
                  const repos=(it.purchases||[]).filter(p=>p.pType==="reposition");
                  const others=(it.purchases||[]).filter(p=>!p.pType||(!["initial","reposition"].includes(p.pType)));
                  const groups=[
                    ...(initials.length?[{label:"Entrada inicial",color:T.warm,items:initials}]:[]),
                    ...(repos.length?[{label:"Reposição",color:T.purple,items:repos}]:[]),
                    ...(others.length?[{label:"Compras",color:T.green,items:others}]:[]),
                  ];
                  return(
                  <div style={{marginTop:8,background:T.surface,borderRadius:8,padding:"8px 10px"}}>
                    <div style={{fontSize:T.fs10,color:T.textMuted,fontWeight:700,marginBottom:6}}>📦 Histórico de compras</div>
                    {groups.map((g,gi)=>(
                      <PurchaseGroup key={gi} label={g.label} color={g.color} items={g.items} unit={it.unit}/>
                    ))}
                  </div>
                  );
                })()}
                {it.attachment?.startsWith("data:image")&&<img src={it.attachment} alt="" style={{width:56,height:56,objectFit:"cover",borderRadius:8,marginTop:8}}/>}
                {it.attachmentName&&!it.attachment?.startsWith("data:image")&&<div style={{fontSize:T.fs11,color:T.purple,marginTop:4}}>📎 {it.attachmentName}</div>}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0,alignSelf:"flex-start"}}>
                <button onClick={()=>startEdit(it)} style={{...S.btn(T.accent,false,true)}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                <button onClick={()=>setConfirm({id:it.id,name:it.name})} style={{...S.btn(T.red,false,true)}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── COUNTINGS TAB ───────────────────────────────────────────────────────────
function CountTab({items,countings,setCountings,setItems,scheduledDates,setScheduledDates,purchases,initialSubTab="history"}) {
  const [subTab,setSubTab]=useState(initialSubTab);
  const [sel,setSel]=useState(null);
  const [schForm,setSchForm]=useState({label:"",date:""});
  const [schEditId,setSchEditId]=useState(null);
  const [schErr,setSchErr]=useState("");
  const [expanded,setExpanded]=useState({});
  const [confirm,setConfirm]=useState(null);
  const [showReport,setShowReport]=useState(false);
  const [repC,setRepC]=useState(null);
  const [buyAlert,setBuyAlert]=useState(false);
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

  // Validate counting
  const validateCounting=(c)=>{
    setCountings(prev=>prev.map(x=>x.id===c.id?{...x,validated:true,items:(x.items||[]).map(ci=>({...ci,validated:true}))}:x));
    setItems(prev=>prev.map(it=>{
      const ci=(c.items||[]).find(i=>i.id===it.id);
      if(ci) return {...it, currentQty: ci.counted};
      return it;
    }));
    // Check if any item is below max — if so, show buy alert
    const needsBuy=(c.items||[]).some(ci=>{
      const it=items.find(i=>i.id===ci.id);
      return it&&it.max&&ci.counted<it.max;
    });
    if(needsBuy) setBuyAlert(true);
  };

  // Reject counting → schedule a recount within 48h
  const rejectCounting=(c)=>{
    const recontagemNum=(scheduledDates||[]).filter(x=>x.isRecount&&x.originCountingId===c.id).length+1;
    const newLabel=`RECONTAGEM ${recontagemNum}`;
    // starts today, deadline = today + 2 days
    const today=todayStr();
    const dl=new Date(); dl.setDate(dl.getDate()+2);
    const deadline=`${dl.getFullYear()}-${String(dl.getMonth()+1).padStart(2,'0')}-${String(dl.getDate()).padStart(2,'0')}`;
    const newSched={id:Date.now(),label:newLabel,date:today,deadline,done:false,isRecount:true,originCountingId:c.id};
    setScheduledDates(prev=>[...prev,newSched]);
    setCountings(prev=>prev.map(x=>x.id===c.id?{...x,rejected:true}:x));
    setSel(null);
  };

  if(sel) return (
    <div>
      {showReport&&repC&&<ReportModal counting={repC} items={items} onClose={()=>setShowReport(false)}/>}
      <button onClick={()=>setSel(null)} style={{background:"none",border:"none",color:T.textMuted,cursor:"pointer",fontSize:T.fs13,marginBottom:14,padding:0}}>← Voltar</button>
      <div style={S.card({marginBottom:12})}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
          <div>
            <div style={{fontWeight:700,fontSize:T.fs15}}>{sel.label}</div>
            <div style={{fontSize:T.fs12,color:T.textMuted}}>{fmtDate(sel.date)}</div>
            {sel.isRecount&&<div style={{fontSize:T.fs11,color:T.yellow,marginTop:2}}>🔁 Recontagem originada de contagem anterior</div>}
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
            {sel.validated?<span style={S.tag(T.green)}>✅ APROVADA</span>:sel.rejected?<span style={S.tag(T.red)}>❌ REPROVADA</span>:<span style={S.tag(T.yellow)}>⏳ AGUARDANDO</span>}
          </div>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={()=>{setRepC(sel);setShowReport(true);}} style={S.btn(T.accent,false,true)}>📄 Relatório</button>
          {!sel.validated&&!sel.rejected&&<button onClick={()=>validateCounting(sel)} style={S.btn(T.green,false,true)}>✅ Aprovar</button>}
          {!sel.validated&&!sel.rejected&&<button onClick={()=>rejectCounting(sel)} style={{...S.btn(T.red,false,true),color:"#fff",fontWeight:700}}>✕ Reprovar</button>}
        </div>
      </div>
      {!sel.validated&&!sel.rejected&&(
        <div style={{...S.card({marginBottom:12,background:T.yellow+"0a",border:`1px solid ${T.border}`,padding:"12px 14px"})}}>
          <div style={{fontSize:T.fs12,color:T.yellow,lineHeight:1.6}}>⚠️ Ao validar, as quantidades contabilizadas tornam-se a <b>quantidade atual</b> de cada insumo. Ao reprovar, será criada uma <b>Recontagem</b> vinculada a esta.</div>
        </div>
      )}
      <div style={{...S.sec,marginBottom:12}}>Insumos contabilizados</div>
      {(sel.items||[]).map(ci=>{
        const it=items.find(i=>i.id===ci.id)||ci;
        const st=getStatus(it,ci.counted);
        const totalAcq=getTotalAcquired(it);
        const valContado=Number(it.value||0)*ci.counted;
        const valAcq=Number(it.value||0)*totalAcq;
        return(
          <div key={ci.id} style={{...S.card({marginBottom:8})}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
              <div>
                <div style={{fontWeight:600,fontSize:T.fs13}}>{ci.name||it.name}</div>
                <div style={{fontSize:T.fs11,color:T.accent}}>{it.unit}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:T.fs10,color:T.textMuted,marginBottom:1}}>Quantidade contabilizada</div>
                <span style={{...S.mono,fontSize:T.fs18,fontWeight:700,color:T.accent}}>{ci.counted}</span>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,fontSize:T.fs11,color:T.textMuted}}>
              {it.value>0&&<span>Valor unitário: <b style={{color:T.yellow}}>{fmtCur(it.value)}</b></span>}
              {it.value>0&&<span>Valor contabilizado: <b style={{color:T.accent}}>{fmtCur(valContado)}</b></span>}
              <span>Total adquirido: <b style={{color:T.text}}>{totalAcq} {it.unit}</b></span>
              {it.value>0&&<span>Valor adquirido: <b style={{color:T.warm}}>{fmtCur(valAcq)}</b></span>}
              {it.min?<span>Mínimo: <b style={{color:T.warm}}>{it.min}</b></span>:null}
              {it.max?<span>Máximo: <b style={{color:T.purple}}>{it.max}</b></span>:null}
            </div>
            {st&&<div style={{marginTop:6}}><StatusBadge item={it} counted={ci.counted}/></div>}
          </div>
        );
      })}
    </div>
  );

  return (
    <div>
      {confirm&&<ConfirmModal message={confirm.message} onConfirm={confirm.onConfirm} onCancel={()=>setConfirm(null)}/>}
      {showReport&&repC&&<ReportModal counting={repC} items={items} onClose={()=>setShowReport(false)}/>}
      {buyAlert&&(
        <div style={{...S.card({marginBottom:12,background:T.green+"0d",border:`1px solid ${T.border}`,padding:"12px 16px"}),display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontWeight:700,fontSize:T.fs13,color:T.green,marginBottom:2}}>✅ Contagem validada!</div>
            <div style={{fontSize:T.fs12,color:T.textMuted}}>Há insumos abaixo do máximo — acesse a aba Compras para ver a programação atualizada.</div>
          </div>
          <button onClick={()=>setBuyAlert(false)} style={{background:"none",border:"none",color:T.textMuted,cursor:"pointer",fontSize:T.fs16,padding:"0 0 0 12px",flexShrink:0}}>✕</button>
        </div>
      )}
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
            return(
              <div key={c.id} style={S.card({marginBottom:10})}>
                {/* Header — click to expand/collapse */}
                <div
                  onClick={()=>setExpanded(p=>({...p,[c.id]:!p[c.id]}))}
                  style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",cursor:"pointer"}}
                >
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:2}}>
                      <div style={{fontWeight:700,fontSize:T.fs14}}>{c.label}</div>
                      {isLast&&<span style={S.tag(T.green)}>ÚLTIMA CONTAGEM</span>}
                      {c.isRecount&&<span style={S.tag(T.yellow)}>🔁 RECONTAGEM</span>}
                      {c.validated?<span style={S.tag(T.green)}>✅ APROVADA</span>:c.rejected?<span style={S.tag(T.red)}>❌ REPROVADA</span>:<span style={S.tag(T.yellow)}>⏳ PENDENTE</span>}
                    </div>
                    <div style={{fontSize:T.fs12,color:T.textMuted}}>{fmtDate(c.date)} · {ciList.length} insumo{ciList.length!==1?"s":""}</div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginLeft:10,flexShrink:0}}>
                    <span style={{fontSize:T.fs11,color:T.accent}}>{isExp?"▲":"▼"}</span>
                    {!c.validated&&!c.rejected&&<button onClick={e=>{e.stopPropagation();validateCounting(c);}} style={{...S.btn(T.green,false,true),fontSize:T.fs13}} title="Aprovar">✅</button>}
                    {!c.validated&&!c.rejected&&<button onClick={e=>{e.stopPropagation();rejectCounting(c);}} style={{...S.btn(T.red,false,true),fontSize:T.fs13,fontWeight:700}} title="Reprovar">✕</button>}
                    <button onClick={e=>{e.stopPropagation();setConfirm({message:`Excluir "${c.label}"?\nIsso também desfará o vínculo com o agendamento correspondente.`,onConfirm:()=>{setCountings(prev=>prev.filter(x=>x.id!==c.id));setScheduledDates(prev=>prev.map(s=>s.linkedCountingId===c.id?{...s,done:false,linkedCountingId:null}:s));setConfirm(null);}});}} style={{...S.btn(T.red,false,true)}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
                  </div>
                </div>
                {/* Expandable items */}
                {isExp&&(
                  <div style={{marginTop:10}}>
                    {ciList.map(ci=>{
                      const it=items.find(i=>i.id===ci.id)||ci;
                      const need = it.min && ci.counted < it.min
                        ? (it.max ? Math.max(it.max - ci.counted, 0) : Math.max(it.min - ci.counted, 0))
                        : 0;
                      return(
                        <div key={ci.id} style={{padding:"7px 0",borderBottom:`1px solid ${T.border}`}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                            <span style={{fontSize:T.fs12,color:T.text,fontWeight:600,flex:1,marginRight:8}}>{ci.name}</span>
                            <span style={{fontFamily:"monospace",fontSize:T.fs13,fontWeight:700,color:T.accent,flexShrink:0}}>{ci.counted} <span style={{fontSize:T.fs10,color:T.textMuted}}>{ci.unit||it.unit||""}</span></span>
                          </div>
                          {(it.min||it.max||need>0)&&(
                            <div style={{display:"flex",gap:10,marginTop:3,flexWrap:"wrap"}}>
                              {it.min?<span style={{fontSize:T.fs11,color:T.textMuted}}>Mínimo: <b style={{color:T.warm}}>{it.min}</b></span>:null}
                              {it.max?<span style={{fontSize:T.fs11,color:T.textMuted}}>Máximo: <b style={{color:T.purple}}>{it.max}</b></span>:null}
                              {need>0?<span style={{fontSize:T.fs11,color:T.textMuted,fontWeight:600}}>Necessário: <b style={{color:T.yellow}}>+{need}</b></span>:
                                null}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {subTab==="schedule"&&(
        <div>
          <div style={{...S.card({marginBottom:14,border:`1px solid ${T.border}`,padding:"18px"})}}>
            <div style={{fontWeight:700,color:T.yellow,marginBottom:12,fontSize:T.fs14}}>{schEditId!==null?"Editar agendamento":"Agendar contagem"}</div>
            <div style={S.label}>Nome</div>
            <input placeholder="Ex: CONTAGEM MENSAL" value={schForm.label} onChange={e=>setSchForm(p=>({...p,label:e.target.value.toUpperCase()}))} style={{...S.input({marginBottom:10,textTransform:"uppercase",fontSize:T.fs13})}}/>
            <div style={S.label}>Data</div>
            <input type="date" value={schForm.date} onChange={e=>setSchForm(p=>({...p,date:e.target.value}))} style={{...S.input({marginBottom:10})}}/>
            {schErr&&<div style={{color:T.red,fontSize:T.fs12,marginBottom:8}}>{schErr}</div>}
            <div style={{display:"flex",gap:8}}>
              <button onClick={saveSchedule} style={S.btn(T.yellow)}>{schEditId!==null?"Salvar":"Agendar"}</button>
              {schEditId!==null&&<button onClick={()=>{setSchEditId(null);setSchForm({label:"",date:""});setSchErr("");}} style={{...S.btn(T.surface),border:`1px solid ${T.border}`,color:T.textSub}}>Cancelar</button>}
            </div>
          </div>
          {sortedSch.filter(s=>!s.done).length===0&&<div style={{textAlign:"center",color:T.textMuted,padding:"30px 0",fontSize:T.fs13}}>Nenhuma contagem agendada.</div>}
          {sortedSch.filter(s=>!s.done).map(sd=>{
            const days=daysUntil(sd.date),ov=days<0&&!sd.done;
            const color=sd.done?T.green:ov?T.red:days<=2?T.yellow:T.text;
            const linkedCounting=sd.linkedCountingId?countings.find(c=>c.id===sd.linkedCountingId):null;
            const isLocked=!!linkedCounting; // locked if has a counting linked
            return(
              <div key={sd.id} style={{...S.card({marginBottom:10,border:`1px solid ${T.border}`})}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600,fontSize:T.fs13,color}}>{sd.label}</div>
                    <div style={{fontSize:T.fs11,color:T.textMuted,marginTop:2}}>
                      {fmtDate(sd.date)}{" "}
                      {sd.done?"· ✅ Concluído (pelo contador)":ov?"· ⚠️ ATRASADA — aguardando realização":days===0?"· 📋 HOJE":`· em ${days} dia${days!==1?"s":""}`}
                    {sd.isRecount&&sd.deadline&&!sd.done&&` · Prazo: ${fmtDate(sd.deadline)}`}
                    </div>
                    {isLocked&&<div style={{fontSize:T.fs10,color:T.yellow,marginTop:4}}>🔗 Vinculada à contagem "{linkedCounting.label}"</div>}
                  </div>
                  <div style={{display:"flex",gap:6,marginLeft:8}}>
                    {!sd.done&&!isLocked&&<button onClick={()=>startEditSch(sd)} style={{...S.btn(T.accent,false,true)}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>}
                    <button onClick={()=>setConfirm({message:`Excluir agendamento "${sd.label}"?${isLocked?" A contagem vinculada não será excluída automaticamente.":""}`,onConfirm:()=>{setScheduledDates(prev=>prev.filter(s=>s.id!==sd.id));setConfirm(null);}})} style={{...S.btn(T.red,false,true)}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
                  </div>
                </div>
              </div>
            );
          })}
          <div style={{...S.card({marginTop:8,background:T.accent+"08",border:`1px solid ${T.border}`,padding:"12px 14px"})}}>
            <div style={{fontSize:T.fs11,color:T.textSub,lineHeight:1.7}}>
              ℹ️ O status <b style={{color:T.green}}>Concluído</b> é marcado automaticamente quando o contador realiza a contagem. Contagens <b style={{color:T.red}}>atrasadas</b> ficam disponíveis para realizar e são concluídas ao enviar.
            </div>
          </div>
        </div>
      )}
      {subTab==="evolution"&&<EvoTab items={items} countings={countings} purchases={purchases}/>}
    </div>
  );
}

function BuyPurchaseGroup({label,color,items,it,openEditPurchase,setConfirmDel}) {
  const [open,setOpen]=useState(false);
  const total=items.reduce((s,p)=>s+Number(p.qty||0),0);
  const totalVal=items.reduce((s,p)=>s+Number(p.qty||0)*Number(p.itemValue||it.value||0),0);
  return(
    <div style={{marginBottom:6}}>
      <div onClick={()=>setOpen(p=>!p)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",background:T.surface,borderRadius:8,padding:"8px 10px"}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{...S.tag(color),fontSize:T.fs10}}>{label}</span>
          <span style={{fontSize:T.fs11,color:T.textMuted}}>{items.length} compra{items.length!==1?"s":""}</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{textAlign:"right"}}>
            <div style={{fontFamily:T.fontMono,fontSize:T.fs12,fontWeight:700,color}}>+{total}</div>
            <div style={{fontSize:T.fs10,color:T.textMuted}}>{fmtCur(totalVal)}</div>
          </div>
          <span style={{fontSize:T.fs10,color:T.textMuted}}>{open?"▲":"▼"}</span>
        </div>
      </div>
      {open&&items.map(p=>(
        <div key={p.id} style={{background:T.card,borderRadius:8,padding:"8px 10px",marginTop:4,borderLeft:`3px solid ${color}66`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <span style={{fontSize:T.fs12,color,fontWeight:600}}>{fmtDate(p.date)}</span>
              {p.note&&<div style={{fontSize:T.fs11,color:T.textMuted,marginTop:2}}>📝 {p.note}</div>}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{textAlign:"right"}}>
                <div style={{fontFamily:T.fontMono,fontSize:T.fs13,fontWeight:700,color}}>+{p.qty}</div>
                <div style={{fontSize:T.fs10,color:T.textMuted}}>{fmtCur(Number(p.qty)*Number(p.itemValue||it.value||0))}</div>
              </div>
              <div style={{display:"flex",gap:4}}>
                <button onClick={()=>openEditPurchase(p)} style={{...S.btn(T.accent,false,true),padding:"5px 8px"}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                <button onClick={()=>setConfirmDel(p)} style={{...S.btn(T.red,false,true),padding:"5px 8px"}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
              </div>
            </div>
          </div>
          {p.attachment&&p.attachment.startsWith("data:image")&&<img src={p.attachment} alt="" style={{width:"100%",maxHeight:80,objectFit:"cover",borderRadius:7,marginTop:6}}/>}
        </div>
      ))}
    </div>
  );
}

// ─── BUY TAB ─────────────────────────────────────────────────────────────────
function BuyTab({items,setItems,countings,purchases,setPurchases,initialSubTab="program"}) {
  const [subTab,setSubTab]=useState(initialSubTab);
  const [progSearch,setProgSearch]=useState("");
  const [histSearch,setHistSearch]=useState("");
  const lastC=countings.filter(c=>c.validated&&!c.rejected).length?[...countings].filter(c=>c.validated&&!c.rejected).sort((a,b)=>Number(b.id||0)-Number(a.id||0))[0]:null;
  const lc={};if(lastC)(lastC.items||[]).forEach(ci=>{lc[ci.id]=ci.counted;});

  // Purchase suggestion: based on counted qty from last validated counting
  // Purchases already made are shown as info but don't hide the need
  // Need = max - (counted + already_purchased), minimum 0
  const getPurchasedQty = (itemId) => (purchases||[]).filter(p=>p.itemId===itemId).reduce((s,p)=>s+Number(p.qty||0),0);

  const getPostCountingPurchases=(itemId)=>{
    // Count purchases made AFTER the last validated counting
    // Use datetime if available for precision, otherwise fallback to date-only (day after)
    if(!lastC) return getPurchasedQty(itemId);
    const cutoff = lastC.datetime || (lastC.date+"T23:59:59Z"); // end of counting day
    return (purchases||[]).filter(p=>{
      const pdt = p.datetime || (p.date+"T00:00:00Z");
      return p.itemId===itemId && pdt > cutoff;
    }).reduce((s,p)=>s+Number(p.qty||0),0);
  };
  const allSug=items.filter(i=>{
    const alreadyBought=getPurchasedQty(i.id);
    const hasValidated=lc[i.id]!==undefined;
    const postBought=getPostCountingPurchases(i.id);
    // base: if validated counting → counted + post-counting purchases; else → total bought
    const base=hasValidated?(lc[i.id]+postBought):alreadyBought;
    if(i.max&&base<i.max) return true;
    if(!i.max&&i.min&&base<i.min) return true;
    return false;
  }).map(i=>{
    const alreadyBought=getPurchasedQty(i.id);
    const hasValidated=lc[i.id]!==undefined;
    const postBought=getPostCountingPurchases(i.id);
    const curBase=hasValidated?(lc[i.id]+postBought):alreadyBought;
    const isInitial=!alreadyBought&&!(i.purchases||[]).length;
    const need=i.max?Math.max(i.max-curBase,0):Math.max(i.min-curBase,0);
    return{...i,curBase,alreadyBought,postBought,hasValidated,need,est:Number(i.value||0)*need,isInitial};
  }).filter(i=>i.need>0);

  const [sel,setSel]=useState(()=>Object.fromEntries(allSug.map(i=>[i.id,true])));
  useEffect(()=>{setSel(prev=>{const next={};allSug.forEach(i=>{next[i.id]=prev[i.id]!==undefined?prev[i.id]:true;});return next;});},[countings.length,JSON.stringify((purchases||[]).map(p=>p.id))]);

  // Purchase modal (add or edit)
  const [buyModal,setBuyModal]=useState(null);
  const [editPurchaseId,setEditPurchaseId]=useState(null);
  const [buyQty,setBuyQty]=useState("");
  const [buyUnitValue,setBuyUnitValue]=useState("");
  const [buyDate,setBuyDate]=useState(todayStr());
  const [buyNote,setBuyNote]=useState("");
  const [buyAttach,setBuyAttach]=useState(null);
  const [buyAttachName,setBuyAttachName]=useState("");
  const [confirmDel,setConfirmDel]=useState(null);
  const buyFileRef=useRef();

  const openBuy=(it)=>{setEditPurchaseId(null);setBuyModal(it);setBuyQty(String(it.need));setBuyUnitValue(String(it.value||""));setBuyDate(todayStr());setBuyNote("");setBuyAttach(null);setBuyAttachName("");};
  const openEditPurchase=(p)=>{
    const it=items.find(i=>i.id===p.itemId);
    setEditPurchaseId(p.id);
    setBuyModal(it||{id:p.itemId,name:p.itemName,unit:"",value:0,need:0});
    setBuyQty(String(p.qty));setBuyUnitValue(String(p.unitValue||it?.value||""));setBuyDate(p.date);setBuyNote(p.note||"");setBuyAttach(p.attachment||null);setBuyAttachName(p.attachmentName||"");
  };

  const confirmBuy=()=>{
    const qty=Number(buyQty);
    if(!qty||qty<=0) return;
    const newUnitValue=buyUnitValue!==""?Number(buyUnitValue):null;
    if(editPurchaseId!==null){
      // Edit: save unitValue on purchase record (for historical integrity), update item.value if changed
      const uv=newUnitValue!==null?newUnitValue:Number(buyModal.value||0);
      setPurchases(prev=>(prev||[]).map(p=>p.id===editPurchaseId?{...p,qty,date:buyDate,note:buyNote,attachment:buyAttach,attachmentName:buyAttachName,unitValue:uv,itemValue:uv}:p));
      setItems(prev=>prev.map(it=>{
        if(it.id!==buyModal.id) return it;
        const updatedPurchases=(it.purchases||[]).map(p=>p.id===editPurchaseId?{...p,qty,date:buyDate,note:buyNote,attachment:buyAttach,attachmentName:buyAttachName,unitValue:uv}:p);
        // Update item.value going forward — past purchases keep their own unitValue
        return newUnitValue!==null?{...it,value:newUnitValue,purchases:updatedPurchases}:{...it,purchases:updatedPurchases};
      }));
    } else {
      // New purchase — snapshot current unit value on the purchase record
      const uv=newUnitValue!==null?newUnitValue:Number(buyModal.value||0);
      const currentItem=items.find(i=>i.id===buyModal.id);
      const isFirstPurchase=!(currentItem?.purchases||[]).length&&!(purchases||[]).filter(p=>p.itemId===buyModal.id).length;
      const pType=isFirstPurchase?"initial":"reposition";
      const purchase={id:Date.now(),itemId:buyModal.id,itemName:buyModal.name,itemValue:uv,unitValue:uv,qty,date:buyDate,datetime:nowISO(),note:buyNote,attachment:buyAttach,attachmentName:buyAttachName,pType};
      setPurchases(prev=>[...(prev||[]),purchase]);
      setItems(prev=>prev.map(it=>{
        if(it.id!==buyModal.id) return it;
        // Update item.value going forward if user changed it
        const base=newUnitValue!==null?{...it,value:newUnitValue}:it;
        return {...base,purchases:[...(it.purchases||[]),{id:purchase.id,qty,date:buyDate,note:buyNote,attachment:buyAttach,attachmentName:buyAttachName,unitValue:uv,pType}]};
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
  const filteredHist=itemsWithPurchases.filter(g=>!histSearch||g.it.name.toLowerCase().includes(histSearch.toLowerCase()));
  const toggleHistSel=(id)=>{
    const base = selHistory===null ? Object.fromEntries(itemsWithPurchases.map(g=>[g.it.id,true])) : {...selHistory};
    base[id]=!base[id];
    setSelHistory(base);
  };
  const toggleAllHist=()=>{
    const allSel = filteredHist.every(g=>isHistSel(g.it.id));
    if(allSel) setSelHistory(Object.fromEntries(filteredHist.map(g=>[g.it.id,false])));
    else setSelHistory(null);
  };
  const selHistItems=filteredHist.filter(g=>isHistSel(g.it.id));
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
            <div style={{fontWeight:700,fontSize:T.fs15,color:T.green,marginBottom:4}}>{editPurchaseId?"Editar compra":"Registrar compra"}</div>
            <div style={{fontSize:T.fs13,color:T.textSub,marginBottom:14}}>{buyModal.name}</div>
            <div style={S.label}>Quantidade comprada</div>
            <input type="number" value={buyQty} onChange={e=>setBuyQty(e.target.value)} onBlur={e=>{const n=parseFloat(e.target.value);if(!isNaN(n))setBuyQty(String(n));}} style={{...S.input({marginBottom:10})}}/>
            <div style={S.label}>Valor unitário</div>
            <input type="number" step="0.01" placeholder={buyModal.value>0?String(buyModal.value):"0.00"} value={buyUnitValue} onChange={e=>setBuyUnitValue(e.target.value)} onBlur={e=>{const n=parseFloat(e.target.value);if(!isNaN(n))setBuyUnitValue(n.toFixed(2));}} style={{...S.input({marginBottom:10})}}/>
            {buyUnitValue!==""&&Number(buyUnitValue)!==Number(buyModal.value||0)&&<div style={{fontSize:T.fs11,color:T.yellow,marginBottom:10}}>⚠️ O valor unitário do insumo será atualizado de {fmtCur(buyModal.value||0)} para {fmtCur(Number(buyUnitValue))} a partir desta compra.</div>}
            <div style={S.label}>Data da compra</div>
            <input type="date" value={buyDate} onChange={e=>setBuyDate(e.target.value)} style={{...S.input({marginBottom:10})}}/>
            <div style={S.label}>Observação (opcional)</div>
            <input placeholder="Ex: Fornecedor XYZ" value={buyNote} onChange={e=>setBuyNote(e.target.value)} style={{...S.input({marginBottom:10})}}/>
            <div style={S.label}>Anexo (nota fiscal, etc)</div>
            <button onClick={()=>buyFileRef.current.click()} style={{...S.btn(T.purple,true,true),marginBottom:buyAttach?8:14,justifyContent:"flex-start"}}>📎 {buyAttachName||"Selecionar arquivo"}</button>
            <input ref={buyFileRef} type="file" accept="image/*,.pdf" onChange={e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{setBuyAttach(ev.target.result);setBuyAttachName(f.name);};r.readAsDataURL(f);}} style={{display:"none"}}/>
            {buyAttach?.startsWith("data:image")&&<img src={buyAttach} alt="" style={{width:"100%",maxHeight:90,objectFit:"cover",borderRadius:8,marginBottom:10}}/>}
            <div style={{display:"flex",gap:8}}>
              <button onClick={confirmBuy} style={S.btn(T.green)}>{editPurchaseId?"Salvar":"Confirmar"}</button>
              <button onClick={()=>{setBuyModal(null);setEditPurchaseId(null);setBuyUnitValue("");}} style={{...S.btn(T.surface),border:`1px solid ${T.border}`,color:T.textSub}}>Cancelar</button>
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
          <div style={{...S.card({marginBottom:12,background:T.accent+"08",border:`1px solid ${T.border}`,padding:"11px 14px"})}}>
            <div style={{fontSize:T.fs12,color:T.textMuted,marginBottom:6}}>{lastC?<>Baseado em: <b style={{color:T.text}}>{lastC.label}</b> · {fmtDate(lastC.date)} · Itens com estoque abaixo do máximo.</>:<>Itens com estoque abaixo do máximo. Realize contagens regularmente para manter as sugestões precisas.</>}</div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              <span style={{fontSize:T.fs10,color:T.warm,fontWeight:600}}>■ Entrada inicial</span>
              <span style={{fontSize:T.fs10,color:T.purple,fontWeight:600}}>■ Reposição</span>
            </div>
          </div>
          {lastC&&allSug.length===0&&<div style={{textAlign:"center",color:T.green,padding:"40px 0",fontWeight:600,fontSize:T.fs14}}>✅ Todos os insumos já atingiram o máximo!</div>}
          {allSug.length>0&&(()=>{
            const filteredSug=allSug.filter(it=>!progSearch||it.name.toLowerCase().includes(progSearch.toLowerCase()));
            return(
            <>
              <input placeholder="🔍 Pesquisar..." value={progSearch} onChange={e=>setProgSearch(e.target.value)} style={{...S.input({marginBottom:10})}}/>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{fontSize:T.fs12,color:T.textMuted}}>{selItems.length} de {allSug.length} itens</div>
                <button onClick={toggleAll} style={{...S.btn(T.surface,false,true),border:`1px solid ${T.border}`,color:T.textSub,fontSize:T.fs11}}>{allSug.every(i=>sel[i.id])?"Desmarcar todos":"Selecionar todos"}</button>
              </div>
              {filteredSug.map(it=>{
                const typeColor=it.isInitial?T.warm:T.purple;
                const typeLabel=it.isInitial?"Entrada inicial":"Reposição";
                return(
                <div key={it.id} style={{...S.card({marginBottom:10,border:`1px solid ${T.border}`,background:sel[it.id]?T.green+"06":T.card})}}> 
                  <div style={{display:"flex",flexDirection:"column",gap:0}}>
                    {/* Header row: checkbox + name + tag */}
                    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:6}}>
                      <div onClick={()=>setSel(p=>({...p,[it.id]:!p[it.id]}))} style={{width:20,height:20,borderRadius:5,border:`2px solid ${sel[it.id]?T.green:T.textMuted}`,background:sel[it.id]?T.green:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,cursor:"pointer"}}>
                        {sel[it.id]&&<span style={{color:"#fff",fontSize:T.fs12,fontWeight:900}}>✓</span>}
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8,flex:1}}>
                        <div style={{fontWeight:700,fontSize:T.fs14}}>{it.name}</div>
                        <span style={{...S.tag(typeColor),fontSize:T.fs10}}>{typeLabel}</span>
                      </div>
                    </div>
                    <div style={{fontSize:T.fs12,color:T.accent,marginBottom:10}}>{it.unit}</div>
                    {/* Sub-content: full width, aligned to left edge */}
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
                      <div style={{background:T.surface,borderRadius:9,padding:"9px 8px"}}>
                        <div style={{fontSize:T.fs10,color:T.textMuted,marginBottom:2,fontWeight:600}}>{it.isInitial?"Quantidade inicial":"Última contagem"}</div>
                        <div style={{fontFamily:T.fontMono,fontSize:T.fs15,fontWeight:700,color:it.isInitial?T.red:typeColor}}>{it.isInitial?0:it.hasValidated?it.curBase:"—"}</div>
                      </div>
                      <div style={{background:T.surface,borderRadius:9,padding:"9px 8px"}}>
                        <div style={{fontSize:T.fs10,color:T.textMuted,marginBottom:2,fontWeight:600}}>Necessário</div>
                        <div style={{fontFamily:T.fontMono,fontSize:T.fs15,fontWeight:700,color:T.yellow}}>+{it.need}</div>
                      </div>
                      <div style={{background:T.surface,borderRadius:9,padding:"9px 8px"}}>
                        <div style={{fontSize:T.fs10,color:T.textMuted,marginBottom:2,fontWeight:600}}>Valor unitário</div>
                        <div style={{fontFamily:T.fontMono,fontSize:T.fs12,fontWeight:700,color:T.yellow}}>{fmtCur(it.value)}</div>
                      </div>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:T.green+"0a",border:`1px solid ${T.border}`,borderRadius:9,padding:"7px 10px",marginBottom:8}}>
                      <div style={{fontSize:T.fs11,color:T.textMuted,fontWeight:600}}>Valor estimado</div>
                      <div style={{fontFamily:T.fontMono,fontSize:T.fs13,fontWeight:700,color:T.green}}>{fmtCur(it.est)}</div>
                    </div>
                    {(it.min||it.max)&&<div style={{fontSize:T.fs11,color:T.textMuted,marginBottom:8}}>{it.min?<span>Mínimo: <b style={{color:T.warm}}>{it.min}</b></span>:""}{it.min&&it.max?" · ":""}{it.max?<span>Máximo: <b style={{color:T.purple}}>{it.max}</b></span>:""}</div>}
                    <button onClick={()=>sel[it.id]?openBuy(it):null} style={{...S.btn(sel[it.id]?T.green:T.textMuted,true,true),fontSize:T.fs12,opacity:sel[it.id]?1:0.4,cursor:sel[it.id]?"pointer":"not-allowed"}}>🛒 Registrar compra</button>
                  </div>
                </div>
                );
              })}
              <div style={{...S.card({border:`1px solid ${T.border}`,background:T.yellow+"08"}),display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4}}>
                <div style={{fontWeight:700,color:T.yellow,fontSize:T.fs14}}>💰 Total Estimado (selecionados)</div>
                <div style={{fontFamily:T.fontMono,fontSize:T.fs18,fontWeight:700,color:T.yellow}}>{fmtCur(totalEst)}</div>
              </div>
            </>
            );
          })()}
        </div>
      )}

      {subTab==="history"&&(
        <div>
          <div style={{...S.card({marginBottom:14,background:T.green+"08",border:`1px solid ${T.border}`,padding:"12px 14px"})}}>
            <div style={{fontWeight:700,color:T.green,fontSize:T.fs13,marginBottom:2}}>📦 Compras Realizadas</div>
            <div style={{fontSize:T.fs11,color:T.textMuted}}>Agrupado por insumo. Selecione para calcular o total de compras.</div>
          </div>

          <input placeholder="🔍 Pesquisar..." value={histSearch} onChange={e=>setHistSearch(e.target.value)} style={{...S.input({marginBottom:10})}}/>
          {itemsWithPurchases.length===0&&<div style={{textAlign:"center",color:T.textMuted,padding:"40px 0",fontSize:T.fs13}}>Nenhuma compra registrada ainda.</div>}

          {itemsWithPurchases.length>0&&(()=>{
            return(
            <>
              {/* Select all + grand total */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <button onClick={toggleAllHist} style={{...S.btn(T.surface,false,true),border:`1px solid ${T.border}`,color:T.textSub,fontSize:T.fs11}}>{filteredHist.every(g=>isHistSel(g.it.id))?"Desmarcar todos":"Selecionar todos"}</button>
                <div style={{fontSize:T.fs12,color:T.textMuted}}>{selHistItems.length} de {itemsWithPurchases.length} selecionados</div>
              </div>

              {filteredHist.map(({it,ps,totalQty,totalVal})=>{
                const isSel=isHistSel(it.id);
                return(
                  <div key={it.id} style={{...S.card({marginBottom:12,border:`1px solid ${T.border}`,background:isSel?T.green+"05":T.card})}}>
                    {/* Item header with checkbox */}
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                      <div onClick={()=>toggleHistSel(it.id)} style={{width:20,height:20,borderRadius:5,border:`2px solid ${isSel?T.green:T.textMuted}`,background:isSel?T.green:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,cursor:"pointer"}}>
                        {isSel&&<span style={{color:"#fff",fontSize:T.fs12,fontWeight:900}}>✓</span>}
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
                    {/* Grouped purchases by type */}
                    {(()=>{
                      const initials=ps.filter(p=>p.pType==="initial");
                      const repos=ps.filter(p=>p.pType==="reposition");
                      const others=ps.filter(p=>!p.pType||(!["initial","reposition"].includes(p.pType)));
                      const groups=[
                        ...(initials.length?[{label:"Entrada inicial",color:T.warm,items:initials}]:[]),
                        ...(repos.length?[{label:"Reposição",color:T.purple,items:repos}]:[]),
                        ...(others.length?[{label:"Compras",color:T.green,items:others}]:[]),
                      ];
                      return groups.map((g,gi)=>(
                        <BuyPurchaseGroup key={gi} label={g.label} color={g.color} items={g.items} it={it} openEditPurchase={openEditPurchase} setConfirmDel={setConfirmDel}/>
                      ));
                    })()}
                    {/* Item subtotal */}
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:T.green+"08",borderRadius:8,padding:"7px 10px",marginTop:4}}>
                      <span style={{fontSize:T.fs11,color:T.textMuted,fontWeight:600}}>Subtotal do insumo</span>
                      <span style={{fontFamily:T.fontMono,fontSize:T.fs13,fontWeight:700,color:T.green}}>{fmtCur(totalVal)}</span>
                    </div>
                  </div>
                );
              })}

              {/* Grand total of selected */}
              {selHistItems.length>0&&(
                <div style={{...S.card({border:`1px solid ${T.border}`,background:T.yellow+"08",padding:"14px 16px"})}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <div style={{fontWeight:700,color:T.yellow,fontSize:T.fs14}}>💰 Total Selecionado</div>
                    <div style={{fontFamily:T.fontMono,fontSize:T.fs18,fontWeight:700,color:T.yellow}}>{fmtCur(totalHistVal)}</div>
                  </div>
                  <div style={{fontSize:T.fs11,color:T.textMuted}}>{selHistItems.length} insumo{selHistItems.length!==1?"s":""} · {totalHistQty} unidades no total</div>
                </div>
              )}
            </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ─── EVOLUTION TAB ───────────────────────────────────────────────────────────
function EvoTab({items,countings,purchases}) {
  const [selItem,setSelItem]=useState("all");
  const [expandPurch,setExpandPurch]=useState({});
  const si = selItem==="all"?null:items.find(i=>i.id===Number(selItem))||null;

  // For single item: grouped purchase row + validated countings
  const getSeries = () => {
    if(!si) return [];
    const itemPurchases=[...(purchases||[])].filter(p=>p.itemId===si.id).sort((a,b)=>(a.date||"").localeCompare(b.date||""));
    const totalPurch=itemPurchases.reduce((s,p)=>s+Number(p.qty||0),0);
    // Group by type for collapse
    const initials=itemPurchases.filter(p=>p.pType==="initial");
    const repos=itemPurchases.filter(p=>p.pType==="reposition");
    const others=itemPurchases.filter(p=>!p.pType||!["initial","reposition"].includes(p.pType));
    const purchGroups=[
      ...(initials.length?[{label:"Entrada inicial",color:T.warm,items:initials,totalQty:initials.reduce((s,p)=>s+Number(p.qty||0),0)}]:[]),
      ...(repos.length?[{label:"Reposição",color:T.purple,items:repos,totalQty:repos.reduce((s,p)=>s+Number(p.qty||0),0)}]:[]),
      ...(others.length?[{label:"Compras",color:T.green,items:others,totalQty:others.reduce((s,p)=>s+Number(p.qty||0),0)}]:[]),
    ];
    const purchRow=totalPurch>0?[{qty:totalPurch,label:"Total adquirido",purchGroups,type:"purchase"}]:[];
    const sortedC=[...countings].filter(c=>c.validated&&!c.rejected).sort((a,b)=>(a.date||"").localeCompare(b.date||""));
    const countRows=sortedC
      .filter(c=>(c.items||[]).some(ci=>ci.id===si.id)) // only countings that actually included this item
      .map(c=>{
        const ci=(c.items||[]).find(i=>i.id===si.id);
        return{qty:ci?.counted??0,label:c.label,date:c.date,type:"counting"};
      });
    return [...purchRow,...countRows];
  };

  const series=getSeries();
  const totalAcquired=getTotalAcquired(si||{acquiredQty:0,purchases:[]});
  const lastCounting=[...countings].filter(c=>c.validated).sort((a,b)=>Number(b.id||0)-Number(a.id||0))[0];
  const lastCountedQty=lastCounting?(lastCounting.items||[]).find(i=>i.id===si?.id)?.counted??0:0;
  const diff=lastCounting&&si?lastCountedQty-totalAcquired:null;
  const maxQ=Math.max(...series.map(d=>d.qty),totalAcquired,lastCountedQty,1);

  return (
    <div>
      <div style={{marginBottom:14}}>
        <div style={S.label}>Selecionar insumo</div>
        {items.length===0
          ? <div style={{fontSize:T.fs13,color:T.textMuted}}>Nenhum insumo cadastrado.</div>
          : <select value={selItem} onChange={e=>setSelItem(e.target.value)} style={S.input()}>
              <option value="all">TODOS</option>
              {items.map(i=><option key={i.id} value={String(i.id)}>{i.name}</option>)}
            </select>
        }
      </div>



      {selItem==="all"&&items.length>0&&(()=>{
        const lastVal=[...countings].filter(c=>c.validated).sort((a,b)=>Number(b.id||0)-Number(a.id||0))[0];
        // Totals
        const totCad=items.reduce((s,i)=>s+getTotalAcquired(i),0);
        const totCont=lastVal?items.reduce((s,i)=>{
          const ci=(lastVal.items||[]).find(x=>x.id===i.id);
          return s+(ci?.counted??0);
        },0):null;
        const totDiffQtd=totCont!==null?totCont-totCad:null;
        const totAcqVal=items.reduce((s,i)=>s+Number(i.value||0)*getTotalAcquired(i),0);
        const totContVal=lastVal?items.reduce((s,i)=>{
          const ci=(lastVal.items||[]).find(x=>x.id===i.id);
          return s+Number(i.value||0)*(ci?.counted??0);
        },0):null;
        const totDiffVal=totContVal!==null?totContVal-totAcqVal:null;
        const diffColor=(d)=>d===null?T.textMuted:d===0?T.green:d>0?T.purple:T.red;
        const Cel=({label,value,color=T.text})=>(
          <div style={{background:T.surface,borderRadius:9,padding:"9px 10px"}}>
            <div style={{fontSize:T.fs10,color:T.textMuted,fontWeight:700,marginBottom:3,textTransform:"uppercase",letterSpacing:.3}}>{label}</div>
            <div style={{fontFamily:T.fontMono,fontSize:T.fs14,fontWeight:700,color}}>{value}</div>
          </div>
        );
        return(
          <div style={S.card({marginBottom:14,padding:"14px 16px"})}>
            <div style={{fontWeight:700,fontSize:T.fs13,color:T.text,marginBottom:12}}>⚖️ Última contagem — Total adquirido</div>
            {/* Per-item rows — always shown */}
            {items.map(i=>{
              const ci=lastVal?(lastVal.items||[]).find(x=>x.id===i.id):null;
              const counted=ci?.counted??0;
              const acq=getTotalAcquired(i);
              const dQ=ci?counted-acq:null;
              const dV=ci&&i.value>0?dQ*i.value:null;
              const dc=diffColor(dQ);
              return(
                <div key={i.id} style={{padding:"7px 0",borderBottom:`1px solid ${T.border}44`}}>
                  <div style={{fontWeight:700,fontSize:T.fs12,color:T.text,marginBottom:4}}>{i.name}</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                    <div style={{background:T.surface,borderRadius:7,padding:"6px 8px"}}>
                      <div style={{fontSize:9,color:T.textMuted,fontWeight:700,textTransform:"uppercase",letterSpacing:.3,marginBottom:2}}>Quantidade total adquirida</div>
                      <div style={{fontFamily:T.fontMono,fontSize:T.fs13,fontWeight:700,color:T.accent}}>{acq}</div>
                    </div>
                    <div style={{background:T.surface,borderRadius:7,padding:"6px 8px"}}>
                      <div style={{fontSize:9,color:T.textMuted,fontWeight:700,textTransform:"uppercase",letterSpacing:.3,marginBottom:2}}>Quantidade total contabilizada</div>
                      <div style={{fontFamily:T.fontMono,fontSize:T.fs13,fontWeight:700,color:ci?dc:T.textMuted}}>{ci?counted:"—"}</div>
                    </div>
                    <div style={{background:T.surface,borderRadius:7,padding:"6px 8px"}}>
                      <div style={{fontSize:9,color:T.textMuted,fontWeight:700,textTransform:"uppercase",letterSpacing:.3,marginBottom:2}}>Diferença em quantidade</div>
                      <div style={{fontFamily:T.fontMono,fontSize:T.fs13,fontWeight:700,color:dc}}>{dQ===null?"—":dQ>0?`+${dQ}`:String(dQ)}</div>
                    </div>
                    <div style={{background:T.surface,borderRadius:7,padding:"6px 8px"}}>
                      <div style={{fontSize:9,color:T.textMuted,fontWeight:700,textTransform:"uppercase",letterSpacing:.3,marginBottom:2}}>Valor total adquirido</div>
                      <div style={{fontFamily:T.fontMono,fontSize:T.fs13,fontWeight:700,color:T.accent}}>{i.value>0?fmtCur(i.value*acq):"—"}</div>
                    </div>
                    <div style={{background:T.surface,borderRadius:7,padding:"6px 8px"}}>
                      <div style={{fontSize:9,color:T.textMuted,fontWeight:700,textTransform:"uppercase",letterSpacing:.3,marginBottom:2}}>Valor total contabilizado</div>
                      <div style={{fontFamily:T.fontMono,fontSize:T.fs13,fontWeight:700,color:ci&&i.value>0?dc:T.textMuted}}>{ci&&i.value>0?fmtCur(i.value*counted):"—"}</div>
                    </div>
                    <div style={{background:T.surface,borderRadius:7,padding:"6px 8px"}}>
                      <div style={{fontSize:9,color:T.textMuted,fontWeight:700,textTransform:"uppercase",letterSpacing:.3,marginBottom:2}}>Diferença em valor</div>
                      <div style={{fontFamily:T.fontMono,fontSize:T.fs13,fontWeight:700,color:dV!==null?dc:T.textMuted}}>{dV!==null?(dV>0?`+${fmtCur(dV)}`:fmtCur(dV)):"—"}</div>
                    </div>
                  </div>
                </div>
              );
            })}
            {/* Totalization — always shown */}
            <div style={{marginTop:12,paddingTop:12,borderTop:`2px solid ${T.border}`}}>
              <div style={{fontSize:T.fs11,color:T.textMuted,fontWeight:700,textTransform:"uppercase",letterSpacing:.4,marginBottom:8}}>Totalização</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:6}}>
                <Cel label="Quantidade total adquirida"     value={totCad}                                                                    color={T.accent}/>
                <Cel label="Quantidade total contabilizada" value={totCont!==null?totCont:"—"}                                                color={totCont!==null?diffColor(totCont-totCad):T.textMuted}/>
                <Cel label="Diferença em quantidade"        value={totDiffQtd!==null?(totDiffQtd>0?`+${totDiffQtd}`:String(totDiffQtd)):"—"} color={diffColor(totDiffQtd)}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                <Cel label="Valor total adquirido"     value={totAcqVal>0?fmtCur(totAcqVal):"—"}                                                             color={totAcqVal>0?T.accent:T.textMuted}/>
                <Cel label="Valor total contabilizado" value={totContVal!==null&&totContVal>0?fmtCur(totContVal):"—"}                                         color={totContVal!==null&&totContVal>0?diffColor(totContVal-totAcqVal):T.textMuted}/>
                <Cel label="Diferença em valor"        value={totDiffVal!==null?(totDiffVal>0?`+${fmtCur(totDiffVal)}`:fmtCur(totDiffVal)):"—"}               color={diffColor(totDiffVal)}/>
              </div>
            </div>
          </div>
        );
      })()}

      {si&&(
        <>
          {/* Summary card: total adquirido vs última contagem */}
          <div style={{...S.card({marginBottom:14,padding:"14px 16px",border:`1px solid ${T.border}`})}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:T.fs12,fontWeight:700,color:T.text}}>⚖️ Última contagem — Total adquirido</div>
              {si.value>0&&<div style={{fontSize:T.fs11,color:T.textMuted}}>Valor unitário: <b style={{color:T.yellow}}>{fmtCur(si.value)}</b></div>}
            </div>
            {/* Row 1: quantities */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
              <div style={{background:T.surface,borderRadius:9,padding:"10px"}}>
                <div style={{fontSize:T.fs10,color:T.textMuted,fontWeight:700,marginBottom:4,textTransform:"uppercase",letterSpacing:.3}}>Quantidade total adquirida</div>
                <div style={{fontFamily:T.fontMono,fontSize:T.fs18,fontWeight:700,color:T.accent}}>{totalAcquired}</div>
                <div style={{fontSize:T.fs10,color:T.textMuted}}>{si.unit}</div>
              </div>
              <div style={{background:T.surface,borderRadius:9,padding:"10px"}}>
                <div style={{fontSize:T.fs10,color:T.textMuted,fontWeight:700,marginBottom:4,textTransform:"uppercase",letterSpacing:.3}}>Quantidade total contabilizada</div>
                <div style={{fontFamily:T.fontMono,fontSize:T.fs18,fontWeight:700,color:diff===null?T.textSub:lastCountedQty<totalAcquired?T.red:lastCountedQty===totalAcquired?T.green:T.purple}}>{lastCounting?lastCountedQty:"—"}</div>
                <div style={{fontSize:T.fs10,color:T.textMuted}}>{lastCounting?fmtDate(lastCounting.date):"Sem contagem"}</div>
              </div>
              <div style={{background:T.surface,borderRadius:9,padding:"10px"}}>
                <div style={{fontSize:T.fs10,color:T.textMuted,fontWeight:700,marginBottom:4,textTransform:"uppercase",letterSpacing:.3}}>Diferença em quantidade</div>
                <div style={{fontFamily:T.fontMono,fontSize:T.fs18,fontWeight:700,color:diff===null?T.textSub:diff===0?T.green:diff>0?T.purple:T.red}}>
                  {diff===null?"—":diff>0?`+${diff}`:String(diff)}
                </div>
              </div>
            </div>
            {/* Row 2: values — only if has unit value */}
            {si.value>0&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                <div style={{background:T.surface,borderRadius:9,padding:"10px"}}>
                  <div style={{fontSize:T.fs10,color:T.textMuted,fontWeight:700,marginBottom:4,textTransform:"uppercase",letterSpacing:.3}}>Valor total adquirido</div>
                  <div style={{fontFamily:T.fontMono,fontSize:T.fs14,fontWeight:700,color:T.accent}}>{fmtCur(Number(si.value)*totalAcquired)}</div>
                </div>
                <div style={{background:T.surface,borderRadius:9,padding:"10px"}}>
                  <div style={{fontSize:T.fs10,color:T.textMuted,fontWeight:700,marginBottom:4,textTransform:"uppercase",letterSpacing:.3}}>Valor total contabilizado</div>
                  <div style={{fontFamily:T.fontMono,fontSize:T.fs14,fontWeight:700,color:diff===null?T.textSub:lastCountedQty<totalAcquired?T.red:lastCountedQty===totalAcquired?T.green:T.purple}}>{lastCounting?fmtCur(Number(si.value)*lastCountedQty):"—"}</div>
                </div>
                <div style={{background:T.surface,borderRadius:9,padding:"10px"}}>
                  <div style={{fontSize:T.fs10,color:T.textMuted,fontWeight:700,marginBottom:4,textTransform:"uppercase",letterSpacing:.3}}>Diferença em valor</div>
                  <div style={{fontFamily:T.fontMono,fontSize:T.fs14,fontWeight:700,color:diff===null?T.textSub:diff===0?T.green:diff>0?T.purple:T.red}}>{diff===null?"—":fmtCur(Number(si.value)*diff)}</div>
                </div>
              </div>
            )}
          </div>

          {/* Chart */}
          {series.length>0&&(
            <div style={S.card({marginBottom:14,padding:"16px 14px"})}>
              <div style={{fontWeight:700,marginBottom:4,color:T.text,fontSize:T.fs13}}>📊 Evolução em quantidade e valor</div>
              <div style={{fontSize:T.fs11,color:T.textMuted,marginBottom:14}}>
                🟦 Compras (acumulado) · 🟩 Igual · 🟪 Acima · 🟥 Abaixo do adquirido
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {series.map((d,i)=>{
                  const pct=maxQ>0?(d.qty/maxQ)*100:0;
                  const isPurch=d.type==="purchase";
                  const isValidated=d.validated!==false;
                  const bc=isPurch?T.accent:(d.qty===totalAcquired?T.green:d.qty>totalAcquired?T.purple:T.red);
                  const opacity=isPurch||isValidated?0.85:0.4;
                  return (
                    <div key={i}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,flex:1,paddingRight:8,overflow:"hidden"}}>
                          <span style={{fontSize:T.fs10,color:isPurch?T.warm:T.green,fontWeight:700,flexShrink:0}}>{isPurch?"💰":"📋"}</span>
                          <div style={{overflow:"hidden"}}>
                            <span style={{fontSize:T.fs11,color:T.text,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",display:"block"}}>{d.label}</span>
                            {d.purchGroups&&d.purchGroups.map((g,gi)=>(
                              <div key={gi}>
                                <div onClick={()=>setExpandPurch(p=>({...p,[gi]:!p[gi]}))} style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer",marginTop:2}}>
                                  <span style={{fontSize:T.fs10,color:g.color,fontWeight:700}}>{g.label}</span>
                                  <span style={{fontSize:T.fs10,color:g.color,fontFamily:T.fontMono}}>+{g.totalQty}</span>
                                  <span style={{fontSize:9,color:T.textMuted}}>{expandPurch[gi]?"▲":"▼"}</span>
                                </div>
                                {expandPurch[gi]&&g.items.map((p,pi)=>(
                                  <span key={pi} style={{fontSize:9,color:g.color,display:"block",paddingLeft:8}}>{fmtDate(p.date)} · +{p.qty}</span>
                                ))}
                              </div>
                            ))}
                            {d.date&&!d.purchGroups&&<span style={{color:T.textMuted,fontSize:T.fs10,display:"block"}}>{fmtDate(d.date)}</span>}
                          </div>
                        </div>
                        <div style={{textAlign:"right",flexShrink:0}}>
                          <div style={{fontFamily:T.fontMono,fontSize:T.fs12,fontWeight:700,color:bc}}>{d.qty} <span style={{fontSize:T.fs10,color:T.textMuted}}>{si.unit}</span></div>
                          {si.value>0&&<div style={{fontFamily:T.fontMono,fontSize:T.fs10,fontWeight:700,color:bc}}>{fmtCur(d.qty*Number(si.value))}</div>}
                        </div>
                      </div>
                      <div style={{position:"relative",height:14,background:T.surface,borderRadius:4,overflow:"hidden"}}>
                        <div style={{height:"100%",width:`${pct}%`,background:bc,borderRadius:4,transition:"width .5s",opacity}}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {series.length===0&&lastCounting&&<div style={{textAlign:"center",color:T.textMuted,padding:"20px 0",fontSize:T.fs13}}>Nenhuma compra registrada para este insumo. O gráfico de evolução aparecerá quando houver compras registradas.</div>}
          {series.length===0&&!lastCounting&&<div style={{textAlign:"center",color:T.textMuted,padding:"30px 0",fontSize:T.fs13}}>Nenhuma compra ou contagem validada registrada para este insumo.</div>}

          {/* Chart — show when series has data */}
          {series.length>0&&(
            <div style={S.card({padding:"14px"})}>
              <div style={{fontWeight:700,marginBottom:12,color:T.text,fontSize:T.fs13}}>📋 Tabela comparativa</div>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",minWidth:320}}>
                  <thead>
                    <tr style={{background:T.surface}}>
                      {["Tipo","Data","Quantidade / Valor","Diferença (vs Adquirido)"].map((h,i)=>(
                        <th key={i} style={{padding:"7px 8px",textAlign:"left",color:T.textMuted,fontWeight:600,fontSize:T.fs11,whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {series.map((d,i)=>{
                      // diff column: for countings = counted - totalAcquired; for purchases = show accumulative qty
                      const isPurch=d.type==="purchase";
                      const isValidated=d.validated!==false;
                      const rowDiff=isPurch?null:(d.qty-totalAcquired);
                      const diffColor=rowDiff===null?T.textMuted:rowDiff===0?T.green:rowDiff>0?T.purple:T.red;
                      const valQty=isPurch?null:Number(si.value||0)*d.qty;
                      const valAcq=Number(si.value||0)*totalAcquired;
                      return(
                        <tr key={i} style={{borderBottom:`1px solid ${T.border}`}}>
                          <td style={{padding:"7px 8px",fontSize:T.fs12,whiteSpace:"nowrap"}}>
                            <span style={{color:T.text,fontWeight:700}}>{isPurch?"💰 Compra":"📋 Contagem"}</span>
                            <div style={{fontSize:T.fs10,color:T.textMuted,marginTop:1}}>{isPurch?`Total acumulado: ${d.qty}`:`Contagem (${d.label})`}</div>
                          </td>
                          <td style={{padding:"7px 8px",color:T.textMuted,fontSize:T.fs12,whiteSpace:"nowrap"}}>{d.date?fmtDate(d.date):"—"}</td>
                          <td style={{padding:"7px 8px",fontSize:T.fs12}}>
                            <div style={{fontFamily:T.fontMono,color:isPurch?T.accent:diffColor,fontWeight:600}}>{d.qty} <span style={{fontSize:T.fs10,color:T.textMuted}}>{si.unit}</span></div>
                            {si.value>0&&<div style={{fontSize:T.fs10,color:T.textMuted,marginTop:1}}>{fmtCur(isPurch?Number(si.value)*d.qty:valQty)}</div>}
                          </td>
                          <td style={{padding:"7px 8px"}}>
                            {isPurch
                              ?<span style={{color:T.textMuted,fontSize:T.fs12}}>—</span>
                              :<span style={{color:diffColor,fontWeight:700,fontFamily:T.fontMono,fontSize:T.fs12}}>{rowDiff>0?"+":""}{rowDiff}</span>}
                            {si.value>0&&!isPurch&&rowDiff!==null&&<div style={{fontSize:T.fs10,color:diffColor,marginTop:1}}>{fmtCur(Number(si.value)*rowDiff)}</div>}
                          </td>
                        </tr>
                      );
                    })}
                    {/* Final row: total adquirido vs última contagem */}
                    {lastCounting&&(
                      <tr style={{background:T.surface,borderTop:`2px solid ${T.border}`}}>
                        <td colSpan={2} style={{padding:"7px 8px",fontSize:T.fs11,fontWeight:700,color:T.text}}>⚖️ Última contagem — Total adquirido</td>
                        <td style={{padding:"7px 8px",fontFamily:T.fontMono,fontSize:T.fs12,color:T.text}}>{lastCountedQty} - {totalAcquired} <span style={{fontSize:T.fs10,color:T.textMuted}}>{si.unit}</span></td>
                        <td style={{padding:"7px 8px"}}>
                          <span style={{color:diff>=0?T.green:T.red,fontWeight:700,fontFamily:T.fontMono,fontSize:T.fs12}}>{diff>0?"+":""}{diff}</span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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
        <button onClick={savePhone} style={S.btn(T.green)}>Salvar número</button>
      </div>
    </div>
  );
}

// ─── INSTRUCTIONS TAB ────────────────────────────────────────────────────────
function InstructionsTab() {
  const [sub,setSub]=useState("gerente");
  const [open,setOpen]=useState(null);
  const toggle=k=>setOpen(p=>p===k?null:k);
  const SUBS=[["gerente","🔐 Área do Gerente"],["contador","🧮 Área do Contador"]];

  const P=({children})=><p style={{fontSize:T.fs12,color:T.textMuted,lineHeight:1.75,margin:"0 0 10px 0"}}>{children}</p>;
  const Li=({children})=>(
    <div style={{display:"flex",gap:8,marginBottom:8,alignItems:"flex-start"}}>
      <span style={{color:T.accent,flexShrink:0,marginTop:3,fontSize:T.fs10}}>▸</span>
      <span style={{fontSize:T.fs12,color:T.textSub,lineHeight:1.75}}>{children}</span>
    </div>
  );
  const Tip=({text,color=T.yellow})=>(
    <div style={{background:color+"0d",border:`1px solid ${color}30`,borderRadius:8,padding:"9px 12px",fontSize:T.fs11,color,lineHeight:1.6,marginTop:8}}>{text}</div>
  );
  const HL=({children,color=T.accent})=><b style={{color,fontWeight:700}}>{children}</b>;

  const Acc=({id,title,color=T.accent,children})=>{
    const isOpen=open===id;
    return(
      <div style={{...S.card({marginBottom:8,padding:0,overflow:"hidden"})}}>
        <div onClick={()=>toggle(id)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"13px 16px",cursor:"pointer",background:isOpen?T.surface+"80":"transparent"}}>
          <span style={{fontWeight:700,fontSize:T.fs13,color}}>{title}</span>
          <span style={{fontSize:T.fs10,color:T.textMuted,marginLeft:8,fontFamily:T.fontMono}}>{isOpen?"▲":"▼"}</span>
        </div>
        {isOpen&&<div style={{padding:"12px 16px 16px",borderTop:`1px solid ${T.border}`}}>{children}</div>}
      </div>
    );
  };

  return(
    <div>
      <div style={{display:"flex",gap:2,marginBottom:14,background:T.surface,borderRadius:10,padding:3,border:`1px solid ${T.border}`}}>
        {SUBS.map(([k,l])=>(
          <button key={k} onClick={()=>{setSub(k);setOpen(null);}} style={{flex:1,background:sub===k?T.card:"transparent",border:sub===k?`1px solid ${T.border}`:"1px solid transparent",borderRadius:8,padding:"8px 4px",color:sub===k?T.text:T.textMuted,fontWeight:sub===k?700:500,fontSize:T.fs11,cursor:"pointer",fontFamily:T.fontBase}}>{l}</button>
        ))}
      </div>

      {sub==="gerente"&&(
        <div>
          <Acc id="dashboard" title="📊 Aba Dashboard" color={T.warm}>
            <P>Painel de controle do estoque em tempo real. Todos os cards são clicáveis e levam à tela correspondente. Sem dados, os cards exibem — ou zero.</P>
            <Li><HL>INSUMOS</HL> — insumos cadastrados (tipos), insumos contabilizados na última contagem aprovada e a diferença entre os dois.</Li>
            <Li><HL>QUANTIDADES</HL> — quantidade total adquirida (soma de todas as compras), quantidade total contabilizada (soma da última contagem aprovada) e a diferença.</Li>
            <Li><HL>STATUS DAS QUANTIDADES</HL> — insumos abaixo do mínimo, dentro da margem e acima do máximo, com base na última contagem aprovada.</Li>
            <Li><HL>CAPITAL</HL> — valor total adquirido (compras × valor unitário), valor total contabilizado (última contagem × valor unitário) e a diferença.</Li>
            <Li><HL>PROGRAMAÇÃO DE COMPRAS</HL> — insumos que precisam ser comprados, quantidade necessária total e valor total previsto. Fica zerado (verde) quando não há necessidade de compra.</Li>
            <Li><HL>STATUS DAS CONTAGENS</HL> — contagens registradas, contagens verificadas (aprovadas + reprovadas) e contagens pendentes de verificação.</Li>
            <Li>O botão <HL>Gráficos</HL> exibe 6 donuts organizados em 2 linhas de 3. O percentual no centro de cada gráfico representa a fatia principal. Sem dados o anel fica cinza com —.</Li>
            <Li>Cores: <HL color={T.red}>Vermelho</HL> = abaixo do esperado · <HL color={T.green}>Verde</HL> = ideal · <HL color={T.purple}>Roxo</HL> = acima do esperado.</Li>
          </Acc>

          <Acc id="insumos" title="📦 Aba Insumos" color={T.warm}>
            <P>Cadastre e gerencie cada tipo de item do estoque. Use a barra de pesquisa para localizar rapidamente.</P>
            <Li>Para cada insumo informe: <HL>nome</HL> (maiúsculas automáticas), <HL>unidade</HL> de medida, <HL>valor unitário</HL>, quantidade <HL color={T.warm}>mínima</HL> e quantidade <HL color={T.purple}>máxima</HL>. É possível anexar imagem ou PDF.</Li>
            <Li>O <HL color={T.warm}>mínimo</HL> é o nível de alerta — abaixo dele o insumo aparece em vermelho nas contagens e no dashboard. O <HL color={T.purple}>máximo</HL> é o nível ideal e serve como meta na programação de compras.</Li>
            <Li>O campo <HL>Última contagem</HL> mostra a quantidade contabilizada na última contagem. O campo <HL>Total adquirido</HL> soma todas as compras já registradas.</Li>
            <Li>O histórico de compras aparece no card, agrupado em <HL color={T.warm}>Entrada inicial</HL> (primeira compra) e <HL color={T.purple}>Reposição</HL> (compras seguintes). Toque no grupo para expandir os registros individuais.</Li>
            <Tip text="⚠️ Sem mínimo e máximo cadastrados, o sistema não gera sugestões de compra nem emite alertas no dashboard." color={T.yellow}/>
          </Acc>

          <Acc id="contagens" title="📋 Aba Contagens" color={T.warm}>
            <P>Dividida em três sub-abas: Histórico, Agendamentos e Evolução.</P>
            <Li><HL>Histórico</HL> — lista todas as contagens, da mais recente para a mais antiga. A mais recente recebe a tag ÚLTIMA CONTAGEM. Toque para ver o detalhamento: quantidade contabilizada, valor contabilizado, total adquirido, mínimo, máximo e status de cada insumo. Contagens pendentes mostram os botões Aprovar e Reprovar.</Li>
            <Li>Ao <HL color={T.green}>aprovar</HL>: os valores contabilizados tornam-se o estoque oficial, o agendamento é concluído e o sistema gera automaticamente sugestões de compra para os insumos abaixo do máximo. Ao <HL color={T.red}>reprovar</HL>: a contagem é marcada como reprovada e um agendamento de Recontagem é criado automaticamente para o mesmo dia, com prazo de 48 horas.</Li>
            <Li><HL>Agendamentos</HL> — crie agendamentos com nome e data. O contador só consegue realizar a contagem na data agendada ou em datas anteriores ainda não realizadas. Agendamentos concluídos somem da lista automaticamente.</Li>
            <Li><HL>Evolução</HL> — selecione <HL>TODOS</HL> para ver o resumo de todos os insumos com quantidade adquirida, contabilizada e diferença por insumo, além da totalização geral. Selecione um insumo específico para ver o gráfico comparativo de compras e contagens aprovadas.</Li>
            <Tip text="💡 Apenas contagens aprovadas alimentam a programação de compras, o dashboard e o histórico de evolução." color={T.accent}/>
          </Acc>

          <Acc id="compras" title="🛒 Aba Compras" color={T.warm}>
            <P>Dividida em Programação e Compras Realizadas. Use a barra de pesquisa em ambas.</P>
            <Li><HL>Programação</HL> — lista automática dos insumos que precisam ser comprados para atingir o máximo. O cálculo usa a última contagem aprovada somada às compras feitas após ela. Sem contagem aprovada, usa o total adquirido como base. Cada item mostra a quantidade necessária, o valor estimado, o tipo (<HL color={T.warm}>Entrada inicial</HL> ou <HL color={T.purple}>Reposição</HL>) e o botão Registrar compra.</Li>
            <Li>Ao registrar uma compra é possível informar: quantidade, <HL>valor unitário</HL> (se alterado, atualiza o cadastro do insumo a partir dessa compra), data, observação e nota fiscal. Compras podem ser editadas ou excluídas a qualquer momento.</Li>
            <Li><HL>Compras Realizadas</HL> — histórico completo agrupado por insumo e tipo. Toque no grupo para expandir. Selecione insumos para calcular o gasto total do grupo selecionado.</Li>
            <Tip text="💡 Se todos os insumos já atingiram o máximo, a aba Programação exibe uma mensagem informando que não há compras necessárias." color={T.accent}/>
          </Acc>

          <Acc id="seguranca" title="🔒 Aba Segurança" color={T.warm}>
            <P>Configurações de acesso e integração com WhatsApp.</P>
            <Li><HL>Alterar senha:</HL> informe a senha atual e a nova senha (mínimo 4 caracteres). A senha padrão inicial é <span style={{fontFamily:T.fontMono,color:T.accent,fontSize:T.fs12}}>Teresa</span>. Marque "Mostrar senhas" para visualizar o que está digitando.</Li>
            <Li><HL>Dica de senha:</HL> texto visível na tela de login ao tocar em "Esqueci minha senha".</Li>
            <Li><HL>WhatsApp:</HL> número para receber os relatórios de contagem. Formato: DDI + DDD + número sem espaços. Exemplo: <span style={{fontFamily:T.fontMono,color:T.accent,fontSize:T.fs12}}>5586999990000</span>. Quando configurado, aparece o botão "Enviar relatório para Teresa" na tela de conclusão e o botão de aviso na tela bloqueada.</Li>
          </Acc>
        </div>
      )}

      {sub==="contador"&&(
        <div>
          <Acc id="acesso" title="Como acessar o sistema?" color={T.accent}>
            <P>O contador acessa pela tela inicial tocando em Área do Contador — sem necessidade de senha. Teresa é a gerente responsável pelo sistema.</P>
            <Li>O acesso à contagem é liberado automaticamente apenas nas <HL>datas agendadas</HL> por Teresa. Se a data já passou e a contagem ainda não foi feita, ela também fica disponível (aparece como atrasada).</Li>
            <Li>Se não houver contagem agendada para hoje, a tela ficará <HL color={T.red}>bloqueada</HL> e exibirá a próxima data agendada. Use o botão <HL>Enviar mensagem para Teresa</HL> para avisá-la diretamente pelo WhatsApp com a mensagem já preenchida.</Li>
            <Tip text="O botão de WhatsApp só aparece se Teresa tiver configurado o número dela na Aba Segurança." color={T.green}/>
          </Acc>

          <Acc id="contar" title="Como realizar a contagem?" color={T.accent}>
            <P>A contagem é feita insumo por insumo. Nenhuma quantidade de referência é exibida — isso garante que a contagem seja independente e precisa.</P>
            <Li><HL>1. Inicie</HL> — toque em Iniciar. O nome e a unidade do primeiro insumo aparecem na tela.</Li>
            <Li><HL>2. Conte fisicamente</HL> — vá até o local, conte a quantidade presente e não estime.</Li>
            <Li><HL>3. Registre</HL> — use o teclado numérico para digitar a quantidade e toque em ✓ para confirmar.</Li>
            <Li><HL>4. Navegue</HL> — use as miniaturas no rodapé para ir a qualquer insumo já visitado. Toque em Editar para corrigir um valor confirmado.</Li>
            <Li><HL>5. Finalize</HL> — após confirmar todos os insumos, aparecem dois botões: <HL>Finalizar contagem</HL> (salva no sistema) e <HL>Enviar relatório para Teresa</HL> (abre o WhatsApp com a mensagem já preenchida). Ambos ficam visíveis ao mesmo tempo.</Li>
            <Li>O relatório enviado contém apenas o nome de cada insumo e a quantidade contabilizada — sem mínimo, máximo ou necessidade de compra. A mensagem solicita que Teresa acesse o sistema para verificar e aprovar a contagem, e informa o que ocorre em caso de aprovação ou reprovação.</Li>
            <Tip text="A contagem só é registrada no sistema após tocar em Finalizar contagem. Não feche o aplicativo antes disso." color={T.red}/>
          </Acc>

          <Acc id="aposenvio" title="O que acontece após o envio?" color={T.accent}>
            <P>Após finalizar, a contagem aparece no histórico com o status <HL color={T.yellow}>Pendente</HL> até que Teresa a analise no sistema.</P>
            <Li>Se Teresa <HL color={T.green}>aprovar</HL>: os valores contabilizados tornam-se o estoque oficial, o agendamento é concluído e o sistema gera automaticamente a programação de compras para os insumos que precisam de reposição.</Li>
            <Li>Se Teresa <HL color={T.red}>reprovar</HL>: um agendamento de <HL>Recontagem</HL> é criado automaticamente para o mesmo dia, com prazo de 48 horas. Teresa deverá sinalizar pelo WhatsApp se a recontagem será necessária para que você possa se programar.</Li>
            <Li>A recontagem funciona exatamente como uma contagem normal — aparecerá disponível na data agendada.</Li>
          </Acc>
        </div>
      )}
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props){super(props);this.state={error:null,info:null};}
  static getDerivedStateFromError(e){return{error:e};}
  componentDidCatch(e,info){this.setState({error:e,info});}
  render(){
    if(this.state.error){
      return(
        <div style={{minHeight:"100vh",background:"#080d14",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"Inter,sans-serif",color:"#f1f5f9"}}>
          <div style={{fontSize:48,marginBottom:16}}>⚠️</div>
          <div style={{fontSize:18,fontWeight:700,marginBottom:8,color:"#ef4444"}}>Erro na aplicação</div>
          <div style={{fontSize:13,color:"#94a3b8",marginBottom:24,textAlign:"center",maxWidth:320}}>{String(this.state.error?.message||this.state.error)}</div>
          <button onClick={()=>{this.setState({error:null,info:null});}} style={{background:"#3b82f6",border:"none",borderRadius:10,padding:"10px 20px",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>Tentar novamente</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return <ErrorBoundary><AppInner/></ErrorBoundary>;
}

function AppInner() {
  const data = useAppData();
  const [screen, setScreen] = useState("home");


  const goHome = useCallback(() => setScreen("home"), []);
  const goManager = useCallback(() => setScreen("manager"), []);
  const goManagerLogin = useCallback(() => setScreen("managerLogin"), []);
  const goCounter = useCallback(() => setScreen("counter"), []);

  // Show loader only on very first load before any data, never block navigation
  if (data.loading && screen === "home" && !data.items?.length && !data.countings?.length) {
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
          if (sd) data.setScheduledDates(prev => prev.map(s => s.id === sd.id ? {...s, done:true, linkedCountingId:counting.id} : s));
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
