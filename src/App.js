import { useState, useCallback, useRef, useMemo, lazy, Suspense } from "react";

// Lazy load AI Voice Orders component
const AIVoiceOrdersTab = lazy(() => import('./ai_voice_orders/AIVoiceOrdersTab'));

// ── Helpers ────────────────────────────────────────────────────────────────────
const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const fmtINRSym = (n) =>
  n >= 100000
    ? `\u20b9${(n / 100000).toFixed(1)}L`
    : n >= 1000
    ? `\u20b9${(n / 1000).toFixed(1)}K`
    : `\u20b9${Math.round(n)}`;
const fmtShort = (n) =>
  n >= 100000
    ? `${(n / 100000).toFixed(1)}L`
    : n >= 1000
    ? `${(n / 1000).toFixed(1)}K`
    : `${Math.round(n)}`;
const parseCSV = (text) => {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((l) => {
    const vals = l.split(",");
    return Object.fromEntries(headers.map((h, i) => [h, (vals[i] || "").trim()]));
  });
};

// ── Analysis Engine ────────────────────────────────────────────────────────────
function runAnalysis(menuRaw, txRaw) {
  const menu = {};
  menuRaw.filter((r) => r.status === "Active").forEach((r) => {
    menu[r.item_id] = {
      ...r,
      selling_price: +r.selling_price,
      food_cost: +r.food_cost,
      contribution_margin: +r.contribution_margin,
      margin_pct: +r.margin_pct,
    };
  });

  const baskets = {}, itemStats = {}, itemOrders = {};
  txRaw.forEach((t) => {
    if (!baskets[t.order_id]) baskets[t.order_id] = new Set();
    baskets[t.order_id].add(t.item_id);
    if (!itemStats[t.item_id]) itemStats[t.item_id] = { units: 0, revenue: 0, profit: 0 };
    itemStats[t.item_id].units += +t.quantity;
    itemStats[t.item_id].revenue += +t.line_revenue;
    itemStats[t.item_id].profit += +t.line_contribution_margin;
    if (!itemOrders[t.item_id]) itemOrders[t.item_id] = new Set();
    itemOrders[t.item_id].add(t.order_id);
  });

  const totalOrders = Object.keys(baskets).length;
  const days = new Set(txRaw.map((t) => t.transaction_date)).size || 1;
  const activeWithSales = Object.keys(menu).filter((id) => itemStats[id]);
  const medUnits = median(activeWithSales.map((id) => itemStats[id].units));
  const medMargin = median(activeWithSales.map((id) => menu[id].margin_pct));

  const matrix = { Stars: [], "Hidden Gems": [], "Watch List": [], Laggards: [] };
  activeWithSales.forEach((id) => {
    const m = menu[id], s = itemStats[id];
    const hm = m.margin_pct >= medMargin, hv = s.units >= medUnits;
    const cat = hm && hv ? "Stars" : hm ? "Hidden Gems" : hv ? "Watch List" : "Laggards";
    matrix[cat].push({ id, name: m.item_name, margin_pct: m.margin_pct, units: s.units, revenue: s.revenue, profit: s.profit, category: m.category, subcategory: m.subcategory, selling_price: m.selling_price });
  });

  const catRevMap = {}, catMgnSum = {}, catMgnCnt = {};
  activeWithSales.forEach((id) => {
    const m = menu[id], s = itemStats[id], c = m.category;
    catRevMap[c] = (catRevMap[c] || 0) + s.revenue;
    catMgnSum[c] = (catMgnSum[c] || 0) + m.margin_pct;
    catMgnCnt[c] = (catMgnCnt[c] || 0) + 1;
  });
  const catRevenueData = Object.entries(catRevMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  const catMarginData = Object.entries(catMgnSum).map(([name, sum]) => ({ name, value: Math.round((sum / catMgnCnt[name]) * 10) / 10 }));

  const topByMargin = [...activeWithSales].sort((a, b) => itemStats[b].profit - itemStats[a].profit).slice(0, 10).map((id) => ({
    id, name: menu[id].item_name, profit: itemStats[id].profit, margin_pct: menu[id].margin_pct, units: itemStats[id].units, subcategory: menu[id].subcategory,
  }));

  const pairCounts = {};
  Object.values(baskets).forEach((items) => {
    const arr = [...items].sort();
    for (let i = 0; i < arr.length; i++)
      for (let j = i + 1; j < arr.length; j++) {
        const k = `${arr[i]}|${arr[j]}`;
        pairCounts[k] = (pairCounts[k] || 0) + 1;
      }
  });

  const COMPAT = {
    Italian: ["Italian", "Western"], Mexican: ["Mexican", "Western"],
    "Fast Food": ["Fast Food", "Western"], Asian: ["Asian", "Indian"],
    "North Indian": ["North Indian", "Indian"], "South Indian": ["South Indian", "Indian"],
    International: ["International", "Indian"],
    Indian: ["Indian", "North Indian", "South Indian", "Asian", "International"],
    Western: ["Western", "Italian", "Mexican", "Fast Food"],
  };
  const subcompat = (a, b) => (COMPAT[a] || []).includes(b);

  const laggardIds = new Set(matrix.Laggards.map((i) => i.id));
  const combos = [];
  Object.entries(pairCounts).forEach(([k, cnt]) => {
    const [a, b] = k.split("|");
    if (!menu[a] || !menu[b] || laggardIds.has(a) || laggardIds.has(b)) return;
    const subA = menu[a].subcategory, subB = menu[b].subcategory;
    if (!subcompat(subA, subB) && !subcompat(subB, subA)) return;
    const supA = (itemOrders[a]?.size || 0) / totalOrders;
    const supB = (itemOrders[b]?.size || 0) / totalOrders;
    const sup = cnt / totalOrders;
    const lift = supA && supB ? sup / (supA * supB) : 0;
    const confAB = itemOrders[a]?.size ? cnt / itemOrders[a].size : 0;
    const confBA = itemOrders[b]?.size ? cnt / itemOrders[b].size : 0;
    const avgMargin = (menu[a].margin_pct + menu[b].margin_pct) / 2;
    const bundlePrice = menu[a].selling_price + menu[b].selling_price;
    const score = 0.35 * Math.min(lift / 3, 1) + 0.25 * Math.max(confAB, confBA) + 0.2 * (avgMargin / 100) + 0.2 * Math.min(cnt / 30, 1);
    const strength = lift >= 1.5 ? "Strong" : lift >= 1.2 ? "Moderate" : "Weak";
    combos.push({ a, b, nameA: menu[a].item_name, nameB: menu[b].item_name, cnt, support: sup, lift, confAB, confBA, avgMargin, bundlePrice, score, strength, subA, subB });
  });
  combos.sort((x, y) => y.score - x.score);
  const topCombos = combos.slice(0, 30);

  const topItems = [...activeWithSales].sort((a, b) => itemStats[b].units - itemStats[a].units).slice(0, 12);
  const upsells = topItems.map((id) => {
    const subId = menu[id].subcategory, freq = {};
    (itemOrders[id] || new Set()).forEach((oid) => {
      baskets[oid]?.forEach((other) => {
        if (other !== id && menu[other]) {
          const so = menu[other].subcategory;
          if (subcompat(subId, so) || subcompat(so, subId)) freq[other] = (freq[other] || 0) + 1;
        }
      });
    });
    const ranked = Object.entries(freq).sort((a, b) => b[1] * menu[b[0]].margin_pct - a[1] * menu[a[0]].margin_pct).slice(0, 3);
    return { id, name: menu[id].item_name, category: menu[id].category, subcategory: subId, suggestions: ranked.map(([sid, c]) => ({ id: sid, name: menu[sid].item_name, margin_pct: menu[sid].margin_pct, cnt: c, subcategory: menu[sid].subcategory })) };
  });

  const catAvgMap = {}, catMgns = {};
  activeWithSales.forEach((id) => { const c = menu[id].category; if (!catMgns[c]) catMgns[c] = []; catMgns[c].push(menu[id].margin_pct); });
  Object.entries(catMgns).forEach(([c, arr]) => { catAvgMap[c] = arr.reduce((a, b) => a + b, 0) / arr.length; });

  const priceOpts = [];
  activeWithSales.forEach((id) => {
    const m = menu[id], s = itemStats[id], avg = catAvgMap[m.category], gap = m.margin_pct - avg;
    if (gap < -1) {
      const suggested = Math.round(m.food_cost / (1 - avg / 100));
      const delta = suggested - m.selling_price;
      const uplift = delta * s.units;
      priceOpts.push({ id, name: m.item_name, category: m.category, subcategory: m.subcategory, currentPrice: m.selling_price, foodCost: m.food_cost, currentMargin: m.margin_pct, targetMargin: Math.round(avg * 10) / 10, suggestedPrice: suggested, delta: Math.round(delta), uplift: Math.round(uplift), units: s.units, perDay: Math.round((s.units / days) * 10) / 10, catAvg: Math.round(avg * 10) / 10, marginGap: Math.round(gap * 10) / 10, priority: Math.abs(gap) > 4 ? "High" : Math.abs(gap) > 2 ? "Medium" : "Low" });
    }
  });
  const pOrder = { High: 0, Medium: 1, Low: 2 };
  priceOpts.sort((a, b) => pOrder[a.priority] - pOrder[b.priority] || Math.abs(b.uplift) - Math.abs(a.uplift));

  const totalRevenue = txRaw.reduce((s, t) => s + +t.line_revenue, 0);
  const totalProfit = txRaw.reduce((s, t) => s + +t.line_contribution_margin, 0);

  return { matrix, topCombos, upsells, priceOpts, totalOrders, totalRevenue, totalProfit, aov: totalRevenue / totalOrders, avgMarginOverall: (totalProfit / totalRevenue) * 100, days, medUnits, medMargin, catRevenueData, catMarginData, topByMargin };
}

// ── Design tokens — PetPooja: black + orange ──────────────────────────────────
const F = "'Sora', 'Inter', system-ui, sans-serif";

const C = {
  // Backgrounds
  bg:         "#0f0f0f",
  surface:    "#1a1a1a",
  surfaceAlt: "#222222",
  surfaceHi:  "#2a2a2a",

  // Borders
  border:     "#2e2e2e",
  borderMd:   "#3d3d3d",

  // Text — warm off-white, readable on black
  text:       "#f5ede0",
  textMd:     "#c9b89e",
  textSub:    "#8a7560",
  textMute:   "#4d4233",

  // Primary — PetPooja orange
  orange:     "#ff6b1a",
  orangeDim:  "#cc5200",
  orangeBg:   "#1f1109",
  orangeBd:   "#5c2600",

  // Accents
  amber:      "#f59e0b",
  amberBg:    "#1a1200",
  amberBd:    "#6b4b00",

  green:      "#22c55e",
  greenBg:    "#071811",
  greenBd:    "#14532d",

  red:        "#f43f5e",
  redBg:      "#1a0509",
  redBd:      "#6b1028",

  blue:       "#60a5fa",
  blueBg:     "#060e1a",
  blueBd:     "#1e3a5f",

  purple:     "#a78bfa",
  purpleBg:   "#0d0a1a",
  purpleBd:   "#3b2a6e",

  teal:       "#2dd4bf",
  tealBg:     "#04110f",
  tealBd:     "#0f4741",

  slate:      "#94a3b8",
  slateBg:    "#111418",
  slateBd:    "#2d3748",

  // Chart palette — warm tones to complement orange on black
  COLORS: ["#ff6b1a", "#f59e0b", "#22c55e", "#60a5fa", "#a78bfa", "#f43f5e", "#2dd4bf", "#fb923c"],
};

// ── Charts ─────────────────────────────────────────────────────────────────────
function BarChart({ data, height = 155 }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.value));
  const n = data.length;
  const barW = Math.max(28, Math.min(48, Math.floor((380 - n * 6) / n)));
  const totalW = n * barW + (n - 1) * 6;
  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={Math.max(totalW, 300)} height={height + 40} viewBox={`0 0 ${Math.max(totalW, 300)} ${height + 40}`} style={{ fontFamily: F, display: "block" }}>
        {data.map((d, i) => {
          const bh = Math.max(4, (d.value / max) * (height - 16));
          const x = i * (barW + 6), y = height - bh;
          const label = d.name.length > 9 ? d.name.slice(0, 8) + "." : d.name;
          const col = C.COLORS[i % C.COLORS.length];
          return (
            <g key={d.name + i}>
              <rect x={x} y={y} width={barW} height={bh} rx={4} fill={col} opacity={0.9} />
              <rect x={x} y={y} width={barW} height={Math.min(3, bh)} rx={4} fill="#fff" opacity={0.15} />
              <text x={x + barW / 2} y={height + 14} textAnchor="middle" fontSize={9} fill={C.textSub} fontFamily={F}>{label}</text>
              <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize={8} fill={C.textMd} fontWeight="700" fontFamily={F}>{fmtShort(d.value)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function SpiderChart({ data, size = 210 }) {
  if (!data || data.length < 3) return null;
  const cx = size / 2, cy = size / 2, r = size * 0.33;
  const n = data.length;
  const maxVal = Math.max(...data.map((d) => d.value), 85);
  const angle = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i, val) => { const a = angle(i), rr = (val / maxVal) * r; return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)]; };
  const gridPoly = (scale) => Array.from({ length: n }, (_, i) => { const a = angle(i), rr = scale * r; return `${cx + rr * Math.cos(a)},${cy + rr * Math.sin(a)}`; }).join(" ");
  const dataPoints = data.map((d, i) => pt(i, d.value).join(",")).join(" ");
  return (
    <svg width={size} height={size} style={{ fontFamily: F, overflow: "visible", display: "block" }}>
      {[0.25, 0.5, 0.75, 1].map((sc) => (
        <polygon key={sc} points={gridPoly(sc)} fill="none" stroke={C.border} strokeWidth={1} />
      ))}
      {Array.from({ length: n }, (_, i) => { const [px, py] = pt(i, maxVal); return <line key={i} x1={cx} y1={cy} x2={px} y2={py} stroke={C.border} strokeWidth={1} />; })}
      <polygon points={dataPoints} fill={C.orange + "28"} stroke={C.orange} strokeWidth={2} />
      {data.map((d, i) => { const [px, py] = pt(i, d.value); return <circle key={i} cx={px} cy={py} r={4} fill={C.orange} stroke={C.surface} strokeWidth={1.5} />; })}
      {data.map((d, i) => {
        const a = angle(i), lx = cx + (r + 26) * Math.cos(a), ly = cy + (r + 26) * Math.sin(a);
        const label = d.name.length > 10 ? d.name.slice(0, 9) + "." : d.name;
        return (
          <g key={i}>
            <text x={lx} y={ly - 3} textAnchor="middle" fontSize={8.5} fontWeight="700" fill={C.textMd} fontFamily={F}>{label}</text>
            <text x={lx} y={ly + 8} textAnchor="middle" fontSize={8.5} fill={C.orange} fontFamily={F} fontWeight="600">{d.value}%</text>
          </g>
        );
      })}
    </svg>
  );
}

function HBarChart({ data }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.profit));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {data.map((d, i) => (
        <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 136, fontSize: 11, fontWeight: 600, color: C.textMd, textAlign: "right", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: F }}>{d.name}</div>
          <div style={{ flex: 1, height: 18, background: C.surfaceAlt, borderRadius: 5, overflow: "hidden", border: `1px solid ${C.border}` }}>
            <div style={{ height: "100%", width: `${(d.profit / max) * 100}%`, background: `linear-gradient(90deg, ${C.COLORS[i % C.COLORS.length]}, ${C.COLORS[i % C.COLORS.length]}99)`, borderRadius: 5, minWidth: 4 }} />
          </div>
          <div style={{ width: 60, fontSize: 11, fontWeight: 700, color: C.text, flexShrink: 0, textAlign: "right", fontFamily: F }}>{fmtINRSym(d.profit)}</div>
        </div>
      ))}
    </div>
  );
}

// ── Shared components ──────────────────────────────────────────────────────────
function Tag({ children, color, bg, bd }) {
  return (
    <span style={{ background: bg, color, border: `1px solid ${bd}`, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600, display: "inline-block", fontFamily: F, lineHeight: 1.6 }}>
      {children}
    </span>
  );
}

function KpiCard({ icon, label, value, color, bg, bd }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${bd || C.border}`, borderRadius: 14, padding: "18px 20px", boxShadow: `0 0 0 1px ${bd}22, 0 4px 20px rgba(0,0,0,0.4)`, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: color, opacity: 0.7, borderRadius: "14px 14px 0 0" }} />
      <div style={{ fontSize: 11, color: C.textSub, marginBottom: 6, fontFamily: F, display: "flex", alignItems: "center", gap: 5 }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color, fontFamily: F, letterSpacing: "-0.5px" }}>{value}</div>
    </div>
  );
}

function MatrixCard({ title, emoji, subtitle, items, color, bg, bd }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${bd}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.4)" }}>
      <div style={{ background: bg, padding: "16px 20px", borderBottom: `1px solid ${bd}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 26 }}>{emoji}</span>
          <div>
            <div style={{ fontSize: 32, fontWeight: 800, color, fontFamily: F, lineHeight: 1 }}>{items.length}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: F }}>{title}</div>
          </div>
        </div>
        <div style={{ fontSize: 11, color, marginTop: 5, opacity: 0.85, fontFamily: F }}>{subtitle}</div>
      </div>
      <div style={{ padding: "12px 16px", display: "flex", flexWrap: "wrap", gap: 6 }}>
        {items.map((item) => (
          <div key={item.id} style={{ background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 10px", fontSize: 12, display: "flex", gap: 5, alignItems: "center", fontFamily: F }}>
            <span style={{ fontWeight: 600, color: C.text }}>{item.name}</span>
            <span style={{ color, fontWeight: 700, fontSize: 11 }}>{item.margin_pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Pill({ label, value, color, bg, bd }) {
  return (
    <div style={{ background: bg || C.surfaceAlt, border: `1px solid ${bd || C.border}`, borderRadius: 8, padding: "7px 5px", textAlign: "center" }}>
      <div style={{ fontSize: 15, fontWeight: 800, color, fontFamily: F, lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 9.5, color: C.textSub, marginTop: 2, fontFamily: F }}>{label}</div>
    </div>
  );
}

function ComboCard({ combo }) {
  const sc =
    combo.strength === "Strong" ? { color: C.green, bg: C.greenBg, bd: C.greenBd }
    : combo.strength === "Moderate" ? { color: C.amber, bg: C.amberBg, bd: C.amberBd }
    : { color: C.red, bg: C.redBg, bd: C.redBd };
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, boxShadow: "0 4px 24px rgba(0,0,0,0.4)", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,${C.orange},${sc.color})`, borderRadius: "16px 16px 0 0" }} />
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 5 }}>
            <span style={{ fontWeight: 700, color: C.text, fontSize: 13, fontFamily: F }}>{combo.nameA}</span>
            <span style={{ color: C.orange, fontSize: 16, fontWeight: 800, lineHeight: 1 }}>+</span>
            <span style={{ fontWeight: 700, color: C.text, fontSize: 13, fontFamily: F }}>{combo.nameB}</span>
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
            <Tag color={C.blue} bg={C.blueBg} bd={C.blueBd}>{combo.subA}</Tag>
            {combo.subA !== combo.subB && (<><span style={{ color: C.textMute, fontSize: 9 }}>x</span><Tag color={C.purple} bg={C.purpleBg} bd={C.purpleBd}>{combo.subB}</Tag></>)}
            {combo.subA === combo.subB && (<span style={{ fontSize: 9, color: C.textMute, fontStyle: "italic", fontFamily: F }}>same cuisine</span>)}
          </div>
        </div>
        <Tag color={sc.color} bg={sc.bg} bd={sc.bd}>{combo.strength}</Tag>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginBottom: 12 }}>
        <Pill label="Lift" value={`${combo.lift.toFixed(1)}x`} color={sc.color} bg={sc.bg} bd={sc.bd} />
        <Pill label="Support" value={`${(combo.support * 100).toFixed(1)}%`} color={C.purple} bg={C.purpleBg} bd={C.purpleBd} />
        <Pill label="Co-orders" value={combo.cnt} color={C.blue} bg={C.blueBg} bd={C.blueBd} />
        <Pill label="Avg CM%" value={`${combo.avgMargin.toFixed(1)}%`} color={C.green} bg={C.greenBg} bd={C.greenBd} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
        <div style={{ background: C.orangeBg, border: `1px solid ${C.orangeBd}`, borderRadius: 8, padding: "6px 14px" }}>
          <div style={{ fontSize: 10, color: C.textSub, fontFamily: F }}>Bundle Price</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: C.orange, fontFamily: F }}>{fmtINRSym(combo.bundlePrice)}</div>
        </div>
        <div style={{ textAlign: "right", fontSize: 11, color: C.textSub, lineHeight: 1.8, fontFamily: F }}>
          <div>A-B: <b style={{ color: C.textMd }}>{(combo.confAB * 100).toFixed(1)}%</b></div>
          <div>B-A: <b style={{ color: C.textMd }}>{(combo.confBA * 100).toFixed(1)}%</b></div>
        </div>
      </div>
    </div>
  );
}

function PriceCard({ item }) {
  const pc =
    item.priority === "High" ? { color: C.red, bg: C.redBg, bd: C.redBd }
    : item.priority === "Medium" ? { color: C.amber, bg: C.amberBg, bd: C.amberBd }
    : { color: C.green, bg: C.greenBg, bd: C.greenBd };
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, boxShadow: "0 4px 24px rgba(0,0,0,0.4)", borderLeft: `3px solid ${pc.color}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 5, fontFamily: F }}>{item.name}</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <Tag color={pc.color} bg={pc.bg} bd={pc.bd}>{item.priority} Priority</Tag>
            <span style={{ fontSize: 11, color: C.textSub, fontFamily: F }}>{item.subcategory}</span>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: C.orange, fontFamily: F }}>{fmtINRSym(item.uplift)}</div>
          <div style={{ fontSize: 10, color: C.textSub, fontFamily: F }}>uplift potential</div>
        </div>
      </div>
      <div style={{ background: C.orangeBg, border: `1px solid ${C.orangeBd}`, borderRadius: 7, padding: "6px 12px", fontSize: 11, color: C.orange, marginBottom: 12, fontStyle: "italic", fontFamily: F }}>
        CM is {item.marginGap}% below {item.category} avg ({item.catAvg}%)
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {[
          { label: "Current", price: `\u20b9${item.currentPrice}`, pct: `${item.currentMargin}% CM`, color: C.textSub, bg: C.surfaceAlt, bd: C.border },
          { label: "Suggested", price: `\u20b9${item.suggestedPrice}`, pct: `${item.targetMargin}% target`, color: C.green, bg: C.greenBg, bd: C.greenBd },
          { label: "Delta", price: `+\u20b9${item.delta}`, pct: `+${Math.round((item.delta / item.currentPrice) * 100)}%`, color: C.orange, bg: C.orangeBg, bd: C.orangeBd },
        ].map((b) => (
          <div key={b.label} style={{ background: b.bg, border: `1px solid ${b.bd}`, borderRadius: 8, padding: "9px 6px", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: C.textSub, marginBottom: 2, fontFamily: F }}>{b.label}</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: b.color, fontFamily: F }}>{b.price}</div>
            <div style={{ fontSize: 10, color: b.color, opacity: 0.75, fontFamily: F }}>{b.pct}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: C.textSub, display: "flex", gap: 12, fontFamily: F }}>
        <span>Vol: <b style={{ color: C.textMd }}>{item.units}</b></span>
        <span>{item.perDay}/day</span>
      </div>
    </div>
  );
}

function UpsellCard({ item }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, boxShadow: "0 4px 24px rgba(0,0,0,0.4)" }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.orange, display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontFamily: F }}>
          <span style={{ fontSize: 12 }}>&#x25B2;</span> {item.name}
        </div>
        <Tag color={C.blue} bg={C.blueBg} bd={C.blueBd}>{item.subcategory}</Tag>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {item.suggestions.map((s, i) => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 9, background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 11px" }}>
            <span style={{ width: 20, height: 20, borderRadius: "50%", background: C.orangeBg, border: `1px solid ${C.orangeBd}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: C.orange, flexShrink: 0, fontFamily: F }}>
              {i + 1}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.text, fontFamily: F }}>{s.name}</div>
              <div style={{ fontSize: 10, color: C.textSub, fontFamily: F }}>{s.subcategory} &middot; {s.cnt}x co-ordered</div>
            </div>
            <Tag color={C.green} bg={C.greenBg} bd={C.greenBd}>{s.margin_pct}%</Tag>
          </div>
        ))}
      </div>
    </div>
  );
}

function SortBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{ padding: "5px 14px", borderRadius: 20, border: `1px solid ${active ? C.orange : C.border}`, background: active ? C.orangeBg : C.surface, color: active ? C.orange : C.textSub, fontSize: 12, fontWeight: active ? 700 : 500, cursor: "pointer", fontFamily: F, transition: "all 0.15s" }}>
      {children}
    </button>
  );
}

function UploadZone({ label, icon, file, onFile }) {
  const ref = useRef();
  const [drag, setDrag] = useState(false);
  const onDrop = (e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); };
  return (
    <div onClick={() => ref.current.click()} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}
      style={{ border: `2px dashed ${drag ? C.orange : file ? C.orangeBd : C.borderMd}`, borderRadius: 12, padding: "26px 16px", cursor: "pointer", textAlign: "center", background: drag ? C.orangeBg : file ? "#1f1109" : C.surface, transition: "all 0.2s" }}>
      <input ref={ref} type="file" accept=".csv" style={{ display: "none" }} onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} />
      <div style={{ fontSize: 30, marginBottom: 7 }}>{icon}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: file ? C.orange : C.textMd, wordBreak: "break-all", fontFamily: F }}>{file ? file.name : label}</div>
      <div style={{ fontSize: 11, color: C.textSub, marginTop: 3, fontFamily: F }}>{file ? "Click to replace" : "Drop CSV or click to browse"}</div>
    </div>
  );
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "matrix",   label: "Menu Matrix" },
  { id: "combos",   label: "Combos" },
  { id: "upsell",   label: "Upsell" },
  { id: "price",    label: "Pricing" },
  { id: "gems",     label: "Hidden Gems" },
  { id: "watch",    label: "Watch List" },
  { id: "voice",    label: "AI Voice Orders" },
];

// ── Main App ───────────────────────────────────────────────────────────────────
export default function App() {
  const [menuFile, setMenuFile] = useState(null);
  const [txFile, setTxFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("overview");
  const [comboSort, setComboSort] = useState("all");
  const [priceSort, setPriceSort] = useState("all");

  const handleAnalyze = useCallback(async () => {
    if (!menuFile || !txFile) return;
    setLoading(true); setError("");
    try {
      const [mt, tt] = await Promise.all([menuFile.text(), txFile.text()]);
      const menuRaw = parseCSV(mt), txRaw = parseCSV(tt);
      if (!menuRaw[0]?.item_id) throw new Error("Menu CSV missing required columns (item_id etc.)");
      if (!txRaw[0]?.order_id) throw new Error("Transactions CSV missing required columns (order_id etc.)");
      setAnalysis(runAnalysis(menuRaw, txRaw));
      setTab("overview");
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [menuFile, txFile]);

  const filteredCombos = useMemo(() => {
    if (!analysis) return [];
    if (comboSort === "all") return analysis.topCombos;
    return analysis.topCombos.filter((c) => c.strength === comboSort);
  }, [analysis, comboSort]);

  const filteredPriceOpts = useMemo(() => {
    if (!analysis) return [];
    if (priceSort === "all") return analysis.priceOpts;
    return analysis.priceOpts.filter((p) => p.priority === priceSort);
  }, [analysis, priceSort]);

  // ── Upload screen ──────────────────────────────────────────────────────────
  if (!analysis) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: F, padding: 24 }}>        {/* Background glow */}
        <div style={{ position: "fixed", top: "30%", left: "50%", transform: "translate(-50%,-50%)", width: 600, height: 600, background: `radial-gradient(circle, ${C.orange}18 0%, transparent 70%)`, pointerEvents: "none" }} />
        <div style={{ maxWidth: 560, width: "100%", position: "relative" }}>

          {/* Logo mark */}
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
              {/* Logo */}
              <div style={{ width: 52, height: 52, background: `linear-gradient(135deg, ${C.orange}, ${C.orangeDim})`, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 28px ${C.orange}55`, flexShrink: 0 }}>
                <span style={{ fontSize: 26 }}>🍳</span>
              </div>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: C.text, fontFamily: F, letterSpacing: "-0.5px", lineHeight: 1 }}>
                  Pet<span style={{ color: C.orange }}>Pooja</span>
                </div>
                <div style={{ fontSize: 11, color: C.textSub, letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: F }}>Revenue Intelligence</div>
              </div>
            </div>
            <p style={{ color: C.textSub, fontSize: 14, margin: 0, fontFamily: F }}>Upload your POS data to unlock AI-powered menu insights</p>
          </div>

          <div style={{ background: C.surface, borderRadius: 20, border: `1px solid ${C.border}`, padding: 28, boxShadow: `0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px ${C.border}` }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
              <UploadZone label="menu_items.csv" icon="📋" file={menuFile} onFile={setMenuFile} />
              <UploadZone label="transactions.csv" icon="🧾" file={txFile} onFile={setTxFile} />
            </div>
            <div style={{ background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px", marginBottom: 18, fontSize: 12, color: C.textSub, fontFamily: F }}>
              <div style={{ fontWeight: 700, color: C.textMd, marginBottom: 5 }}>Required columns</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <div><b style={{ color: C.purple }}>Menu:</b> item_id, item_name, category, selling_price, food_cost, margin_pct, status</div>
                <div><b style={{ color: C.blue }}>Transactions:</b> order_id, item_id, quantity, line_revenue, line_contribution_margin</div>
              </div>
            </div>
            {error && (
              <div style={{ background: C.redBg, border: `1px solid ${C.redBd}`, borderRadius: 8, padding: "10px 14px", color: C.red, fontSize: 13, marginBottom: 14, fontFamily: F }}>
                &#x26A0; {error}
              </div>
            )}
            <button onClick={handleAnalyze} disabled={!menuFile || !txFile || loading}
              style={{ width: "100%", padding: "15px", background: menuFile && txFile ? `linear-gradient(135deg,${C.orange},${C.orangeDim})` : C.surfaceAlt, color: menuFile && txFile ? "#fff" : C.textMute, border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: menuFile && txFile ? "pointer" : "not-allowed", letterSpacing: "0.01em", boxShadow: menuFile && txFile ? `0 4px 20px ${C.orange}55` : "none", fontFamily: F, transition: "all 0.2s" }}>
              {loading ? "Analysing..." : "Run Revenue Analysis"}
            </button>
          </div>
          <p style={{ textAlign: "center", fontSize: 11, color: C.textMute, marginTop: 14, fontFamily: F }}>All processing happens in your browser — your data never leaves your device</p>
        </div>
      </div>
    );
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────
  const { matrix, upsells, totalOrders, totalRevenue, totalProfit, aov, avgMarginOverall, days, catRevenueData, catMarginData, topByMargin } = analysis;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F, color: C.text }}>
      {/* Header */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "13px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, background: `linear-gradient(135deg,${C.orange},${C.orangeDim})`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, boxShadow: `0 0 16px ${C.orange}44`, flexShrink: 0 }}>
            🍳
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.text, fontFamily: F, letterSpacing: "-0.3px" }}>
              Pet<span style={{ color: C.orange }}>Pooja</span>
            </div>
            <div style={{ fontSize: 11, color: C.textSub, fontFamily: F }}>{days} days &middot; {totalOrders.toLocaleString()} orders</div>
          </div>
        </div>
        <button onClick={() => { setAnalysis(null); setMenuFile(null); setTxFile(null); setTab("overview"); }}
          style={{ background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 16px", color: C.textMd, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: F }}>
          New Upload
        </button>
      </div>

      {/* Tab nav */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "0 24px", display: "flex", overflowX: "auto", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ background: "transparent", color: tab === t.id ? C.orange : C.textSub, borderTop: "none", borderLeft: "none", borderRight: "none", borderBottom: `3px solid ${tab === t.id ? C.orange : "transparent"}`, padding: "12px 18px", cursor: "pointer", fontSize: 13, fontWeight: tab === t.id ? 700 : 500, whiteSpace: "nowrap", outline: "none", fontFamily: F, transition: "color 0.15s" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>

        {/* OVERVIEW */}
        {tab === "overview" && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: "0 0 4px", fontFamily: F, letterSpacing: "-0.3px" }}>Dashboard Overview</h2>
              <p style={{ color: C.textSub, fontSize: 13, margin: 0, fontFamily: F }}>{days} days of trading data &middot; {totalOrders.toLocaleString()} total orders</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 14, marginBottom: 24 }}>
              <KpiCard icon="💰" label="Total Revenue" value={fmtINRSym(totalRevenue)} color={C.orange} bg={C.orangeBg} bd={C.orangeBd} />
              <KpiCard icon="📈" label="Total Profit" value={fmtINRSym(totalProfit)} color={C.green} bg={C.greenBg} bd={C.greenBd} />
              <KpiCard icon="🛍️" label="Avg Order Value" value={fmtINRSym(aov)} color={C.amber} bg={C.amberBg} bd={C.amberBd} />
              <KpiCard icon="📊" label="Avg Margin" value={`${avgMarginOverall.toFixed(1)}%`} color={C.blue} bg={C.blueBg} bd={C.blueBd} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "20px 20px 16px", boxShadow: "0 4px 24px rgba(0,0,0,0.4)" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 3, fontFamily: F }}>Revenue by Category</div>
                <div style={{ fontSize: 11, color: C.textSub, marginBottom: 16, fontFamily: F }}>Total revenue per cuisine segment</div>
                <BarChart data={catRevenueData} height={155} />
              </div>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, boxShadow: "0 4px 24px rgba(0,0,0,0.4)", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ width: "100%" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 3, fontFamily: F }}>Margin % by Category</div>
                  <div style={{ fontSize: 11, color: C.textSub, marginBottom: 10, fontFamily: F }}>Average contribution margin per cuisine</div>
                </div>
                <SpiderChart data={catMarginData} size={210} />
              </div>
            </div>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, boxShadow: "0 4px 24px rgba(0,0,0,0.4)" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 3, fontFamily: F }}>Top 10 Items by Contribution Margin</div>
              <div style={{ fontSize: 11, color: C.textSub, marginBottom: 16, fontFamily: F }}>Total profit generated per item across all orders</div>
              <HBarChart data={topByMargin} />
            </div>
          </div>
        )}

        {/* MATRIX */}
        {tab === "matrix" && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, fontFamily: F, marginBottom: 4, color: C.text, letterSpacing: "-0.3px" }}>Menu Engineering Matrix</h2>
            <p style={{ color: C.textSub, fontSize: 13, marginBottom: 20, fontFamily: F }}>Median thresholds &mdash; Units: {Math.round(analysis.medUnits)} &middot; Margin: {analysis.medMargin}%</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 }}>
              <MatrixCard title="Stars" emoji="⭐" subtitle="High margin · High volume — Protect & promote" items={matrix.Stars} color={C.amber} bg={C.amberBg} bd={C.amberBd} />
              <MatrixCard title="Hidden Gems" emoji="💎" subtitle="High margin · Low volume — Under-promoted" items={matrix["Hidden Gems"]} color={C.purple} bg={C.purpleBg} bd={C.purpleBd} />
              <MatrixCard title="Watch List" emoji="⚠️" subtitle="Low margin · High volume — Review pricing" items={matrix["Watch List"]} color={C.red} bg={C.redBg} bd={C.redBd} />
              <MatrixCard title="Laggards" emoji="📉" subtitle="Low margin · Low volume — Consider removing" items={matrix.Laggards} color={C.slate} bg={C.slateBg} bd={C.slateBd} />
            </div>
          </div>
        )}

        {/* COMBOS */}
        {tab === "combos" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800, fontFamily: F, marginBottom: 4, color: C.text, letterSpacing: "-0.3px" }}>Combo Opportunity Cards</h2>
                <p style={{ color: C.textSub, fontSize: 13, margin: 0, fontFamily: F }}>Cuisine-matched combos &mdash; {filteredCombos.length} showing</p>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {["all", "Strong", "Moderate", "Weak"].map((s) => (
                  <SortBtn key={s} active={comboSort === s} onClick={() => setComboSort(s)}>{s === "all" ? "All" : s}</SortBtn>
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(290px,1fr))", gap: 16 }}>
              {filteredCombos.map((c, i) => <ComboCard key={i} combo={c} />)}
            </div>
            {filteredCombos.length === 0 && <div style={{ textAlign: "center", padding: 40, color: C.textSub, fontFamily: F }}>No combos found for this filter.</div>}
          </div>
        )}

        {/* UPSELL */}
        {tab === "upsell" && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, fontFamily: F, marginBottom: 4, color: C.text, letterSpacing: "-0.3px" }}>Smart Upsell Engine</h2>
            <p style={{ color: C.textSub, fontSize: 13, marginBottom: 20, fontFamily: F }}>Cuisine-matched suggestions ranked by co-order frequency x margin</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 }}>
              {upsells.map((u, i) => <UpsellCard key={i} item={u} />)}
            </div>
          </div>
        )}

        {/* PRICE */}
        {tab === "price" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800, fontFamily: F, marginBottom: 4, color: C.text, letterSpacing: "-0.3px" }}>Price Optimization Engine</h2>
                <p style={{ color: C.textSub, fontSize: 13, margin: 0, fontFamily: F }}>Items below category avg margin &mdash; {filteredPriceOpts.length} showing</p>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {["all", "High", "Medium", "Low"].map((s) => (
                  <SortBtn key={s} active={priceSort === s} onClick={() => setPriceSort(s)}>{s === "all" ? "All" : s}</SortBtn>
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16 }}>
              {filteredPriceOpts.map((p, i) => <PriceCard key={i} item={p} />)}
            </div>
            {filteredPriceOpts.length === 0 && <div style={{ textAlign: "center", padding: 40, color: C.textSub, fontFamily: F }}>No items match this priority.</div>}
          </div>
        )}

        {/* GEMS */}
        {tab === "gems" && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, fontFamily: F, marginBottom: 4, color: C.text, letterSpacing: "-0.3px" }}>Hidden Gems Strategy</h2>
            <p style={{ color: C.textSub, fontSize: 13, marginBottom: 20, fontFamily: F }}>High-margin items with untapped volume — prime candidates for promotion</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16 }}>
              {matrix["Hidden Gems"].map((item) => (
                <div key={item.id} style={{ background: C.surface, border: `1px solid ${C.purpleBd}`, borderRadius: 16, padding: 20, boxShadow: "0 4px 24px rgba(0,0,0,0.4)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 5, fontFamily: F }}>{item.name}</div>
                      <Tag color={C.purple} bg={C.purpleBg} bd={C.purpleBd}>{item.subcategory}</Tag>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: C.purple, fontFamily: F }}>{item.margin_pct}%</div>
                      <div style={{ fontSize: 10, color: C.textSub, fontFamily: F }}>margin</div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
                    {[["Units", item.units], ["Revenue", fmtINRSym(item.revenue)], ["Profit", fmtINRSym(item.profit)]].map(([l, v]) => (
                      <div key={l} style={{ background: C.purpleBg, border: `1px solid ${C.purpleBd}`, borderRadius: 8, padding: "8px 6px", textAlign: "center" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.purple, fontFamily: F }}>{v}</div>
                        <div style={{ fontSize: 10, color: C.textSub, fontFamily: F }}>{l}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, fontSize: 12 }}>
                    <div style={{ fontWeight: 700, color: C.orange, marginBottom: 6, fontFamily: F }}>Recommended Actions</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, color: C.textMd, fontFamily: F }}>
                      <div>Include in combo with high-traffic Star items</div>
                      <div>Upsell prompt on similar category orders</div>
                      <div>Reposition to top section in menu / app</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* WATCH */}
        {tab === "watch" && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, fontFamily: F, marginBottom: 4, color: C.text, letterSpacing: "-0.3px" }}>Watch List Strategy</h2>
            <p style={{ color: C.textSub, fontSize: 13, marginBottom: 20, fontFamily: F }}>High-volume items with below-average margins — small pricing tweaks yield big gains</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16 }}>
              {matrix["Watch List"].map((item) => (
                <div key={item.id} style={{ background: C.surface, border: `1px solid ${C.redBd}`, borderRadius: 16, padding: 20, boxShadow: "0 4px 24px rgba(0,0,0,0.4)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 5, fontFamily: F }}>{item.name}</div>
                      <Tag color={C.red} bg={C.redBg} bd={C.redBd}>{item.subcategory}</Tag>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: C.red, fontFamily: F }}>{item.margin_pct}%</div>
                      <div style={{ fontSize: 10, color: C.textSub, fontFamily: F }}>margin</div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
                    {[["Units", item.units], ["Revenue", fmtINRSym(item.revenue)], ["Profit", fmtINRSym(item.profit)]].map(([l, v]) => (
                      <div key={l} style={{ background: C.redBg, border: `1px solid ${C.redBd}`, borderRadius: 8, padding: "8px 6px", textAlign: "center" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.red, fontFamily: F }}>{v}</div>
                        <div style={{ fontSize: 10, color: C.textSub, fontFamily: F }}>{l}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, fontSize: 12 }}>
                    <div style={{ fontWeight: 700, color: C.orange, marginBottom: 6, fontFamily: F }}>Recommended Actions</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, color: C.textMd, fontFamily: F }}>
                      <div>Price adjustment — small increase to close margin gap</div>
                      <div>Cost optimise — review supplier or portion size</div>
                      <div>Bundle reposition — pair with high-margin sides</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI VOICE ORDERS */}
        {tab === "voice" && (
          <Suspense fallback={
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
              <div style={{ color: C.textSub, fontFamily: F }}>Loading AI Voice Orders...</div>
            </div>
          }>
            <AIVoiceOrdersTab />
          </Suspense>
        )}

      </div>
    </div>
  );
}
