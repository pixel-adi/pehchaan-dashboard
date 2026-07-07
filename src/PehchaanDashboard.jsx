import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import {
  RefreshCw, Lock, LogOut, TrendingUp, AlertCircle, Smartphone,
  CheckCircle2, IndianRupee, Activity, Mail, MapPin, Download,
  Eye, EyeOff,
} from "lucide-react";
import authBg from "./pehchaan_auth_bg.jpg";
import mandalaImg from "./mandala.png";

/*
  PEHCHAAN — Updates & Revenue Dashboard
  Sheet: https://docs.google.com/spreadsheets/d/1pwUb9tNTzqGO2utAzF-oLRNiCsENK596Mj-ff8etGzA
*/
const SHEET_ID  = "1pwUb9tNTzqGO2utAzF-oLRNiCsENK596Mj-ff8etGzA";
const SHEET_CSV_DEV = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;
const DATE_MIN  = "2025-11-25";
const ACCESS_CODE_HASHES = [
  "617802c3453aac841fbed3bc0269a48f3d44da26942e790a71e0c44a1f60a196", // "Pehchaan@2026"
  "0cf19586e65d6f546478af43de4981e83131ad9ae41c7d77841d2d3a907fba9d"  // "Pehchan@2026"
];
const RATE_PER_UPDATE  = 75;

// Cryptographic hash helper using Web Crypto API
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── design tokens (premium, low-fatigue, toned-down tricolor theme) ────────────
const C = {
  canvas : "#F4F6F9",
  surface: "#FFFFFF",
  border : "#EAECEF",
  ink    : "#1F2937",
  sub    : "#4B5563",
  muted  : "#9CA3AF",
  faint  : "#BAC2CC",
  navy   : "#374765", // Soft Slate Navy
  teal   : "#0D7C86",
  // Soft, sophisticated tricolor accent palette (low-saturation)
  mobile : "#E77E66", // Sophisticated terracotta saffron
  address: "#4A8F70", // Soft slate forest green
  hof    : "#D39E43", // Muted warm amber gold
  email  : "#7B84E2", // Soft slate indigo blue
  total  : "#374765", // Soft slate navy
  android: "#4A8F70", // Muted sage green
  ios    : "#5E6E85", // Cool blue-grey
  revenue: "#E77E66", // Burnt saffron coral
  // selection highlights
  selBg  : "#F4F6FC",
  selBdr : "#374765",
};

// Font Pairings:
// - HEAD: Plus Jakarta Sans (premium display/headings)
// - BODY: Inter (clean UI text)
// - MONO: JetBrains Mono (clean numbers/dates)
const HEAD  = "'Plus Jakarta Sans', system-ui, sans-serif";
const BODY  = "'Inter', system-ui, sans-serif";
const MONO  = "'JetBrains Mono', ui-monospace, monospace";

const SHADOW = "0 1px 3px rgba(0,0,0,.04), 0 0 1px rgba(0,0,0,.04)";
const SHADOW_SEL = "0 0 0 2.5px rgba(55,71,101,.18), 0 1px 3px rgba(0,0,0,.04)";
const RADIUS = 16;

// ── helpers ───────────────────────────────────────────────────────────────────
const nfIN = n => (n == null || isNaN(n) ? "—" : Math.round(n).toLocaleString("en-IN"));
const toCr = n => (n / 1e7).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const iso = s => {
  if (!s) return null;
  s = String(s).trim();
  const a = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (a) return `${a[1]}-${a[2]}-${a[3]}`;
  const b = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (b) return `${b[3]}-${b[1].padStart(2,"0")}-${b[2].padStart(2,"0")}`;
  const p = new Date(s); return isNaN(p) ? null : p.toISOString().slice(0,10);
};
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const monthLabel = y => { const [yr,m] = y.split("-"); return MONTHS[+m-1] + " " + yr; };
const dayLabel   = y => { const [,m,d] = y.split("-"); return `${+d} ${MONTHS[+m-1]}`; };
const fmtK = v => v >= 1e5 ? (v/1e5).toFixed(1)+"L" : v >= 1e3 ? (v/1e3).toFixed(0)+"k" : String(v);

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const src = text.replace(/\r\n/g,"\n").replace(/\r/g,"\n");
  const rows = []; let row = [], field = "", inQ = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQ) { if (c==='"'&&src[i+1]==='"'){field+='"';i++;} else if (c==='"'){inQ=false;} else field+=c; continue; }
    if (c==='"'){inQ=true;continue;}
    if (c===','){row.push(field);field="";continue;}
    if (c==='\n'){row.push(field);rows.push(row);row=[];field="";continue;}
    field+=c;
  }
  if (field||row.length){row.push(field);rows.push(row);}
  return rows;
}
function parseSheetCSV(csv) {
  const all = parseCSV(csv); if (!all.length) throw new Error("Empty response");
  let hi = -1, cols = {};
  for (let i = 0; i < Math.min(5,all.length); i++) {
    const h = all[i].map(c => c.trim().toLowerCase().replace(/[^a-z0-9]/g,""));
    if (h.findIndex(x => x.includes("year")||x==="date"||x.includes("yearmonth")) === -1) continue;
    hi = i;
    h.forEach((x,j) => {
      if (x.includes("yearmonth")||x==="date"){cols.date??=j;}
      else if (x==="week"||x.startsWith("week")){cols.week??=j;}
      else if (x.includes("hof")){cols.hof??=j;}
      else if (x.includes("mobile")){cols.mobile??=j;}
      else if (x.includes("email")){cols.email??=j;}
      else if (x.includes("address")){cols.address??=j;}
      else if (x.includes("ios")){cols.ios??=j;}
      else if (x.includes("android")){cols.android??=j;}
    });
    if (cols.date != null) break;
  }
  if (hi === -1 || cols.date == null) throw new Error("Cannot find date column in sheet");
  if (cols.mobile == null) throw new Error("Cannot find Mobile column in sheet");
  const toN = v => { const x = parseFloat(String(v??"").replace(/,/g,"")); return isNaN(x)?0:x; };
  const g   = (row,idx) => idx != null ? toN(row[idx]) : 0;
  const out = [];
  for (let r = hi+1; r < all.length; r++) {
    const row = all[r]; if (!row||row.length<2) continue;
    const raw = row[cols.date]?.trim(); if (!raw) continue;
    const date = iso(raw); if (!date) continue;
    out.push({ date,
      week: cols.week != null ? String(row[cols.week]?.trim()??"") : "",
      mobile: g(row,cols.mobile), address: g(row,cols.address), hof: g(row,cols.hof),
      emailSheet: g(row,cols.email), ios: g(row,cols.ios), android: g(row,cols.android),
    });
  }
  if (!out.length) throw new Error("No data rows found");
  return out.sort((a,b) => a.date.localeCompare(b.date));
}

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Spark({ data, color, width = 54, height = 20 }) {
  if (!data || data.length < 2) return <div style={{width,height}}/>;
  return (
    <ResponsiveContainer width={width} height={height}>
      <LineChart data={data} margin={{top:2,right:1,bottom:2,left:1}}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2}
          dot={false} isAnimationActive={false}/>
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Segmented control ─────────────────────────────────────────────────────────
function Seg({ options, value, onChange }) {
  return (
    <div style={{display:"inline-flex",background:"#EEF1F6",borderRadius:8,padding:3,gap:2}}>
      {options.map(o => (
        <button key={o.v} onClick={() => onChange(o.v)} style={{
          border:"none", cursor:"pointer", borderRadius:6,
          padding:"5px 12px", fontSize:14, fontFamily:BODY, fontWeight:value===o.v?600:500,
          color:value===o.v?C.ink:C.sub,
          background:value===o.v?"#fff":"transparent",
          boxShadow:value===o.v?"0 1px 3px rgba(0,0,0,.08)":"none",
          transition:"all .15s",
        }}>{o.l}</button>
      ))}
    </div>
  );
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ cardKey, label, icon: Icon, color, value, badge, todayLabel, todayVal, rows1, sparkData, selected, onClick, period, preset }) {
  let bgStyle = selected ? C.selBg : C.surface;
  let borderStyle = `1.5px solid ${selected ? C.selBdr : C.border}`;
  let shadowStyle = selected ? SHADOW_SEL : SHADOW;

  if (cardKey === "revenue") {
    bgStyle = selected 
      ? `linear-gradient(135deg, #FBECE8 0%, #FFF5F2 100%)`
      : `linear-gradient(135deg, #FDF7F5 0%, #FFFFFF 100%)`;
    borderStyle = `1.5px solid ${selected ? C.revenue : "#F5DED9"}`;
    shadowStyle = selected ? `0 4px 14px rgba(231, 126, 102, 0.15)` : SHADOW;
  } else if (cardKey === "downloads") {
    bgStyle = selected 
      ? `linear-gradient(135deg, #EBF3EF 0%, #F5FAF7 100%)`
      : `linear-gradient(135deg, #F4F8F6 0%, #FFFFFF 100%)`;
    borderStyle = `1.5px solid ${selected ? C.android : "#DCE7E2"}`;
    shadowStyle = selected ? `0 4px 14px rgba(74, 143, 112, 0.15)` : SHADOW;
  }

  return (
    <div onClick={onClick} style={{
      background: bgStyle,
      border: borderStyle,
      borderRadius: RADIUS, padding: "10px 16px",
      cursor: "pointer", userSelect: "none",
      boxShadow: shadowStyle,
      transition: "box-shadow .18s, border-color .18s, background .18s",
      display: "flex", flexDirection: "column", gap: 4,
      height: "100%", boxSizing: "border-box"
    }}>
      {/* Top Section */}
      <div style={{display:"flex",flexDirection:"column",gap:8,flexShrink:0,minWidth:0}}>
        {/* Title + Badge Stack */}
        <div style={{
          display:"flex",
          alignItems: badge != null ? "flex-start" : "center",
          gap:8,
          minWidth:0
        }}>
          <div style={{
            width:32,
            height:32,
            borderRadius:8,
            background:`${color}12`,
            display:"flex",
            alignItems:"center",
            justifyContent:"center",
            flexShrink:0,
            marginTop: badge != null ? 2 : 0
          }}>
            <Icon size={16} color={color} strokeWidth={2.2}/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:2,minWidth:0,flex:1}}>
            <span style={{fontSize:13,fontWeight:600,color:C.sub,fontFamily:BODY,letterSpacing:".01em",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{label}</span>
            {badge != null && (
              <div style={{display:"flex"}}>
                <span style={{
                  fontSize:11,fontWeight:600,fontFamily:BODY,
                  color: badge >= 0 ? "#2B8C5B" : "#C2410C",
                  background: badge >= 0 ? "#F0FDF4" : "#FFF7ED",
                  border: `1px solid ${badge >= 0 ? "#D1FAE5" : "#FFEDD5"}`,
                  borderRadius:5, padding:"0px 5px", flexShrink:0, whiteSpace:"nowrap"
                }}>{badge >= 0 ? "▲" : "▼"} {Math.abs(badge).toFixed(1)}%</span>
              </div>
            )}
          </div>
        </div>

        {/* Main Value + Sparkline + Today Chip */}
        <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:10}}>
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
            <div style={{fontFamily:HEAD,fontSize:26,fontWeight:700,color:C.ink,lineHeight:1,fontVariantNumeric:"tabular-nums",letterSpacing:"-.03em",whiteSpace:"nowrap"}}>{value}</div>
            <div style={{flexShrink:0,paddingTop:2}}>
              <Spark data={sparkData} color={color}/>
            </div>
          </div>
          {todayLabel && (
            <div style={{
              display:"flex",flexDirection:"column",
              background:"#F0F9FF",border:"1px solid #E0F2FE",
              borderRadius:5,padding:"5px 10px",width:"100%",boxSizing:"border-box",gap:2
            }}>
              <span style={{
                fontSize:10,fontFamily:BODY,color:"#0284C7",
                fontWeight:600,textTransform:"uppercase",letterSpacing:".04em",lineHeight:1
              }}>
                {(preset === "today") ? todayLabel : "Selected Range"}
              </span>
              <div style={{
                display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:8
              }}>
                <span style={{fontSize:12,fontWeight:700,color:C.sub,fontFamily:BODY,lineHeight:1}}>
                  {(preset === "today") ? todayVal : (
                    preset === "all" ? "All time" :
                    preset === "7" ? "Last Week" :
                    preset === "30" ? "1 Month" :
                    preset === "90" ? "3 Months" :
                    preset === "cumulative" ? "Cumulative" : "Custom"
                  )}
                </span>
                {!(preset === "today") && period && (
                  <span style={{fontSize:11,color:"#64748B",fontFamily:BODY,fontWeight:400,lineHeight:1}}>
                    {period}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Flex spacer to push breakdown to bottom */}
      <div style={{flex:1}}/>

      {/* Breakdown Rows (Bottom aligned) */}
      {rows1 && rows1.length > 0 && (
        <div style={{borderTop:`1px solid ${C.border}`,paddingTop:8,display:"flex",flexDirection:"column",gap:6,flexShrink:0}}>
          {rows1.map((r,i) => (
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
              <span style={{fontSize:13,color:C.muted,fontFamily:BODY,fontWeight:400,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.label}</span>
              <span style={{fontSize:13,fontWeight:600,color:C.sub,fontFamily:BODY,whiteSpace:"nowrap",flexShrink:0}}>{r.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Combined Updates Card ───────────────────────────────────────────────────
function CombinedUpdatesCard({ kpi, latest, pct, spark, selCards, toggleCard, periodLabel, preset }) {
  const isTotalSelected = selCards.has("total");

  const renderSubCard = (subKey, label, icon, color, value, badge, sparkData, todayVal, rows) => {
    const isSelected = selCards.has(subKey);
    const IconComponent = icon;

    return (
      <div 
        onClick={(e) => {
          e.stopPropagation();
          toggleCard(subKey);
        }}
        style={{
          background: isSelected ? `${color}08` : "#FCFDFE",
          border: `1.5px solid ${isSelected ? color : C.border}`,
          borderRadius: 12,
          padding: "14px 12px",
          cursor: "pointer",
          userSelect: "none",
          boxShadow: isSelected ? `0 4px 12px ${color}15` : "none",
          transition: "all .18s",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          minWidth: 0,
          height: "100%"
        }}
      >
        {/* Header Block (Consistent Layout, A Step Bigger) */}
        <div style={{display: "flex", alignItems: "flex-start", gap: 8}}>
          <div style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            background: `${color}12`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            marginTop: 1
          }}>
            <IconComponent size={14} color={color} strokeWidth={2.2}/>
          </div>
          <div style={{display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1}}>
            <span style={{fontSize: 13, fontWeight: 700, color: C.sub, fontFamily: BODY, lineHeight: 1.2}}>{label}</span>
            {badge != null && (
              <div style={{display: "flex"}}>
                <span style={{
                  fontSize: 10, fontWeight: 600, fontFamily: BODY,
                  color: badge >= 0 ? "#2B8C5B" : "#C2410C",
                  background: badge >= 0 ? "#F0FDF4" : "#FFF7ED",
                  border: `1px solid ${badge >= 0 ? "#D1FAE5" : "#FFEDD5"}`,
                  borderRadius: 4, padding: "0px 4px", flexShrink: 0, whiteSpace: "nowrap"
                }}>{badge >= 0 ? "▲" : "▼"} {Math.abs(badge).toFixed(1)}%</span>
              </div>
            )}
          </div>
        </div>

        {/* Sparkline above the data (wider and taller) */}
        <div style={{height: 24, width: "100%", position: "relative", overflow: "hidden", flexShrink: 0}}>
          <Spark data={sparkData} color={color} width="100%" height={24} />
        </div>

        {/* Data: Value & Range/Today */}
        <div style={{display: "flex", flexDirection: "column", gap: 2}}>
          <span style={{fontFamily: HEAD, fontSize: 20, fontWeight: 800, color: C.ink, lineHeight: 1, whiteSpace: "nowrap"}}>{value}</span>
          {preset === "today" ? (
            <span style={{fontSize: 10, color: C.muted, fontFamily: BODY, whiteSpace: "nowrap"}}>Today: <strong style={{color: C.sub}}>{todayVal}</strong></span>
          ) : (
            <span style={{fontSize: 10, color: C.muted, fontFamily: BODY, whiteSpace: "nowrap"}}>
              {preset === "all" ? "All time" : preset === "7" ? "Last Week" : preset === "30" ? "1 Month" : preset === "90" ? "3 Months" : preset === "cumulative" ? "Cumulative" : "Custom"}
            </span>
          )}
        </div>

        {/* Flex spacer to push bifurcations to bottom */}
        <div style={{flex: 1}} />

        {/* Breakdown rows (Bifurcations, Bigger Text Size) */}
        {rows && rows.length > 0 && (
          <div style={{borderTop: `1px solid ${C.border}`, paddingTop: 8, display: "flex", flexDirection: "column", gap: 5}}>
            {rows.map((r, idx) => (
              <div key={idx} style={{display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6}}>
                <span style={{fontSize: 12, color: C.muted, fontFamily: BODY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>{r.label}</span>
                <span style={{fontSize: 12, fontWeight: 600, color: C.sub, fontFamily: BODY, whiteSpace: "nowrap"}}>{r.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{
      background: C.surface,
      border: `1.5px solid ${isTotalSelected ? C.selBdr : C.border}`,
      borderRadius: RADIUS,
      padding: "10px 16px",
      display: "flex",
      flexDirection: "column",
      gap: 12,
      boxShadow: isTotalSelected ? SHADOW_SEL : SHADOW,
      transition: "box-shadow .18s, border-color .18s, background .18s",
      userSelect: "none",
      height: "100%"
    }}>
      {/* 1. Main KPI Row (Total Updates) - Styled exactly like KpiCard */}
      <div 
        onClick={() => toggleCard("total")}
        style={{
          display: "flex",
          flexDirection: "column",
          cursor: "pointer",
          transition: "all .15s",
          gap: 8,
          paddingTop: 4
        }}
      >
        {/* Title + Badge Stack */}
        <div style={{display: "flex", alignItems: pct("total") != null ? "flex-start" : "center", gap: 8, minWidth: 0}}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: `${C.total}12`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            marginTop: pct("total") != null ? 2 : 0
          }}>
            <Activity size={16} color={C.total} strokeWidth={2.2}/>
          </div>
          <div style={{display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1}}>
            <span style={{fontSize: 13, fontWeight: 600, color: C.sub, fontFamily: BODY, letterSpacing: ".01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>Total Updates</span>
            {pct("total") != null && (
              <div style={{display: "flex"}}>
                <span style={{
                  fontSize: 11, fontWeight: 600, fontFamily: BODY,
                  color: pct("total") >= 0 ? "#2B8C5B" : "#C2410C",
                  background: pct("total") >= 0 ? "#F0FDF4" : "#FFF7ED",
                  border: `1px solid ${pct("total") >= 0 ? "#D1FAE5" : "#FFEDD5"}`,
                  borderRadius: 5, padding: "0px 5px", flexShrink: 0, whiteSpace: "nowrap"
                }}>{pct("total") >= 0 ? "▲" : "▼"} {Math.abs(pct("total")).toFixed(1)}%</span>
              </div>
            )}
          </div>
        </div>

        {/* Main Value + Sparkline + Today Chip */}
        <div style={{display: "flex", flexDirection: "column", gap: 8, marginTop: 10}}>
          <div style={{display: "flex", alignItems: "flex-start", justifySpacing: "space-between", gap: 12}}>
            <div style={{fontFamily: HEAD, fontSize: 26, fontWeight: 700, color: C.ink, lineHeight: 1, fontVariantNumeric: "tabular-nums", letterSpacing: "-.03em", whiteSpace: "nowrap", flex: 1}}>{nfIN(kpi.total)}</div>
            <div style={{flexShrink: 0, paddingTop: 2}}>
              <Spark data={spark("total")} color={C.total} />
            </div>
          </div>
          
          {/* Today / Range Chip */}
          <div style={{
            display: "flex", flexDirection: "column",
            background: "#F0F9FF", border: "1px solid #E0F2FE",
            borderRadius: 5, padding: "5px 10px", width: "100%", boxSizing: "border-box", gap: 2
          }}>
            <span style={{
              fontSize: 10, fontFamily: BODY, color: "#0284C7",
              fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", lineHeight: 1
            }}>
              {preset === "today" ? "Today" : "Selected Range"}
            </span>
            <div style={{display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8}}>
              <span style={{fontSize: 12, fontWeight: 700, color: C.sub, fontFamily: BODY, lineHeight: 1}}>
                {preset === "today" ? (latest ? nfIN(latest.total) : "—") : (
                  preset === "all" ? "All time" :
                  preset === "7" ? "Last Week" :
                  preset === "30" ? "1 Month" :
                  preset === "90" ? "3 Months" :
                  preset === "cumulative" ? "Cumulative" : "Custom"
                )}
              </span>
              {!(preset === "today") && periodLabel && (
                <span style={{fontSize: 11, color: "#64748B", fontFamily: BODY, fontWeight: 400, lineHeight: 1}}>
                  {periodLabel}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sub-cards Container in 3 Columns */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: 10,
        flex: 1,
        minHeight: 0
      }}>
        {/* Mobile */}
        {renderSubCard(
          "mobile", 
          "Mobile Updates", 
          Smartphone, 
          C.mobile, 
          nfIN(kpi.mobile), 
          pct("mobile"), 
          spark("mobile"), 
          latest ? nfIN(latest.mobile) : "—",
          [{label: "% of total", value: kpi.total ? `${(kpi.mobile/kpi.total*100).toFixed(1)}%` : "—"}]
        )}

        {/* Address */}
        {renderSubCard(
          "address", 
          "Address Updates", 
          MapPin, 
          C.address, 
          nfIN(kpi.address + kpi.hof), 
          pct("address"), 
          spark("address").map((d,i)=>({v:d.v+(spark("hof")[i]?.v||0)})), 
          latest ? nfIN((latest.address||0)+(latest.hof||0)) : "—",
          [
            {label: "Regular", value: nfIN(kpi.address)},
            {label: "HOF", value: nfIN(kpi.hof)}
          ]
        )}

        {/* Email */}
        {renderSubCard(
          "email", 
          "Email Updates", 
          Mail, 
          C.email, 
          nfIN(kpi.email), 
          pct("email"), 
          spark("email"), 
          latest ? nfIN(latest.email) : "—",
          [
            {label: "% of total", value: kpi.total ? `${(kpi.email/kpi.total*100).toFixed(1)}%` : "—"},
            {label: "Excl. from revenue", value: "Yes"}
          ]
        )}
      </div>
    </div>
  );
}

// ── card→line mapping ─────────────────────────────────────────────────────────
const CARD_LINES = {
  revenue:   ["mobile","address","hof"],
  downloads: [],
  total:     ["total"],
  mobile:    ["mobile"],
  address:   ["address","hof"],
  email:     ["email"],
};

// ── custom tooltip ────────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label, isRevenue }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 16px",fontFamily:BODY,boxShadow:"0 4px 16px rgba(0,0,0,.08)"}}>
      <div style={{fontSize:14,fontWeight:600,color:C.muted,marginBottom:8,fontFamily:MONO}}>{label}</div>
      {payload.map(p=>(
        <div key={p.dataKey} style={{display:"flex",alignItems:"center",gap:8,fontSize:14,color:C.sub,fontWeight:500,marginBottom:4}}>
          <span style={{width:8,height:8,borderRadius:"50%",background:p.stroke,flexShrink:0}}/>
          <span style={{color:C.muted}}>{p.name}</span>
          <span style={{marginLeft:"auto",fontWeight:700,color:C.ink,paddingLeft:12}}>
            {isRevenue 
              ? `₹${Math.round(p.value * RATE_PER_UPDATE).toLocaleString("en-IN")}` 
              : nfIN(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

// ── main ──────────────────────────────────────────────────────────────────────
export default function PehchaanDashboard() {
  const [rows,     setRows]     = useState(null);
  const [lastUpd,  setLastUpd]  = useState(null);
  const [error,    setError]    = useState("");
  const [busy,     setBusy]     = useState(false);
  const [trend,    setTrend]    = useState("daily");
  const [gran,     setGran]     = useState("daily");
  const [from,     setFrom]     = useState("");
  const [to,       setTo]       = useState("");
  const [preset,   setPresetState] = useState("all");
  const [selCards, setSelCards] = useState(new Set());
  const [gate,     setGate]     = useState(ACCESS_CODE_HASHES ? false : true);
  const [pw,       setPw]       = useState("");
  const [pwErr,    setPwErr]    = useState(false);
  const [showPw,   setShowPw]   = useState(false);

  const tryUnlock = async () => {
    const hash = await sha256(pw);
    if (ACCESS_CODE_HASHES.includes(hash)) {
      setGate(true);
      setPwErr(false);
    } else {
      setPwErr(true);
    }
  };
  const logout = () => { setGate(false); setPw(""); };

  const fetchSheet = useCallback(async (bust=false) => {
    setBusy(true); setError("");
    try {
      let url = "/api/data";
      let options = {
        headers: { "x-passcode": pw },
        cache: bust ? "reload" : "default"
      };

      if (import.meta.env.DEV) {
        url = bust ? `${SHEET_CSV_DEV}&_=${Date.now()}` : SHEET_CSV_DEV;
        options = { cache: bust ? "reload" : "default" };
      } else if (bust) {
        url = `/api/data?bust=true`;
      }

      const res = await fetch(url, options);
      if (res.status === 401) throw new Error("Incorrect or expired passcode");
      if (!res.ok) throw new Error(`HTTP ${res.status} — failed to load data`);
      const parsed = parseSheetCSV(await res.text());
      setRows(parsed); setLastUpd(new Date());
      const max = parsed[parsed.length-1].date;
      
      setFrom(f => f || DATE_MIN);
      setTo(t => t || max);
    } catch(e) { setError(e.message||"Could not fetch sheet"); }
    finally { setBusy(false); }
  }, [pw]);
  useEffect(() => { if (gate) fetchSheet(false); }, [gate, fetchSheet]);

  const bounds = useMemo(() => rows ? { min:DATE_MIN, max:rows[rows.length-1].date } : null, [rows]);

  const inRange = useMemo(() => {
    if (!rows) return [];
    return rows.filter(r => (!from||r.date>=from)&&(!to||r.date<=to)).map(r => {
      const email = r.emailSheet, base = r.mobile+r.address+r.hof;
      return { ...r, email, total:base+email, base, android:r.android||0, ios:r.ios||0 };
    });
  }, [rows, from, to]);

  const periodLabel = useMemo(() => {
    if (preset === "all" || !from || !to) return "All time";
    const fmt = dStr => {
      const d = new Date(dStr + "T00:00:00");
      return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    };
    return `${fmt(from)} – ${fmt(to)}`;
  }, [from, to, preset]);

  const buckets = useMemo(() => {
    if (!inRange.length) return [];
    const keyOf = r => gran==="monthly" ? r.date.slice(0,7) : gran==="weekly" ? (r.week||r.date.slice(0,7)) : r.date;
    const lblOf = (r,k) => gran==="monthly" ? monthLabel(r.date.slice(0,7)+"-01") : gran==="weekly" ? (r.week||k) : dayLabel(r.date);
    const m = new Map();
    for (const r of inRange) {
      const k = keyOf(r);
      if (!m.has(k)) m.set(k, {key:k,label:lblOf(r,k),first:r.date,mobile:0,address:0,hof:0,email:0,total:0,base:0,android:0,ios:0});
      const b = m.get(k);
      for (const f of ["mobile","address","hof","email","total","base","android","ios"]) b[f]+=r[f];
      if (r.date < b.first) b.first = r.date;
    }
    return [...m.values()].sort((a,b) => a.first.localeCompare(b.first));
  }, [inRange, gran]);

  const effectiveLines = useMemo(() => {
    if (selCards.size===0) return {mobile:true,address:true,hof:true,email:true,total:true};
    const keys = new Set();
    for (const ck of selCards) for (const lk of (CARD_LINES[ck]||[])) keys.add(lk);
    return {mobile:keys.has("mobile"),address:keys.has("address"),hof:keys.has("hof"),email:keys.has("email"),total:keys.has("total")};
  }, [selCards]);

  const showDl = selCards.size===0 || selCards.has("downloads");

  const mkChartData = (run, buckets, trend, fields) =>
    buckets.map(b => {
      if (trend==="cumulative") { for (const k of fields) run[k]+=b[k]; return {label:b.label,...run}; }
      return Object.fromEntries([["label",b.label],...fields.map(f=>[f,b[f]])]);
    });

  const chartData = useMemo(() => {
    const run = {mobile:0,address:0,hof:0,email:0,total:0};
    return mkChartData(run, buckets, trend, ["mobile","address","hof","email","total"]);
  }, [buckets, trend]);

  const dlData = useMemo(() => {
    let ra=0, ri=0;
    return buckets.map(b => {
      if (trend==="cumulative"){ra+=b.android;ri+=b.ios;return{label:b.label,android:ra,ios:ri};}
      return {label:b.label,android:b.android,ios:b.ios};
    });
  }, [buckets, trend]);
  const hasDl = useMemo(() => buckets.some(b=>b.android||b.ios), [buckets]);

  const kpi = useMemo(() => {
    if (!inRange || !inRange.length) return {total:0,mobile:0,address:0,hof:0,email:0,base:0,revenue:0,android:0,ios:0};
    const s = f => inRange.reduce((a,r)=>a+(r[f]||0),0);
    const mobile=s("mobile"),address=s("address"),hof=s("hof"),email=s("email");
    const base = mobile+address+hof;
    return {total:base+email,mobile,address,hof,email,base,revenue:base*RATE_PER_UPDATE,android:s("android"),ios:s("ios")};
  }, [inRange]);

  const pct = useCallback(field => {
    if (inRange.length < 4) return null;
    const n = Math.min(7, Math.floor(inRange.length/2));
    const recent = inRange.slice(-n).reduce((a,r)=>a+(r[field]??0),0);
    const prior  = inRange.slice(-2*n,-n).reduce((a,r)=>a+(r[field]??0),0);
    if (prior===0) return null;
    return +((recent-prior)/prior*100).toFixed(1);
  }, [inRange]);

  const spark = useCallback(field => inRange.slice(-20).map(r=>({v:r[field]??0})), [inRange]);

  const latest = inRange[inRange.length-1];

  const setPreset = p => {
    if (!bounds) return;
    setPresetState(p);
    const max = new Date(bounds.max+"T00:00:00");
    const back = days => { const d=new Date(max); d.setDate(d.getDate()-days+1); const lo=d.toISOString().slice(0,10); return lo<DATE_MIN?DATE_MIN:lo; };
    if (p === "today") {
      setTrend("daily");
      setFrom(bounds.max);
      setTo(bounds.max);
    } else if (p === "7") {
      setTrend("daily");
      setFrom(back(7));
      setTo(bounds.max);
    } else if (p === "30") {
      setTrend("daily");
      setFrom(back(30));
      setTo(bounds.max);
    } else if (p === "90") {
      setTrend("daily");
      setFrom(back(90));
      setTo(bounds.max);
    } else if (p === "cumulative") {
      setTrend("cumulative");
      setFrom(DATE_MIN);
      setTo(bounds.max);
    } else {
      setTrend("daily");
      setFrom(DATE_MIN);
      setTo(bounds.max);
    }
  };

  const toggleCard = ck => setSelCards(prev => { const n=new Set(prev); n.has(ck)?n.delete(ck):n.add(ck); return n; });

  const isFilterChanged = preset !== "all" || gran !== "daily" || selCards.size > 0 || from !== DATE_MIN || to !== bounds?.max;

  const handleResetFilters = () => {
    setPreset("all");
    setGran("daily");
    setSelCards(new Set());
  };

  const fmtRefresh = d => d?.toLocaleString("en-IN",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});

  const lineDef = [
    {key:"mobile", name:"Mob. No. Updates",  color:C.mobile },
    {key:"address",name:"Address (Regular)",color:C.address},
    {key:"hof",    name:"Address (HOF)",    color:C.hof    },
    {key:"email",  name:"Email",            color:C.email  },
    {key:"total",  name:"Total",            color:C.total  },
  ];

  const activeTitle = selCards.size===0 ? "All metrics" :
    [...selCards].map(k=>({revenue:"Revenue",downloads:"Downloads",total:"Total Updates",mobile:"Mob. No. Updates",address:"Address",email:"Email"}[k])).join(" · ");

  // ── gate ──────────────────────────────────────────────────────────────────
  // ── gate ──────────────────────────────────────────────────────────────────
  if (ACCESS_CODE_HASHES && !gate) return (
    <div className="login-wrap">
      {/* LEFT SPLIT (2/3rds width) */}
      <div className="login-visual" style={{ background: `url(${authBg}) center/cover no-repeat` }}>
        {/* Dark overlay to ensure text readability */}
        <div style={{position:"absolute", top:0, left:0, right:0, bottom:0, background:"rgba(17,24,39,0.3)", zIndex:1}}/>

        {/* Top Text Content */}
        <div style={{position:"relative", zIndex:2, display:"flex", flexDirection:"column", gap:10}}>
          <h1 style={{fontSize:38, fontWeight:800, color:"#FFFFFF", fontFamily:HEAD, margin:0, lineHeight:1.15, letterSpacing:"-.03em"}}>
            Aadhaar App Dashboard
          </h1>
          <p style={{fontSize:18, fontWeight:500, color:"#E5E7EB", margin:0, fontFamily:BODY, opacity:0.9, lineHeight:1.4}}>
            Real-time updates, metrics, and revenue monitoring.
          </p>
        </div>

        {/* Slider indicators */}
        <div style={{position:"relative", zIndex:2, display:"flex", gap:6, alignItems:"center"}}>
          <span style={{width:28, height:6, borderRadius:4, background:"#FFFFFF"}}/>
          <span style={{width:6, height:6, borderRadius:"50%", background:"rgba(255,255,255,0.4)"}}/>
          <span style={{width:6, height:6, borderRadius:"50%", background:"rgba(255,255,255,0.4)"}}/>
        </div>
      </div>

      {/* RIGHT SPLIT (1/3rd width, centered passcode form) */}
      <div className="login-form-pane" style={{overflow:"hidden"}}>
        {/* Centered Passcode Box */}
        <div style={{maxWidth:400, width:"100%", margin:"0 auto", display:"flex", flexDirection:"column", gap:28, position:"relative", zIndex:2}}>
          <div>
            {/* Aadhaar Logo just above Welcome Back! */}
            <div style={{marginBottom:16}}>
              <img src="https://upload.wikimedia.org/wikipedia/commons/e/ee/Aadhaar.svg"
                alt="Aadhaar logo" style={{width:160, height:160, objectFit:"contain", marginLeft:-24}}/>
            </div>
            <h2 style={{fontSize:32, fontWeight:700, color:C.ink, margin:0, fontFamily:HEAD, letterSpacing:"-.03em"}}>
              Welcome Back!
            </h2>
            <p style={{fontSize:14, color:C.muted, margin:"6px 0 0", fontFamily:BODY}}>
              Enter passcode to unlock Pehchaan Dashboard
            </p>
          </div>

          {/* Form */}
          <div style={{display:"flex", flexDirection:"column", gap:18}}>
            {/* Passcode Input */}
            <div style={{display:"flex", flexDirection:"column", gap:8}}>
              <span style={{fontSize:14, fontWeight:600, color:C.sub, fontFamily:BODY}}>Passcode</span>
              <div style={{position:"relative", display:"flex", alignItems:"center"}}>
                <input type={showPw ? "text" : "password"} value={pw} autoFocus
                  onChange={e=>{setPw(e.target.value);setPwErr(false);}}
                  onKeyDown={e=>{if(e.key==="Enter") tryUnlock();}}
                  placeholder="Enter passcode"
                  style={{
                    width:"100%", padding:"14px 44px 14px 16px", border:`1.5px solid ${pwErr?"#EF4444":C.border}`,
                    borderRadius:10, fontSize:14, fontFamily:BODY, color:C.ink, outline:"none",
                    transition:"all .15s"
                  }}/>
                <button onClick={()=>setShowPw(!showPw)} style={{
                  position:"absolute", right:14, border:"none", background:"none",
                  cursor:"pointer", color:C.muted, display:"flex", alignItems:"center", justifyContent:"center"
                }}>
                  {showPw ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {pwErr && (
              <div style={{
                display:"flex", gap:8, alignItems:"center", background:"#FFF5F5",
                border:"1px solid #FECACA", borderRadius:9, padding:"12px 14px",
                fontSize:14, color:"#7F1D1D", fontFamily:BODY
              }}>
                <AlertCircle size={16} color="#EF4444"/> Incorrect passcode. Please try again.
              </div>
            )}

            {/* Submit Button */}
            <button onClick={tryUnlock} style={{
              width:"100%", padding:"14px", background:"#111827", color:"#FFFFFF",
              border:"none", borderRadius:10, cursor:"pointer", fontWeight:700,
              fontSize:14, fontFamily:BODY, transition:"background .15s", marginTop:4
            }}>
              Login
            </button>
          </div>
        </div>

        {/* Mandala Watermark at the bottom center (only half visible) */}
        <img src={mandalaImg} alt="" style={{
          position: "absolute",
          bottom: 0,
          left: "50%",
          transform: "translate(-50%, 50%)",
          width: 720,
          height: 720,
          opacity: 0.5,
          pointerEvents: "none",
          userSelect: "none",
          zIndex: 0
        }}/>
      </div>
    </div>
  );

  // ── dashboard ─────────────────────────────────────────────────────────────
  return (
    <div className="dashboard-wrap">

      {/* ── HEADER ── */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <img src="https://upload.wikimedia.org/wikipedia/commons/e/ee/Aadhaar.svg" 
               alt="Aadhaar logo" 
               style={{height:28, width:"auto", objectFit:"contain", flexShrink:0}}/>
          <div style={{display:"flex",alignItems:"baseline",gap:8}}>
            <span style={{fontSize:18,fontWeight:800,color:C.ink,letterSpacing:"-.02em",fontFamily:HEAD}}>Pehchaan Updates &amp; Revenue</span>
            <span style={{fontSize:12,fontWeight:600,color:C.faint,letterSpacing:".05em",textTransform:"uppercase",fontFamily:BODY}}>UIDAI · Aadhaar App</span>
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {lastUpd && !busy && (
            <div style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:13,color:"#1B8C5A",border:"1px solid #BBF7D0",borderRadius:6,padding:"4px 8px",background:"#F0FDF4",fontWeight:600,fontFamily:BODY}}>
              <CheckCircle2 size={13} strokeWidth={2.5}/> Latest
            </div>
          )}

          {/* Refreshed info paired directly with Refresh button */}
          {lastUpd && (
            <div style={{fontSize:13,color:C.sub,fontFamily:BODY,marginRight:4}}>
              Refreshed: <span style={{color:C.ink,fontFamily:MONO,fontWeight:600}}>{fmtRefresh(lastUpd)}</span>
            </div>
          )}

          <button onClick={() => fetchSheet(true)} disabled={busy} style={{
            display:"inline-flex",alignItems:"center",gap:6,fontSize:13,fontWeight:600,
            color: busy ? C.faint : C.ink, background:C.surface,
            border:`1.5px solid ${C.border}`,borderRadius:8,padding:"6px 14px",
            cursor:busy?"default":"pointer",transition:"all .15s",fontFamily:BODY,
          }}>
            <RefreshCw size={13} className={busy?"spin":""} strokeWidth={2.2}/>
            {busy?"Fetching…":"Refresh"}
          </button>

          {/* Exit / Logout Option */}
          {ACCESS_CODE_HASHES && (
            <button onClick={logout} style={{
              display:"inline-flex",alignItems:"center",gap:5,fontSize:13,fontWeight:600,
              color: "#EF4444", background: C.surface,
              border: `1.5px solid #FEE2E2`, borderRadius:8, padding:"6px 14px",
              cursor:"pointer", transition:"all .15s", fontFamily:BODY,
            }}>
              <LogOut size={13} strokeWidth={2.2}/>
              Exit
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{display:"flex",gap:10,alignItems:"center",background:"#FFF5F5",border:"1px solid #FECACA",borderRadius:10,padding:"10px 16px",marginBottom:12,fontSize:14,color:"#7F1D1D",flexShrink:0,fontFamily:BODY}}>
          <AlertCircle size={16} color="#EF4444"/> {error}
        </div>
      )}

      {/* loading */}
      {busy && !rows && (
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14}}>
          <RefreshCw size={36} color={C.teal} className="spin" strokeWidth={2}/>
          <div style={{fontSize:20,fontWeight:700,color:C.ink,fontFamily:HEAD}}>loading data</div>
        </div>
      )}

      {/* ── MAIN LAYOUT ── */}
      {rows && (
        <>
          {/* Controls bar */}
          <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",flexShrink:0,background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"10px 16px",boxShadow:SHADOW,marginBottom:16}}>
            {/* Left side: Trends & Range */}
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:14,fontWeight:600,color:C.faint,letterSpacing:".05em",textTransform:"uppercase",fontFamily:BODY}}>Trends</span>
              <Seg value={preset} onChange={setPreset} options={[
                {v:"all",l:"All"},
                {v:"today",l:"Today"},
                {v:"7",l:"1W"},
                {v:"30",l:"1M"},
                {v:"90",l:"3M"},
                {v:"cumulative",l:"Cum."}
              ]}/>
            </div>
            <div style={{width:1,height:22,background:C.border}}/>
            <div style={{display:"flex",alignItems:"center",gap:7}}>
              <span style={{fontSize:14,fontWeight:600,color:C.faint,letterSpacing:".05em",textTransform:"uppercase",fontFamily:BODY}}>Range</span>
              <input type="date" value={from} min={DATE_MIN} max={to||bounds.max}
                onChange={e=>{setFrom(e.target.value); setPresetState("");}}
                style={{padding:"6px 10px",border:`1px solid ${C.border}`,borderRadius:7,fontFamily:MONO,fontSize:14,color:C.sub,outline:"none"}}/>
              <span style={{color:C.faint,fontSize:14}}>→</span>
              <input type="date" value={to} min={from||DATE_MIN} max={bounds.max}
                onChange={e=>{setTo(e.target.value); setPresetState("");}}
                style={{padding:"6px 10px",border:`1px solid ${C.border}`,borderRadius:7,fontFamily:MONO,fontSize:14,color:C.sub,outline:"none"}}/>
            </div>

            {/* Spacer */}
            <div style={{flex:1}}/>

            {/* Right side: Group by & Reset Filters */}
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:14,fontWeight:600,color:C.faint,letterSpacing:".05em",textTransform:"uppercase",fontFamily:BODY}}>Group by</span>
                <Seg value={gran} onChange={setGran} options={[{v:"daily",l:"Day"},{v:"weekly",l:"Week"},{v:"monthly",l:"Month"}]}/>
              </div>
              {isFilterChanged && (
                <>
                  <div style={{width:1,height:22,background:C.border}}/>
                  <button onClick={handleResetFilters} style={{
                    fontSize:13,fontWeight:600,color:"#EF4444",background:"#FEF2F2",
                    border:"1px solid #FEE2E2",borderRadius:8,padding:"6px 14px",
                    cursor:"pointer",fontFamily:BODY,transition:"all .15s"
                  }}>Reset Filters</button>
                </>
              )}
            </div>
          </div>

          <div className="dashboard-body">

            {/* ── LEFT: KPI CARDS (1/3) ── */}
            <div className="dashboard-kpis">
              {/* Section 1: Financial & Adoption (Revenue & Downloads) */}
              <div className="dashboard-kpi-sec1">
                <KpiCard cardKey="revenue" label="Total Revenue" icon={IndianRupee} color={C.revenue}
                  value={`₹${toCr(kpi.revenue)} Cr`} badge={pct("base")}
                  todayLabel="Today" todayVal={latest?`₹${Math.round((latest.base||0)*RATE_PER_UPDATE).toLocaleString("en-IN")}`:"—"}
                  rows1={[{label:"Billable updates",value:nfIN(kpi.base)},{label:"Rate / update",value:`₹${RATE_PER_UPDATE}`}]}
                  sparkData={spark("base")}
                  selected={selCards.has("revenue")} onClick={()=>toggleCard("revenue")}
                  period={periodLabel} preset={preset}/>

                <KpiCard cardKey="downloads" label="App Downloads" icon={Download} color={C.android}
                  value={nfIN(kpi.android+kpi.ios)} badge={pct("android")}
                  todayLabel="Today" todayVal={latest?nfIN((latest.android||0)+(latest.ios||0)):"—"}
                  rows1={[{label:"Android",value:nfIN(kpi.android)},{label:"iOS",value:nfIN(kpi.ios)}]}
                  sparkData={spark("android").map((d,i)=>({v:d.v+(spark("ios")[i]?.v||0)}))}
                  selected={selCards.has("downloads")} onClick={()=>toggleCard("downloads")}
                  period={periodLabel} preset={preset}/>
              </div>

              {/* Section 2: Updates operations (Combined card) */}
              <div className="dashboard-kpi-sec2">
                <CombinedUpdatesCard 
                  kpi={kpi} 
                  latest={latest} 
                  pct={pct} 
                  spark={spark} 
                  selCards={selCards} 
                  toggleCard={toggleCard} 
                  periodLabel={periodLabel} 
                  preset={preset}
                />
              </div>
            </div>

            {/* ── RIGHT: GRAPH SECTION (2/3) ── */}
            <div className="dashboard-charts">

              {/* Update trends chart */}
              <div style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:RADIUS,display:"flex",flexDirection:"column",minHeight:0,minWidth:0,overflow:"hidden",padding:"16px",boxShadow:SHADOW}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,flexShrink:0,flexWrap:"wrap",gap:12}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <TrendingUp size={18} color={C.teal} strokeWidth={2.2}/>
                  <span style={{fontSize:20,fontWeight:700,color:C.ink,fontFamily:HEAD}}>{activeTitle}</span>
                  <span style={{fontSize:14,color:C.faint,fontFamily:MONO,fontWeight:500}}>{gran}</span>
                </div>
                
                {/* Legend Wrapper */}
                <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
                  {/* series legend dots */}
                  <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                    {lineDef.filter(l=>effectiveLines[l.key]).map(l=>(
                      <div key={l.key} style={{display:"flex",alignItems:"center",gap:6,fontSize:14,color:C.sub,fontWeight:500,fontFamily:BODY}}>
                        <span style={{width:10,height:10,borderRadius:"50%",background:l.color,flexShrink:0}}/>
                        {l.name}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{flex:1,minHeight:0}}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{top:4,right:8,left:0,bottom:0}}>
                    <CartesianGrid strokeDasharray="4 4" stroke="#F3F4F6" vertical={false}/>
                    <XAxis dataKey="label" tick={{fontSize:14,fill:C.faint,fontFamily:MONO}} tickMargin={6} minTickGap={32} axisLine={{stroke:C.border}} tickLine={false}/>
                    <YAxis tick={{fontSize:14,fill:C.faint,fontFamily:MONO}} tickFormatter={fmtK} axisLine={false} tickLine={false} width={48}/>
                    <Tooltip content={<ChartTooltip isRevenue={selCards.has("revenue")}/>}/>
                    {lineDef.filter(l=>effectiveLines[l.key]).map(l=>(
                      <Line key={l.key} type="monotone" dataKey={l.key} name={l.name} stroke={l.color}
                        strokeWidth={l.key==="total"?2.8:2.2} dot={false} activeDot={{r:6,strokeWidth:0}}
                        isAnimationActive={true} animationDuration={400} animationEasing="ease-out"/>
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Downloads chart */}
            {showDl && (
              <div style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:RADIUS,display:"flex",flexDirection:"column",minHeight:0,minWidth:0,overflow:"hidden",padding:"16px",boxShadow:SHADOW}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,flexShrink:0,flexWrap:"wrap",gap:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <Download size={18} color={C.android} strokeWidth={2.2}/>
                    <span style={{fontSize:20,fontWeight:700,color:C.ink,fontFamily:HEAD}}>App Downloads</span>
                    <span style={{fontSize:14,color:C.faint,fontFamily:MONO,fontWeight:500}}>{gran}</span>
                  </div>
                  
                  {/* Legend Wrapper */}
                  <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
                    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,fontSize:14,color:C.sub,fontWeight:500,fontFamily:BODY}}>
                        <span style={{width:10,height:10,borderRadius:"50%",background:C.android,flexShrink:0}}/>
                        Android
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:6,fontSize:14,color:C.sub,fontWeight:500,fontFamily:BODY}}>
                        <span style={{width:10,height:10,borderRadius:"50%",background:C.ios,flexShrink:0}}/>
                        iOS
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{flex:1,minHeight:0}}>
                  {hasDl ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={dlData} margin={{top:4,right:8,left:0,bottom:0}}>
                        <CartesianGrid strokeDasharray="4 4" stroke="#F3F4F6" vertical={false}/>
                        <XAxis dataKey="label" tick={{fontSize:14,fill:C.faint,fontFamily:MONO}} minTickGap={32} axisLine={{stroke:C.border}} tickLine={false}/>
                        <YAxis tick={{fontSize:14,fill:C.faint,fontFamily:MONO}} axisLine={false} tickLine={false} width={48} tickFormatter={fmtK}/>
                        <Tooltip content={<ChartTooltip/>}/>
                        <Line type="monotone" dataKey="android" name="Android" stroke={C.android} strokeWidth={2.2}
                          dot={false} activeDot={{r:6,strokeWidth:0}} animationDuration={400} animationEasing="ease-out"/>
                        <Line type="monotone" dataKey="ios" name="iOS" stroke={C.ios} strokeWidth={2.2}
                          dot={false} activeDot={{r:6,strokeWidth:0}} animationDuration={400} animationEasing="ease-out"/>
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{height:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:C.faint,fontSize:14,fontWeight:500,fontFamily:BODY}}>No download data in selected range.</div>
                  )}
                </div>
              </div>
            )}
          </div>{/* right col */}
        </div>
        </>
      )}
      <style>{`
        @keyframes sp { to { transform: rotate(360deg); } }
        .spin { animation: sp .9s linear infinite; }
        input[type=date]:focus { outline: 2px solid ${C.teal}44; outline-offset:1px; border-color: ${C.teal}88 !important; }
        button:hover:not(:disabled) { filter: brightness(.97); }
      `}</style>
    </div>
  );
}
