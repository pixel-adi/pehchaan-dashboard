import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  RefreshCw, Lock, Plus, Trash2, Calendar, TrendingUp,
  AlertCircle, IndianRupee, Smartphone, CheckCircle2,
} from "lucide-react";

/*
  PEHCHAAN — Updates & Revenue Dashboard
  ---------------------------------------
  Data is fetched automatically from the linked Google Sheet (CSV export).
  Hit "Refresh" to pull the latest data at any time.

  Sheet URL: https://docs.google.com/spreadsheets/d/1pwUb9tNTzqGO2utAzF-oLRNiCsENK596Mj-ff8etGzA
*/

const SHEET_ID = "1pwUb9tNTzqGO2utAzF-oLRNiCsENK596Mj-ff8etGzA";
const SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`;

const ACCESS_CODE = "Pehchaan@2026"; // Phase-1 placeholder gate. Set to null to disable.
const RATE_PER_UPDATE = 75; // ₹ per billable update

// ---------- palette ----------
const C = {
  canvas: "#F6F7F9", surface: "#FFFFFF", line: "#E4E7EE",
  ink: "#141821", muted: "#5B6472", faint: "#8A93A3",
  navy: "#1E2A44", teal: "#0E7C86",
  mobile: "#1E5AA8", address: "#0E7C86", hof: "#C77D0A", email: "#7A5AF0", total: "#141821",
  android: "#2E9E6B", ios: "#41506B",
};
const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const MONO = "ui-monospace, 'SF Mono', 'DM Mono', Menlo, monospace";

// ---------- helpers ----------
const nfIN = (n) => (n == null || isNaN(n) ? "—" : Math.round(n).toLocaleString("en-IN"));
const toCr = (n) => (n / 1e7).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const iso = (s) => {
  if (!s) return null;
  s = String(s).trim();
  // Already ISO format
  const isoM = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoM) return `${isoM[1]}-${isoM[2]}-${isoM[3]}`;
  // MM/DD/YYYY or M/D/YYYY from Google Sheets
  const usM = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usM) return `${usM[3]}-${usM[1].padStart(2, "0")}-${usM[2].padStart(2, "0")}`;
  const p = new Date(s);
  return isNaN(p) ? null : p.toISOString().slice(0, 10);
};

const monthLabel = (ymd) => { const [y, m] = ymd.split("-"); return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+m - 1] + " " + y; };
const dayLabel = (ymd) => { const [, m, d] = ymd.split("-"); return `${d} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+m - 1]}`; };
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// ---------- CSV parser ----------
// Handles quoted fields with embedded commas/newlines
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuote = false, i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (ch === '"') { inQuote = false; i++; continue; }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuote = true; i++; continue; }
    if (ch === ',') { row.push(field); field = ""; i++; continue; }
    if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
      row.push(field); rows.push(row); row = []; field = ""; i += ch === '\r' ? 2 : 1; continue;
    }
    field += ch; i++;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// ---------- parse fetched CSV rows into our data model ----------
function parseSheetCSV(csvText) {
  const allRows = parseCSV(csvText);
  if (!allRows.length) throw new Error("Empty sheet response.");

  // Find header row (within first 5 rows) that has a date-like column
  let headerIdx = -1, headers = [], cols = {};
  for (let hi = 0; hi < Math.min(5, allRows.length); hi++) {
    const h = allRows[hi].map(c => c.trim());
    const n = h.map(norm);
    const dateCol = n.findIndex(x => x.includes("year") || x.includes("date") || x.includes("month"));
    if (dateCol === -1) continue;
    headerIdx = hi;
    headers = h;
    // Map canonical fields
    n.forEach((x, i) => {
      if (x.includes("year") || x.includes("date") || x.includes("month")) cols.date = cols.date ?? i;
      else if (x.startsWith("week")) cols.week = cols.week ?? i;
      else if (x.includes("mobile")) cols.mobile = cols.mobile ?? i;
      else if (x.includes("hof")) cols.hof = cols.hof ?? i;
      else if (x.includes("email")) cols.email = cols.email ?? i;
      else if (x.includes("address") && !x.includes("hof")) cols.address = cols.address ?? i;
      else if (x.includes("total") && x.includes("record")) cols.totalRec = cols.totalRec ?? i;
      else if (x.includes("ios")) cols.ios = cols.ios ?? i;
      else if (x.includes("android")) cols.android = cols.android ?? i;
    });
    if (cols.date != null) break;
  }

  if (headerIdx === -1 || cols.date == null) {
    throw new Error("Could not find a date column in the sheet. Expected columns like YearMonth, Mobile, etc.");
  }

  const num = (row, idx) => {
    if (idx == null) return 0;
    const v = row[idx]?.trim() ?? "";
    const x = parseFloat(v.replace(/,/g, ""));
    return isNaN(x) ? 0 : x;
  };

  const out = [];
  for (let r = headerIdx + 1; r < allRows.length; r++) {
    const row = allRows[r];
    if (!row || !row.length) continue;
    const date = iso(row[cols.date]);
    if (!date) continue;
    out.push({
      date,
      week: cols.week != null ? String(row[cols.week]?.trim() ?? "") : "",
      mobile: num(row, cols.mobile),
      address: num(row, cols.address),
      hof: num(row, cols.hof),
      emailSheet: num(row, cols.email),
      ios: num(row, cols.ios),
      android: num(row, cols.android),
    });
  }

  if (!out.length) throw new Error("No data rows found in the sheet.");
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

// ---------- small UI atoms ----------
const Card = ({ children, style }) => (
  <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, ...style }}>{children}</div>
);
const Eyebrow = ({ children }) => (
  <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: C.faint }}>{children}</div>
);
function Kpi({ label, value, sub, accent, highlight }) {
  return (
    <Card style={highlight ? { background: C.navy, borderColor: C.navy } : {}}>
      <div style={{ padding: "16px 18px" }}>
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: highlight ? "#AEB8CC" : C.faint }}>{label}</div>
        <div style={{ fontFamily: MONO, fontSize: 30, fontWeight: 500, marginTop: 8, color: highlight ? "#FFFFFF" : C.ink, fontVariantNumeric: "tabular-nums", lineHeight: 1.05 }}>{value}</div>
        {sub && <div style={{ fontSize: 12.5, color: highlight ? "#AEB8CC" : C.muted, marginTop: 6 }}>{sub}</div>}
        {accent && <div style={{ height: 3, width: 34, background: accent, borderRadius: 3, marginTop: 12 }} />}
      </div>
    </Card>
  );
}
function Seg({ options, value, onChange }) {
  return (
    <div style={{ display: "inline-flex", background: "#EEF0F4", borderRadius: 10, padding: 3, gap: 2 }}>
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)}
          style={{ border: "none", cursor: "pointer", borderRadius: 8, padding: "6px 12px", fontSize: 13, fontFamily: SANS,
            fontWeight: value === o.v ? 600 : 500, color: value === o.v ? C.ink : C.muted, background: value === o.v ? C.surface : "transparent",
            boxShadow: value === o.v ? "0 1px 2px rgba(0,0,0,.08)" : "none" }}>{o.l}</button>
      ))}
    </div>
  );
}

// ================= main =================
export default function PehchaanDashboard() {
  const [rows, setRows] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [trend, setTrend] = useState("daily"); // daily | cumulative
  const [gran, setGran] = useState("daily");   // daily | weekly | monthly
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [visible, setVisible] = useState({ mobile: true, address: true, hof: true, email: true, total: true });

  const [manualEmail, setManualEmail] = useState({}); // { date: n }
  const [manualDl, setManualDl] = useState({});       // { date: {android, ios} }
  const [entryDate, setEntryDate] = useState("");
  const [entryEmail, setEntryEmail] = useState("");
  const [entryAnd, setEntryAnd] = useState("");
  const [entryIos, setEntryIos] = useState("");

  const [gate, setGate] = useState(ACCESS_CODE ? false : true);
  const [pw, setPw] = useState("");
  const [pwErr, setPwErr] = useState(false);
  const tryUnlock = () => { if (pw === ACCESS_CODE) { setGate(true); setPwErr(false); } else { setPwErr(true); } };

  // ---- fetch from Google Sheet ----
  const fetchSheet = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const res = await fetch(SHEET_CSV_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status} — could not reach the Google Sheet. Make sure it is shared publicly.`);
      const text = await res.text();
      const parsed = parseSheetCSV(text);
      setRows(parsed);
      setLastUpdated(new Date());
      const min = parsed[0].date, max = parsed[parsed.length - 1].date;
      setFrom((f) => f || min);
      setTo((t) => t || max);
      setEntryDate((d) => d || max);
    } catch (e) {
      setError(e.message || "Could not fetch sheet data.");
      setRows(null);
    } finally {
      setBusy(false);
    }
  }, []);

  // Auto-fetch on mount (only after unlocking)
  useEffect(() => {
    if (gate) fetchSheet();
  }, [gate, fetchSheet]);

  const bounds = useMemo(() => rows ? { min: rows[0].date, max: rows[rows.length - 1].date } : null, [rows]);

  // effective rows within range (apply manual email override + manual download overrides)
  const inRange = useMemo(() => {
    if (!rows) return [];
    return rows.filter((r) => (!from || r.date >= from) && (!to || r.date <= to)).map((r) => {
      const email = r.date in manualEmail ? manualEmail[r.date] : r.emailSheet;
      // manual download overrides sheet values for that date if set
      const manDl = manualDl[r.date];
      const android = manDl ? (manDl.android || 0) : (r.android || 0);
      const ios = manDl ? (manDl.ios || 0) : (r.ios || 0);
      const base = r.mobile + r.address + r.hof;
      return { ...r, email, total: base + email, base, android, ios };
    });
  }, [rows, from, to, manualEmail, manualDl]);

  // bucket by granularity
  const buckets = useMemo(() => {
    if (!inRange.length) return [];
    const keyOf = (r) => gran === "monthly" ? r.date.slice(0, 7) : gran === "weekly" ? (r.week || r.date.slice(0, 7)) : r.date;
    const labelOf = (r, k) => gran === "monthly" ? monthLabel(r.date.slice(0, 7) + "-01") : gran === "weekly" ? (r.week || k) : dayLabel(r.date);
    const m = new Map();
    for (const r of inRange) {
      const k = keyOf(r);
      if (!m.has(k)) m.set(k, { key: k, label: labelOf(r, k), first: r.date, mobile: 0, address: 0, hof: 0, email: 0, total: 0, base: 0, android: 0, ios: 0 });
      const b = m.get(k);
      for (const f of ["mobile", "address", "hof", "email", "total", "base", "android", "ios"]) b[f] += r[f];
      if (r.date < b.first) b.first = r.date;
    }
    return [...m.values()].sort((a, b) => a.first.localeCompare(b.first));
  }, [inRange, gran]);

  // chart series (apply cumulative if selected)
  const chartData = useMemo(() => {
    let run = { mobile: 0, address: 0, hof: 0, email: 0, total: 0 };
    return buckets.map((b) => {
      if (trend === "cumulative") { for (const k of Object.keys(run)) run[k] += b[k]; return { label: b.label, ...run }; }
      return { label: b.label, mobile: b.mobile, address: b.address, hof: b.hof, email: b.email, total: b.total };
    });
  }, [buckets, trend]);

  const dlData = useMemo(() => {
    let ra = 0, ri = 0;
    return buckets.map((b) => {
      if (trend === "cumulative") { ra += b.android; ri += b.ios; return { label: b.label, android: ra, ios: ri }; }
      return { label: b.label, android: b.android, ios: b.ios };
    });
  }, [buckets, trend]);
  const hasDl = useMemo(() => buckets.some((b) => b.android || b.ios), [buckets]);

  // KPIs
  const k = useMemo(() => {
    const s = (f) => inRange.reduce((a, r) => a + r[f], 0);
    const mobile = s("mobile"), address = s("address"), hof = s("hof"), email = s("email");
    const base = mobile + address + hof;
    return { total: base + email, mobile, address, hof, email, base, revenue: base * RATE_PER_UPDATE, android: s("android"), ios: s("ios") };
  }, [inRange]);

  const setPreset = (p) => {
    if (!bounds) return;
    const max = new Date(bounds.max + "T00:00:00");
    const back = (days) => { const d = new Date(max); d.setDate(d.getDate() - days + 1); const lo = d.toISOString().slice(0, 10); return lo < bounds.min ? bounds.min : lo; };
    if (p === "7") { setFrom(back(7)); setTo(bounds.max); }
    else if (p === "30") { setFrom(back(30)); setTo(bounds.max); }
    else if (p === "90") { setFrom(back(90)); setTo(bounds.max); }
    else if (p === "fy") { const fy = "2026-04-01"; setFrom(fy < bounds.min ? bounds.min : fy); setTo(bounds.max); }
    else { setFrom(bounds.min); setTo(bounds.max); }
  };

  const addEntry = () => {
    if (!entryDate) return;
    if (entryEmail !== "") setManualEmail((m) => ({ ...m, [entryDate]: Math.max(0, +entryEmail || 0) }));
    if (entryAnd !== "" || entryIos !== "") setManualDl((m) => ({ ...m, [entryDate]: { android: Math.max(0, +entryAnd || 0), ios: Math.max(0, +entryIos || 0) } }));
    setEntryEmail(""); setEntryAnd(""); setEntryIos("");
  };
  const entries = useMemo(() => {
    const keys = new Set([...Object.keys(manualEmail), ...Object.keys(manualDl)]);
    return [...keys].sort().map((d) => ({ date: d, email: manualEmail[d], ...(manualDl[d] || {}) }));
  }, [manualEmail, manualDl]);
  const removeEntry = (d) => {
    setManualEmail((m) => { const n = { ...m }; delete n[d]; return n; });
    setManualDl((m) => { const n = { ...m }; delete n[d]; return n; });
  };

  const lineDef = [
    { key: "mobile", name: "Mobile", color: C.mobile },
    { key: "address", name: "Address (Regular)", color: C.address },
    { key: "hof", name: "Address (HOF)", color: C.hof },
    { key: "email", name: "Email", color: C.email },
    { key: "total", name: "Total", color: C.total },
  ];

  // ---- gate ----
  if (ACCESS_CODE && !gate) {
    return (
      <div style={{ minHeight: 460, background: C.canvas, display: "grid", placeItems: "center", fontFamily: SANS }}>
        <Card style={{ width: 320, padding: 24 }}>
          <Lock size={20} color={C.navy} />
          <div style={{ fontSize: 18, fontWeight: 700, color: C.ink, marginTop: 10 }}>Pehchaan Dashboard</div>
          <div style={{ fontSize: 13, color: C.muted, margin: "6px 0 14px" }}>Restricted · enter the access password.</div>
          <input type="password" value={pw} autoFocus
            onChange={(e) => { setPw(e.target.value); setPwErr(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") tryUnlock(); }}
            placeholder="Password"
            style={{ width: "100%", padding: "10px 12px", border: `1px solid ${pwErr ? "#C4463A" : C.line}`, borderRadius: 8, fontFamily: MONO }} />
          {pwErr && <div style={{ fontSize: 12.5, color: "#C4463A", marginTop: 8 }}>Incorrect password.</div>}
          <button onClick={tryUnlock} style={{ width: "100%", marginTop: 10, padding: "10px", background: C.navy, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>Unlock</button>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ background: C.canvas, fontFamily: SANS, color: C.ink, padding: 20, minHeight: 600 }}>
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <Eyebrow>UIDAI · Aadhaar App</Eyebrow>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-.01em", marginTop: 4 }}>Pehchaan — Updates &amp; Revenue</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {lastUpdated && !busy && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#2E9E6B", border: `1px solid #C6EDD9`, borderRadius: 8, padding: "6px 10px", fontFamily: MONO, background: "#F0FAF5" }}>
              <CheckCircle2 size={13} /> Live · Google Sheet
            </span>
          )}
          <button
            id="refresh-btn"
            onClick={fetchSheet}
            disabled={busy}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: C.ink, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 14px", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
            <RefreshCw size={14} className={busy ? "spin" : ""} />
            {busy ? "Fetching…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <Card style={{ padding: 14, marginBottom: 16, borderColor: "#E9B7B0", background: "#FCF3F1", display: "flex", gap: 10 }}>
          <AlertCircle size={18} color="#B4432E" />
          <div style={{ fontSize: 13, color: "#8A3322" }}>{error}</div>
        </Card>
      )}

      {/* loading state */}
      {busy && !rows && (
        <div style={{ border: `1.5px dashed ${C.line}`, borderRadius: 16, background: C.surface, padding: "72px 24px", textAlign: "center" }}>
          <RefreshCw size={36} color={C.teal} className="spin" style={{ margin: "0 auto" }} />
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 14 }}>Loading from Google Sheet…</div>
          <div style={{ fontSize: 13.5, color: C.muted, marginTop: 6 }}>Fetching the latest data automatically.</div>
        </div>
      )}

      {rows && (
        <>
          {/* controls */}
          <Card style={{ padding: 14, marginBottom: 16, display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
            <div><div style={{ marginBottom: 6 }}><Eyebrow>Trend</Eyebrow></div><Seg value={trend} onChange={setTrend} options={[{ v: "daily", l: "Daily" }, { v: "cumulative", l: "Cumulative" }]} /></div>
            <div><div style={{ marginBottom: 6 }}><Eyebrow>Granularity</Eyebrow></div><Seg value={gran} onChange={setGran} options={[{ v: "daily", l: "Day" }, { v: "weekly", l: "Week" }, { v: "monthly", l: "Month" }]} /></div>
            <div>
              <div style={{ marginBottom: 6 }}><Eyebrow>Date range</Eyebrow></div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <input type="date" value={from} min={bounds.min} max={to} onChange={(e) => setFrom(e.target.value)} style={{ padding: "7px 9px", border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: MONO, fontSize: 12.5 }} />
                <span style={{ color: C.faint }}>→</span>
                <input type="date" value={to} min={from} max={bounds.max} onChange={(e) => setTo(e.target.value)} style={{ padding: "7px 9px", border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: MONO, fontSize: 12.5 }} />
              </div>
            </div>
            <div style={{ marginLeft: "auto" }}>
              <div style={{ marginBottom: 6 }}><Eyebrow>Presets</Eyebrow></div>
              <div style={{ display: "inline-flex", gap: 6 }}>
                {[["7", "7D"], ["30", "30D"], ["90", "90D"], ["fy", "FY26-27"], ["all", "All"]].map(([v, l]) => (
                  <button key={v} onClick={() => setPreset(v)} style={{ fontSize: 12, fontWeight: 600, color: C.muted, background: "#EEF0F4", border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontFamily: MONO }}>{l}</button>
                ))}
              </div>
            </div>
          </Card>

          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 16 }}>
            <Kpi label="Total updates" value={nfIN(k.total)} sub="incl. email" accent={C.total} />
            <Kpi label="Mobile updates" value={nfIN(k.mobile)} accent={C.mobile} />
            <Kpi label="Address updates" value={nfIN(k.address + k.hof)} sub={`Regular ${nfIN(k.address)} · HOF ${nfIN(k.hof)}`} accent={C.address} />
            <Kpi label="App email updates" value={nfIN(k.email)} sub="excluded from revenue" accent={C.email} />
            <Kpi label="Total revenue" value={`₹${toCr(k.revenue)} Cr`} sub={`${nfIN(k.base)} billable × ₹${RATE_PER_UPDATE}`} highlight />
            <Kpi label="App downloads" value={nfIN(k.android + k.ios)} sub={`Android ${nfIN(k.android)} · iOS ${nfIN(k.ios)}`} accent={C.android} />
          </div>

          {/* main chart */}
          <Card style={{ padding: "18px 18px 8px", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><TrendingUp size={16} color={C.teal} /><b style={{ fontSize: 15 }}>Update trends</b><span style={{ fontSize: 12, color: C.faint, fontFamily: MONO }}>{trend} · {gran}</span></div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {lineDef.map((l) => (
                  <button key={l.key} onClick={() => setVisible((v) => ({ ...v, [l.key]: !v[l.key] }))}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, border: `1px solid ${C.line}`, borderRadius: 20, padding: "4px 10px", cursor: "pointer",
                      background: visible[l.key] ? "#fff" : "#F1F2F5", color: visible[l.key] ? C.ink : C.faint }}>
                    <span style={{ width: 9, height: 9, borderRadius: 9, background: visible[l.key] ? l.color : C.faint }} />{l.name}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={chartData} margin={{ top: 6, right: 12, left: 6, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F4" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.muted, fontFamily: MONO }} tickMargin={8} minTickGap={24} axisLine={{ stroke: C.line }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: C.muted, fontFamily: MONO }} tickFormatter={(v) => v >= 1e5 ? (v / 1e5).toFixed(1) + "L" : v >= 1e3 ? (v / 1e3).toFixed(0) + "k" : v} axisLine={false} tickLine={false} width={44} />
                <Tooltip formatter={(v, n) => [nfIN(v), n]} labelStyle={{ fontFamily: MONO, fontSize: 12, color: C.ink }} contentStyle={{ borderRadius: 10, border: `1px solid ${C.line}`, fontSize: 12, fontFamily: SANS }} />
                {lineDef.filter((l) => visible[l.key]).map((l) => (
                  <Line key={l.key} type="monotone" dataKey={l.key} name={l.name} stroke={l.color} strokeWidth={l.key === "total" ? 2.4 : 1.8} dot={false} activeDot={{ r: 4 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* downloads + manual entry */}
          <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16, marginBottom: 16 }}>
            <Card style={{ padding: "18px 18px 8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><Smartphone size={16} color={C.android} /><b style={{ fontSize: 15 }}>App downloads</b><span style={{ fontSize: 12, color: C.faint, fontFamily: MONO }}>from sheet · {trend}</span></div>
              {hasDl ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={dlData} margin={{ top: 6, right: 12, left: 6, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F4" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.muted, fontFamily: MONO }} minTickGap={24} axisLine={{ stroke: C.line }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: C.muted, fontFamily: MONO }} axisLine={false} tickLine={false} width={40} />
                    <Tooltip formatter={(v, n) => [nfIN(v), n]} contentStyle={{ borderRadius: 10, border: `1px solid ${C.line}`, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="android" name="Android" stroke={C.android} strokeWidth={1.8} dot={false} />
                    <Line type="monotone" dataKey="ios" name="iOS" stroke={C.ios} strokeWidth={1.8} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ padding: "40px 12px", textAlign: "center", color: C.muted, fontSize: 13 }}>No download data in the sheet yet.</div>
              )}
            </Card>

            <Card style={{ padding: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}><Plus size={16} color={C.teal} /><b style={{ fontSize: 15 }}>Manual overrides</b></div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>Override email or download figures for a specific date. Sheet values are used by default.</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label style={{ gridColumn: "1 / -1", fontSize: 11, color: C.muted, fontFamily: MONO }}>Date
                  <input type="date" value={entryDate} min={bounds.min} max={bounds.max} onChange={(e) => setEntryDate(e.target.value)} style={{ width: "100%", marginTop: 4, padding: "8px 9px", border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: MONO, fontSize: 12.5 }} /></label>
                <label style={{ gridColumn: "1 / -1", fontSize: 11, color: C.muted, fontFamily: MONO }}>Email updates override
                  <input type="number" min="0" value={entryEmail} onChange={(e) => setEntryEmail(e.target.value)} placeholder="e.g. 125696" style={{ width: "100%", marginTop: 4, padding: "8px 9px", border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: MONO, fontSize: 12.5 }} /></label>
                <label style={{ fontSize: 11, color: C.muted, fontFamily: MONO }}>Android override
                  <input type="number" min="0" value={entryAnd} onChange={(e) => setEntryAnd(e.target.value)} placeholder="0" style={{ width: "100%", marginTop: 4, padding: "8px 9px", border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: MONO, fontSize: 12.5 }} /></label>
                <label style={{ fontSize: 11, color: C.muted, fontFamily: MONO }}>iOS override
                  <input type="number" min="0" value={entryIos} onChange={(e) => setEntryIos(e.target.value)} placeholder="0" style={{ width: "100%", marginTop: 4, padding: "8px 9px", border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: MONO, fontSize: 12.5 }} /></label>
              </div>
              <button onClick={addEntry} style={{ width: "100%", marginTop: 12, padding: "9px", background: C.teal, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>Apply override</button>
              {entries.length > 0 && (
                <div style={{ marginTop: 12, maxHeight: 150, overflowY: "auto" }}>
                  {entries.map((e) => (
                    <div key={e.date} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderTop: `1px solid ${C.line}`, fontSize: 12, fontFamily: MONO }}>
                      <span>{e.date}</span>
                      <span style={{ color: C.muted }}>{e.email != null ? `✉ ${nfIN(e.email)}` : ""} {e.android != null ? `· A ${nfIN(e.android)}` : ""} {e.ios != null ? `· i ${nfIN(e.ios)}` : ""}</span>
                      <button onClick={() => removeEntry(e.date)} style={{ border: "none", background: "none", cursor: "pointer", color: C.faint }}><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* footer */}
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, fontSize: 12, color: C.faint, fontFamily: MONO, padding: "4px 2px" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Calendar size={13} /> Google Sheet · {rows.length} rows · {bounds.min} → {bounds.max}</span>
            <span>Last refreshed {lastUpdated?.toLocaleString("en-IN")}</span>
          </div>
        </>
      )}
      <style>{`.spin{animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}} input:focus{outline:2px solid ${C.teal}33;outline-offset:1px}`}</style>
    </div>
  );
}
