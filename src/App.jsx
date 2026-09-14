import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList,
} from "recharts";

const STORAGE_KEY = "suivi-permis-data-v1";

const CATEGORIES = ["B", "AAC", "CS", "BA", "BA AAC", "BA CS"];

const MONTHS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
const MONTHS_LONG = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

const DEFAULT_ERROR_TYPES = [
  "Stop / cédez-le-passage non respecté",
  "Feu rouge grillé",
  "Priorité à droite non respectée",
  "Priorité piéton non respectée",
  "Dépassement dangereux",
  "Vitesse excessive ou inadaptée",
  "Non-maîtrise du véhicule (cale, recul...)",
  "Manœuvre dangereuse (créneau, marche arrière...)",
  "Non-respect des distances de sécurité",
  "Franchissement de ligne continue",
  "Angle mort non vérifié",
  "Non-respect de la signalisation",
  "Mise en danger d'un usager",
];

const PALETTE = ["#1B4B7A", "#C0272D", "#E8A93A", "#3E7C59", "#7B5EA7", "#2F8FA6", "#B5651D", "#5B6570", "#8B3A62", "#4C6B22", "#A6412C", "#356B8C", "#8A7E3E"];

function renderPieLabel(props) {
  const { cx, cy, midAngle, innerRadius, outerRadius, percent, payload } = props;
  if (!percent || percent < 0.04) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.62;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700}>
      {`${payload.pct}%`}
    </text>
  );
}

function computeDistribution(entries, getKey) {
  const counts = {};
  entries.forEach((entry) => {
    const key = getKey(entry);
    if (!key) return;
    counts[key] = (counts[key] || 0) + 1;
  });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return Object.entries(counts)
    .map(([name, value]) => ({ name, value, pct: total ? Math.round((value / total) * 1000) / 10 : 0 }))
    .sort((a, b) => b.value - a.value);
}

function computeRateDistribution(entries, getKey) {
  const groups = {};
  entries.forEach((entry) => {
    const key = getKey(entry);
    if (!key) return;
    if (!groups[key]) groups[key] = { total: 0, reussites: 0 };
    groups[key].total += 1;
    if (entry.resultat === "Réussite") groups[key].reussites += 1;
  });
  return Object.entries(groups)
    .map(([label, g]) => {
      const taux = g.total ? Math.round((g.reussites / g.total) * 1000) / 10 : 0;
      const tauxEchec = g.total ? Math.round(100 - taux) : 0;
      return {
        label,
        total: g.total,
        reussites: g.reussites,
        echecs: g.total - g.reussites,
        taux,
        tauxEchec,
        pctReussiteLabel: g.reussites > 0 ? `${taux}%` : "",
        pctEchecLabel: g.total - g.reussites > 0 ? `${tauxEchec}%` : "",
      };
    })
    .sort((a, b) => b.total - a.total);
}

function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

function formatDateFr(dateStr) {
  if (!dateStr) return "—";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
}

function exportBackup(data) {
  const payload = {
    app: "suivi-permis",
    version: 1,
    exportedAt: new Date().toISOString(),
    entries: data.entries,
    errorTypes: data.errorTypes,
    waitlistOrder: data.waitlistOrder,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `suivi-permis-sauvegarde-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        entries: parsed.entries || [],
        errorTypes: parsed.errorTypes && parsed.errorTypes.length ? parsed.errorTypes : DEFAULT_ERROR_TYPES.map((label) => ({ id: uid(), label })),
        waitlistOrder: parsed.waitlistOrder || [],
      };
    }
  } catch (e) { /* ignore corrupt storage */ }
  return { entries: [], errorTypes: DEFAULT_ERROR_TYPES.map((label) => ({ id: uid(), label })), waitlistOrder: [] };
}

const emptyForm = {
  eleve: "",
  date: new Date().toISOString().slice(0, 10),
  categorie: "B",
  centre: "",
  inspecteur: "",
  moniteur: "",
  heuresNous: "",
  heuresAutre: "",
  passages: "1",
  resultat: "Échec",
  erreursElim: [],
  remarques: "",
};

export default function App() {
  const [data, setData] = useState(loadData);
  const [tab, setTab] = useState("dashboard");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const [newErrorLabel, setNewErrorLabel] = useState("");
  const [compact, setCompact] = useState(false);
  const [filterCat, setFilterCat] = useState("Toutes");
  const [filterCentre, setFilterCentre] = useState("Tous");
  const [filterInspecteur, setFilterInspecteur] = useState("Tous");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [barView, setBarView] = useState("mois"); // "mois" | "annee"
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(null); // { year, month } (0-indexed) when viewing a month detail
  const fileInputRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) { /* storage full or unavailable */ }
  }, [data]);

  function handleImportFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!parsed || !Array.isArray(parsed.entries)) throw new Error("format invalide");
        const ok = window.confirm(
          `Importer cette sauvegarde va remplacer toutes les données actuelles (${parsed.entries.length} fiche(s) dans le fichier). Continuer ?`
        );
        if (!ok) return;
        setData({
          entries: parsed.entries || [],
          errorTypes: parsed.errorTypes && parsed.errorTypes.length ? parsed.errorTypes : DEFAULT_ERROR_TYPES.map((label) => ({ id: uid(), label })),
          waitlistOrder: parsed.waitlistOrder || [],
        });
        setSelectedMonth(null);
        setTab("dashboard");
      } catch (err) {
        window.alert("Ce fichier ne ressemble pas à une sauvegarde Suivi Permis valide.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const errorLabelById = useMemo(() => {
    const m = {};
    data.errorTypes.forEach((e) => { m[e.id] = e.label; });
    return m;
  }, [data.errorTypes]);

  const centres = useMemo(() => Array.from(new Set(data.entries.map((e) => e.centre).filter(Boolean))), [data.entries]);
  const inspecteurs = useMemo(() => Array.from(new Set(data.entries.map((e) => e.inspecteur).filter(Boolean))), [data.entries]);
  const moniteurs = useMemo(() => Array.from(new Set(data.entries.map((e) => e.moniteur).filter(Boolean))), [data.entries]);

  const filteredEntries = useMemo(() => {
    return data.entries.filter((e) => {
      if (filterCat !== "Toutes" && e.categorie !== filterCat) return false;
      if (filterCentre !== "Tous" && e.centre !== filterCentre) return false;
      if (filterInspecteur !== "Tous" && e.inspecteur !== filterInspecteur) return false;
      return true;
    });
  }, [data.entries, filterCat, filterCentre, filterInspecteur]);

  const pieData = useMemo(() => {
    const counts = {};
    filteredEntries.forEach((entry) => {
      entry.erreursElim.forEach((errId) => {
        const label = errorLabelById[errId] || "Erreur supprimée";
        counts[label] = (counts[label] || 0) + 1;
      });
    });
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value, pct: total ? Math.round((value / total) * 1000) / 10 : 0 }))
      .sort((a, b) => b.value - a.value);
  }, [filteredEntries, errorLabelById]);

  const totalOccurrences = pieData.reduce((a, b) => a + b.value, 0);

  const centreData = useMemo(
    () => computeDistribution(filteredEntries, (e) => e.centre || null),
    [filteredEntries]
  );
  const totalCentre = centreData.reduce((a, b) => a + b.value, 0);

  const categorieData = useMemo(
    () => computeDistribution(filteredEntries, (e) => e.categorie || null),
    [filteredEntries]
  );
  const totalCategorie = categorieData.reduce((a, b) => a + b.value, 0);

  const centreRateData = useMemo(
    () => computeRateDistribution(filteredEntries, (e) => e.centre || null),
    [filteredEntries]
  );

  const inspecteurRateData = useMemo(
    () => computeRateDistribution(filteredEntries, (e) => e.inspecteur || null),
    [filteredEntries]
  );

  const moniteurData = useMemo(
    () => computeDistribution(filteredEntries, (e) => e.moniteur || null),
    [filteredEntries]
  );
  const totalMoniteur = moniteurData.reduce((a, b) => a + b.value, 0);

  const echecEntries = useMemo(
    () => data.entries.filter((e) => e.resultat === "Échec" && e.date),
    [data.entries]
  );

  const naturalOrderIds = useMemo(
    () => echecEntries.slice().sort((a, b) => new Date(a.date) - new Date(b.date)).map((e) => e.id),
    [echecEntries]
  );

  const waitlist = useMemo(() => {
    const entryById = {};
    echecEntries.forEach((e) => { entryById[e.id] = e; });
    const echecIdSet = new Set(echecEntries.map((e) => e.id));

    let order = (data.waitlistOrder || []).filter((id) => echecIdSet.has(id));
    const missing = naturalOrderIds.filter((id) => !order.includes(id));
    missing.forEach((id) => {
      const entryDate = new Date(entryById[id].date);
      let insertAt = order.length;
      for (let i = 0; i < order.length; i++) {
        if (entryDate < new Date(entryById[order[i]].date)) { insertAt = i; break; }
      }
      order.splice(insertAt, 0, id);
    });

    const naturalIndexMap = {};
    naturalOrderIds.forEach((id, i) => { naturalIndexMap[id] = i + 1; });

    return order.map((id, i) => ({
      entry: entryById[id],
      naturalIndex: naturalIndexMap[id],
      currentIndex: i + 1,
      moved: naturalIndexMap[id] !== i + 1,
    }));
  }, [echecEntries, naturalOrderIds, data.waitlistOrder]);

  function reorderWaitlist(newOrderIds) {
    setData((d) => ({ ...d, waitlistOrder: newOrderIds }));
  }

  function resetWaitlistOrder() {
    setData((d) => ({ ...d, waitlistOrder: [] }));
  }

  function entryYearMonth(entry) {
    if (!entry.date) return null;
    const d = new Date(entry.date);
    if (Number.isNaN(d.getTime())) return null;
    return { year: d.getFullYear(), month: d.getMonth() };
  }

  const availableYears = useMemo(() => {
    const years = new Set();
    filteredEntries.forEach((e) => {
      const ym = entryYearMonth(e);
      if (ym) years.add(ym.year);
    });
    if (!years.size) years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [filteredEntries]);

  const monthlyStats = useMemo(() => {
    return MONTHS.map((label, monthIdx) => {
      const entriesInMonth = filteredEntries.filter((e) => {
        const ym = entryYearMonth(e);
        return ym && ym.year === selectedYear && ym.month === monthIdx;
      });
      const total = entriesInMonth.length;
      const reussites = entriesInMonth.filter((e) => e.resultat === "Réussite").length;
      const echecs = total - reussites;
      const taux = total ? Math.round((reussites / total) * 1000) / 10 : null;
      const tauxEchec = total ? Math.round(100 - taux) : null;
      return {
        label, monthIdx, year: selectedYear, total, reussites, echecs, taux, tauxEchec,
        pctReussiteLabel: reussites > 0 ? `${taux}%` : "",
        pctEchecLabel: echecs > 0 ? `${tauxEchec}%` : "",
      };
    });
  }, [filteredEntries, selectedYear]);

  const yearlyStats = useMemo(() => {
    return availableYears
      .slice()
      .sort((a, b) => a - b)
      .map((year) => {
        const entriesInYear = filteredEntries.filter((e) => {
          const ym = entryYearMonth(e);
          return ym && ym.year === year;
        });
        const total = entriesInYear.length;
        const reussites = entriesInYear.filter((e) => e.resultat === "Réussite").length;
        const echecs = total - reussites;
        const taux = total ? Math.round((reussites / total) * 1000) / 10 : null;
        const tauxEchec = total ? Math.round(100 - taux) : null;
        return {
          label: String(year), year, total, reussites, echecs, taux, tauxEchec,
          pctReussiteLabel: reussites > 0 ? `${taux}%` : "",
          pctEchecLabel: echecs > 0 ? `${tauxEchec}%` : "",
        };
      });
  }, [filteredEntries, availableYears]);

  const monthDetail = useMemo(() => {
    if (!selectedMonth) return null;
    const entriesInMonth = filteredEntries.filter((e) => {
      const ym = entryYearMonth(e);
      return ym && ym.year === selectedMonth.year && ym.month === selectedMonth.month;
    });
    const total = entriesInMonth.length;
    const reussites = entriesInMonth.filter((e) => e.resultat === "Réussite").length;
    const echecs = total - reussites;
    const taux = total ? Math.round((reussites / total) * 1000) / 10 : 0;
    const resultatPie = total
      ? [
          { name: "Réussite", value: reussites, pct: Math.round((reussites / total) * 1000) / 10 },
          { name: "Échec", value: echecs, pct: Math.round((echecs / total) * 1000) / 10 },
        ].filter((s) => s.value > 0)
      : [];
    const erreursPie = computeDistribution(
      entriesInMonth.flatMap((e) => e.erreursElim.map((id) => errorLabelById[id]).filter(Boolean)),
      (label) => label
    );
    return {
      year: selectedMonth.year, month: selectedMonth.month, total, reussites, echecs, taux,
      resultatPie, erreursPie,
    };
  }, [selectedMonth, filteredEntries, errorLabelById]);

  function goToMonth(year, month) {
    if (year == null || month == null) return;
    setSelectedMonth({ year, month });
  }


  const stats = useMemo(() => {
    const n = filteredEntries.length;
    const reussites = filteredEntries.filter((e) => e.resultat === "Réussite").length;
    const tauxReussite = n ? `${Math.round((reussites / n) * 1000) / 10}%` : "—";
    const avgPassages = n ? (filteredEntries.reduce((s, e) => s + (Number(e.passages) || 0), 0) / n).toFixed(1) : "—";
    const avgHeuresNous = n ? (filteredEntries.reduce((s, e) => s + (Number(e.heuresNous) || 0), 0) / n).toFixed(1) : "—";
    const topInspecteur = (() => {
      const c = {};
      filteredEntries.forEach((e) => { if (e.inspecteur) c[e.inspecteur] = (c[e.inspecteur] || 0) + 1; });
      const sorted = Object.entries(c).sort((a, b) => b[1] - a[1]);
      return sorted[0] ? `${sorted[0][0]} (${sorted[0][1]})` : "—";
    })();
    return { n, tauxReussite, avgPassages, avgHeuresNous, topInspecteur };
  }, [filteredEntries]);

  function resetForm() { setForm(emptyForm); setEditingId(null); setFormErrors({}); }

  function toggleError(id) {
    setForm((f) => ({
      ...f,
      erreursElim: f.erreursElim.includes(id) ? f.erreursElim.filter((x) => x !== id) : [...f.erreursElim, id],
    }));
  }

  function addErrorType() {
    const label = newErrorLabel.trim();
    if (!label) return;
    const exists = data.errorTypes.find((e) => e.label.toLowerCase() === label.toLowerCase());
    if (exists) { toggleError(exists.id); setNewErrorLabel(""); return; }
    const newType = { id: uid(), label };
    setData((d) => ({ ...d, errorTypes: [...d.errorTypes, newType] }));
    setForm((f) => ({ ...f, erreursElim: [...f.erreursElim, newType.id] }));
    setNewErrorLabel("");
  }

  function validateForm(f) {
    const errors = {};
    if (!f.eleve || !f.eleve.trim()) errors.eleve = "Le nom de l'élève est obligatoire.";
    if (!f.date) errors.date = "La date de l'examen est obligatoire.";
    return errors;
  }

  function submitForm(e) {
    e.preventDefault();
    const errors = validateForm(form);
    if (Object.keys(errors).length) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});
    if (editingId) {
      setData((d) => ({ ...d, entries: d.entries.map((en) => (en.id === editingId ? { ...form, id: editingId } : en)) }));
    } else {
      setData((d) => ({ ...d, entries: [{ ...form, id: uid() }, ...d.entries] }));
    }
    resetForm();
    setTab("liste");
  }

  function editEntry(entry) {
    setForm({ ...emptyForm, ...entry });
    setEditingId(entry.id);
    setFormErrors({});
    setTab("nouvelle");
  }

  function deleteEntry(id) {
    setData((d) => ({ ...d, entries: d.entries.filter((e) => e.id !== id) }));
    setConfirmDelete(null);
  }

  return (
    <div className="app">
      <style>{CSS}</style>

      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark">P</span>
            <div className="brand-text">
              <h1>Suivi Permis</h1>
              <p>Statistiques d'examen — auto-école</p>
            </div>
          </div>
          <nav className="tabs">
            <button className={tab === "dashboard" ? "active" : ""} onClick={() => { setSelectedMonth(null); setTab("dashboard"); }}>Tableau de bord</button>
            <button className={tab === "nouvelle" ? "active" : ""} onClick={() => { resetForm(); setTab("nouvelle"); }}>Nouvelle fiche</button>
            <button className={tab === "liste" ? "active" : ""} onClick={() => setTab("liste")}>Toutes les fiches</button>
            <button className={tab === "attente" ? "active" : ""} onClick={() => setTab("attente")}>Liste d'attente</button>
          </nav>

          <div className="backup-actions">
            <button type="button" className="backup-btn" onClick={() => exportBackup(data)}>💾 Sauvegarder</button>
            <button type="button" className="backup-btn ghost" onClick={() => fileInputRef.current && fileInputRef.current.click()}>📂 Importer une sauvegarde</button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              onChange={handleImportFile}
              style={{ display: "none" }}
            />
          </div>
        </div>
        <div className="roadline" />
      </header>

      <main className="content">
        {tab === "dashboard" && selectedMonth && (
          <MonthDetail
            detail={monthDetail}
            onBack={() => setSelectedMonth(null)}
          />
        )}

        {tab === "dashboard" && !selectedMonth && (
          <Dashboard
            pieData={pieData}
            totalOccurrences={totalOccurrences}
            centreData={centreData}
            totalCentre={totalCentre}
            categorieData={categorieData}
            totalCategorie={totalCategorie}
            centreRateData={centreRateData}
            inspecteurRateData={inspecteurRateData}
            stats={stats}
            filterCat={filterCat}
            setFilterCat={setFilterCat}
            filterCentre={filterCentre}
            setFilterCentre={setFilterCentre}
            filterInspecteur={filterInspecteur}
            setFilterInspecteur={setFilterInspecteur}
            centres={centres}
            inspecteurs={inspecteurs}
            barView={barView}
            setBarView={setBarView}
            selectedYear={selectedYear}
            setSelectedYear={setSelectedYear}
            availableYears={availableYears}
            monthlyStats={monthlyStats}
            yearlyStats={yearlyStats}
            goToMonth={goToMonth}
            setBarViewToMonth={() => setBarView("mois")}
            moniteurData={moniteurData}
            totalMoniteur={totalMoniteur}
          />
        )}

        {tab === "nouvelle" && (
          <FormView
            form={form}
            setForm={setForm}
            errorTypes={data.errorTypes}
            toggleError={toggleError}
            newErrorLabel={newErrorLabel}
            setNewErrorLabel={setNewErrorLabel}
            addErrorType={addErrorType}
            submitForm={submitForm}
            editingId={editingId}
            resetForm={resetForm}
            centres={centres}
            inspecteurs={inspecteurs}
            moniteurs={moniteurs}
            formErrors={formErrors}
          />
        )}

        {tab === "liste" && (
          <ListView
            entries={data.entries}
            errorLabelById={errorLabelById}
            compact={compact}
            setCompact={setCompact}
            editEntry={editEntry}
            confirmDelete={confirmDelete}
            setConfirmDelete={setConfirmDelete}
            deleteEntry={deleteEntry}
          />
        )}

        {tab === "attente" && (
          <WaitlistView
            waitlist={waitlist}
            reorderWaitlist={reorderWaitlist}
            resetWaitlistOrder={resetWaitlistOrder}
            errorLabelById={errorLabelById}
          />
        )}
      </main>
    </div>
  );
}

function Dashboard({
  pieData, totalOccurrences,
  centreData, totalCentre,
  categorieData, totalCategorie,
  centreRateData, inspecteurRateData,
  stats,
  filterCat, setFilterCat,
  filterCentre, setFilterCentre,
  filterInspecteur, setFilterInspecteur,
  centres, inspecteurs,
  barView, setBarView,
  selectedYear, setSelectedYear,
  availableYears,
  monthlyStats, yearlyStats,
  goToMonth, setBarViewToMonth,
  moniteurData, totalMoniteur,
}) {
  const filtersActive = filterCat !== "Toutes" || filterCentre !== "Tous" || filterInspecteur !== "Tous";
  const barData = barView === "mois" ? monthlyStats : yearlyStats;

  function handleBarClick(entry) {
    if (!entry || entry.total === 0) return;
    if (barView === "mois") {
      goToMonth(entry.year, entry.monthIdx);
    } else {
      setSelectedYear(entry.year);
      setBarViewToMonth();
    }
  }

  return (
    <div className="dashboard">
      <div className="card-row">
        <StatCard label="Fiches enregistrées" value={stats.n} />
        <StatCard label="Taux de réussite" value={stats.tauxReussite} />
        <StatCard label="Passages moyens" value={stats.avgPassages} />
        <StatCard label="Heures moyennes (nous)" value={stats.avgHeuresNous} />
        <StatCard label="Inspecteur le + rencontré" value={stats.topInspecteur} small />
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Filtres</h2>
          {filtersActive && (
            <button
              type="button"
              className="link-btn"
              onClick={() => { setFilterCat("Toutes"); setFilterCentre("Tous"); setFilterInspecteur("Tous"); }}
            >
              Réinitialiser les filtres
            </button>
          )}
        </div>

        <div className="filter-row">
          <label className="filter-field">
            <span>Catégorie</span>
            <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
              <option>Toutes</option>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>

          <label className="filter-field">
            <span>Centre d'examen</span>
            <select value={filterCentre} onChange={(e) => setFilterCentre(e.target.value)}>
              <option>Tous</option>
              {centres.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>

          <label className="filter-field">
            <span>Inspecteur</span>
            <select value={filterInspecteur} onChange={(e) => setFilterInspecteur(e.target.value)}>
              <option>Tous</option>
              {inspecteurs.map((i) => <option key={i}>{i}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Taux de réussite</h2>
          <div className="bar-controls">
            <div className="segmented small">
              <button type="button" className={barView === "mois" ? "active" : ""} onClick={() => setBarView("mois")}>Par mois</button>
              <button type="button" className={barView === "annee" ? "active" : ""} onClick={() => setBarView("annee")}>Par année</button>
            </div>
            {barView === "mois" && (
              <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}>
                {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
          </div>
        </div>

        <p className="hint">Clique sur une barre {barView === "mois" ? "pour voir le résumé du mois" : "pour passer à la vue mensuelle de cette année"}.</p>

        <RateBarChart data={barData} onBarClick={handleBarClick} clickable emptyText="Aucune fiche pour le moment." />
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Taux de réussite par centre d'examen</h2>
        </div>
        <RateBarChart data={centreRateData} emptyText="Aucun centre d'examen renseigné pour le moment." />
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Taux de réussite par inspecteur</h2>
        </div>
        <RateBarChart data={inspecteurRateData} emptyText="Aucun inspecteur renseigné pour le moment." />
      </div>

      <PieCard
        title="Répartition des erreurs éliminatoires"
        data={pieData}
        total={totalOccurrences}
        unitLabel="occurrence(s)"
        emptyText="Aucune erreur éliminatoire enregistrée pour le moment. Ajoute une fiche pour voir apparaître les statistiques ici."
      />

      <PieCard
        title="Passages par centre d'examen"
        data={centreData}
        total={totalCentre}
        unitLabel="fiche(s)"
        emptyText="Aucun centre d'examen renseigné pour le moment."
      />

      <PieCard
        title="Répartition par catégorie de permis"
        data={categorieData}
        total={totalCategorie}
        unitLabel="fiche(s)"
        emptyText="Aucune fiche pour le moment."
      />

      <PieCard
        title="Passages à l'examen par moniteur"
        subtitle="Utilise le filtre « Centre d'examen » ci-dessus pour voir la répartition par moniteur d'un centre en particulier."
        data={moniteurData}
        total={totalMoniteur}
        unitLabel="fiche(s)"
        emptyText="Aucun moniteur renseigné pour le moment."
      />
    </div>
  );
}

function RateBarChart({ data, onBarClick, clickable, emptyText }) {
  if (!data.length) {
    return <p className="empty">{emptyText}</p>;
  }
  return (
    <>
      <div className="legend-inline">
        <span><span className="dot" style={{ background: "#3E7C59" }} /> Réussite</span>
        <span><span className="dot" style={{ background: "#C0272D" }} /> Échec</span>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 22, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#DDE1E4" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: "#5B6570" }}
            axisLine={{ stroke: "#DDE1E4" }}
            tickLine={false}
            interval={0}
            angle={data.length > 6 ? -25 : 0}
            textAnchor={data.length > 6 ? "end" : "middle"}
            height={data.length > 6 ? 55 : 30}
          />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#5B6570" }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: "rgba(27,75,122,0.08)" }}
            formatter={(value, name) => [`${value} fiche(s)`, name === "reussites" ? "Réussite" : "Échec"]}
            labelFormatter={(label, payload) => {
              const row = payload && payload[0] && payload[0].payload;
              if (!row || row.total === 0) return label;
              return `${label} — ${row.taux}% de réussite (${row.reussites}/${row.total})`;
            }}
          />
          <Bar
            dataKey="reussites"
            stackId="a"
            fill="#3E7C59"
            cursor={clickable ? "pointer" : "default"}
            onClick={clickable ? onBarClick : undefined}
          >
            <LabelList
              dataKey="pctReussiteLabel"
              position="center"
              style={{ fontSize: 11, fontWeight: 700, fill: "#fff" }}
            />
          </Bar>
          <Bar
            dataKey="echecs"
            stackId="a"
            fill="#C0272D"
            radius={[6, 6, 0, 0]}
            cursor={clickable ? "pointer" : "default"}
            onClick={clickable ? onBarClick : undefined}
          >
            <LabelList
              dataKey="pctEchecLabel"
              position="center"
              style={{ fontSize: 11, fontWeight: 700, fill: "#fff" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}

function MonthDetail({ detail, onBack }) {
  if (!detail) return null;
  const monthName = MONTHS_LONG[detail.month];

  return (
    <div className="dashboard">
      <button type="button" className="back-btn" onClick={onBack}>← Retour au tableau de bord</button>

      <div className="panel-head standalone">
        <h2>Résumé — {monthName} {detail.year}</h2>
      </div>

      <div className="card-row">
        <StatCard label="Présentations" value={detail.total} />
        <StatCard label="Réussites" value={detail.reussites} />
        <StatCard label="Échecs" value={detail.echecs} />
        <StatCard label="Taux de réussite" value={detail.total ? `${detail.taux}%` : "—"} />
      </div>

      <PieCard
        title="Réussite / Échec"
        data={detail.resultatPie}
        total={detail.total}
        unitLabel="fiche(s)"
        emptyText="Aucune fiche ce mois-ci."
      />

      <PieCard
        title="Erreurs éliminatoires du mois"
        data={detail.erreursPie}
        total={detail.erreursPie.reduce((a, b) => a + b.value, 0)}
        unitLabel="occurrence(s)"
        emptyText="Aucune erreur éliminatoire ce mois-ci."
      />
    </div>
  );
}

function PieCard({ title, subtitle, data, total, unitLabel, emptyText }) {

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
      </div>
      {subtitle && <p className="hint">{subtitle}</p>}

      {total === 0 ? (
        <p className="empty">{emptyText}</p>
      ) : (
        <div className="pie-wrap">
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={115}
                label={renderPieLabel}
                labelLine={false}
              >
                {data.map((entry, i) => <Cell key={entry.name} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip formatter={(value, name, props) => [`${value} ${unitLabel} — ${props.payload.pct}%`, name]} />
            </PieChart>
          </ResponsiveContainer>
          <ul className="legend-list">
            {data.map((e, i) => (
              <li key={e.name}>
                <span className="dot" style={{ background: PALETTE[i % PALETTE.length] }} />
                <span className="legend-label">{e.name}</span>
                <span className="legend-pct">{e.pct}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, small }) {

  return (
    <div className="stat-card">
      <div className={small ? "stat-value stat-value-small" : "stat-value"}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function FormView({ form, setForm, errorTypes, toggleError, newErrorLabel, setNewErrorLabel, addErrorType, submitForm, editingId, resetForm, centres, inspecteurs, moniteurs, formErrors }) {
  function update(field, value) { setForm((f) => ({ ...f, [field]: value })); }

  return (
    <form className="panel form" onSubmit={submitForm} noValidate>
      <div className="panel-head">
        <h2>{editingId ? "Modifier la fiche" : "Nouvelle fiche d'examen"}</h2>
        {editingId && <button type="button" className="link-btn" onClick={resetForm}>Annuler la modification</button>}
      </div>

      <label className="field">
        <span>Nom et prénom de l'élève <em className="required">*</em></span>
        <input
          type="text"
          value={form.eleve}
          onChange={(e) => update("eleve", e.target.value)}
          placeholder="Ex : Julie Martin"
          className={formErrors.eleve ? "invalid" : ""}
        />
        {formErrors.eleve && <span className="field-error">{formErrors.eleve}</span>}
      </label>

      <div className="grid-2">
        <label className="field">
          <span>Date de l'examen <em className="required">*</em></span>
          <input
            type="date"
            value={form.date}
            onChange={(e) => update("date", e.target.value)}
            className={formErrors.date ? "invalid" : ""}
          />
          {formErrors.date && <span className="field-error">{formErrors.date}</span>}
        </label>

        <label className="field">
          <span>Catégorie de permis</span>
          <select value={form.categorie} onChange={(e) => update("categorie", e.target.value)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>

        <label className="field">
          <span>Centre d'examen</span>
          <input list="centres-list" value={form.centre} onChange={(e) => update("centre", e.target.value)} placeholder="Ex : Arles" />
          <datalist id="centres-list">{centres.map((c) => <option key={c} value={c} />)}</datalist>
        </label>

        <label className="field">
          <span>Nom de l'inspecteur</span>
          <input list="inspecteurs-list" value={form.inspecteur} onChange={(e) => update("inspecteur", e.target.value)} placeholder="Ex : M. Dupont" />
          <datalist id="inspecteurs-list">{inspecteurs.map((i) => <option key={i} value={i} />)}</datalist>
        </label>

        <label className="field">
          <span>Nom du moniteur</span>
          <input list="moniteurs-list" value={form.moniteur} onChange={(e) => update("moniteur", e.target.value)} placeholder="Ex : Marc" />
          <datalist id="moniteurs-list">{moniteurs.map((m) => <option key={m} value={m} />)}</datalist>
        </label>

        <label className="field">
          <span>Heures dans notre auto-école</span>
          <input type="number" min="0" step="0.5" value={form.heuresNous} onChange={(e) => update("heuresNous", e.target.value)} />
        </label>

        <label className="field">
          <span>Heures dans une autre auto-école</span>
          <input type="number" min="0" step="0.5" value={form.heuresAutre} onChange={(e) => update("heuresAutre", e.target.value)} />
        </label>

        <label className="field">
          <span>Nombre de passages à l'examen</span>
          <input type="number" min="1" step="1" value={form.passages} onChange={(e) => update("passages", e.target.value)} />
        </label>
      </div>

      <div className="field">
        <span>Résultat de l'examen</span>
        <div className="segmented result-segmented">
          <button
            type="button"
            className={form.resultat === "Réussite" ? "active success" : ""}
            onClick={() => setForm((f) => ({ ...f, resultat: "Réussite", erreursElim: [] }))}
          >
            ✓ Réussite
          </button>
          <button
            type="button"
            className={form.resultat === "Échec" ? "active danger" : ""}
            onClick={() => update("resultat", "Échec")}
          >
            ✕ Échec
          </button>
        </div>
      </div>

      {form.resultat === "Échec" && (
        <div className="field">
          <span>Erreur(s) éliminatoire(s)</span>
          <p className="hint">Coche les erreurs constatées — elles alimentent le camembert et restent disponibles pour les prochains candidats.</p>
          <div className="error-grid">
            {errorTypes.map((et) => (
              <label key={et.id} className={`error-chip ${form.erreursElim.includes(et.id) ? "checked" : ""}`}>
                <input type="checkbox" checked={form.erreursElim.includes(et.id)} onChange={() => toggleError(et.id)} />
                {et.label}
              </label>
            ))}
          </div>
          <div className="add-error-row">
            <input
              type="text"
              placeholder="Ajouter un type d'erreur..."
              value={newErrorLabel}
              onChange={(e) => setNewErrorLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addErrorType(); } }}
            />
            <button type="button" onClick={addErrorType}>Ajouter</button>
          </div>
        </div>
      )}

      <label className="field">
        <span>Remarques / erreurs avant l'éliminatoire</span>
        <textarea rows={4} value={form.remarques} onChange={(e) => update("remarques", e.target.value)} placeholder="Observations libres sur le déroulé de l'examen..." />
      </label>

      <div className="form-actions">
        <button type="submit" className="primary">{editingId ? "Enregistrer les modifications" : "Enregistrer la fiche"}</button>
      </div>
    </form>
  );
}

function ListView({ entries, errorLabelById, compact, setCompact, editEntry, confirmDelete, setConfirmDelete, deleteEntry }) {
  const [search, setSearch] = useState("");
  const [resultFilter, setResultFilter] = useState("Tous");
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc");

  const duplicates = useMemo(() => {
    const groups = {};
    entries.forEach((e) => {
      const key = (e.eleve || "").trim().toLowerCase();
      if (!key) return;
      if (!groups[key]) groups[key] = { name: e.eleve.trim(), count: 0, dates: [] };
      groups[key].count += 1;
      if (e.date) groups[key].dates.push(e.date);
    });
    const duplicateMap = {};
    const list = [];
    Object.values(groups).forEach((g) => {
      if (g.count > 1) {
        list.push(g);
        duplicateMap[g.name.toLowerCase()] = g.count;
      }
    });
    list.sort((a, b) => b.count - a.count);
    return { list, map: duplicateMap };
  }, [entries]);

  function sortValue(entry, key) {
    switch (key) {
      case "eleve": return (entry.eleve || "").toLowerCase();
      case "date": return entry.date || "";
      case "categorie": return entry.categorie || "";
      case "resultat": return entry.resultat || "";
      case "centre": return (entry.centre || "").toLowerCase();
      case "inspecteur": return (entry.inspecteur || "").toLowerCase();
      case "moniteur": return (entry.moniteur || "").toLowerCase();
      case "passages": return Number(entry.passages) || 0;
      default: return "";
    }
  }

  const visibleEntries = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = entries.filter((e) => {
      if (resultFilter !== "Tous" && e.resultat !== resultFilter) return false;
      if (!term) return true;
      const haystack = [e.eleve, e.centre, e.inspecteur, e.moniteur].join(" ").toLowerCase();
      return haystack.includes(term);
    });
    list = list.slice().sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [entries, search, resultFilter, sortKey, sortDir]);

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Toutes les fiches ({visibleEntries.length}{visibleEntries.length !== entries.length ? ` / ${entries.length}` : ""})</h2>
        <label className="toggle">
          <input type="checkbox" checked={compact} onChange={(e) => setCompact(e.target.checked)} />
          Vue compacte (éliminatoire / inspecteur / catégorie)
        </label>
      </div>

      <div className="filter-row">
        <label className="filter-field grow">
          <span>Recherche</span>
          <input
            type="text"
            placeholder="Élève, centre, inspecteur, moniteur..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="filter-field">
          <span>Résultat</span>
          <select value={resultFilter} onChange={(e) => setResultFilter(e.target.value)}>
            <option>Tous</option>
            <option>Réussite</option>
            <option>Échec</option>
          </select>
        </label>
        {!compact && (
          <label className="filter-field">
            <span>Trier par</span>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
              <option value="date">Date</option>
              <option value="eleve">Élève</option>
              <option value="categorie">Catégorie</option>
              <option value="resultat">Résultat</option>
              <option value="centre">Centre</option>
              <option value="inspecteur">Inspecteur</option>
              <option value="moniteur">Moniteur</option>
              <option value="passages">Passages</option>
            </select>
          </label>
        )}
        {!compact && (
          <button type="button" className="sort-dir-btn" onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))} title="Inverser l'ordre">
            {sortDir === "asc" ? "▲ Croissant" : "▼ Décroissant"}
          </button>
        )}
      </div>

      {duplicates.list.length > 0 && (
        <div className="duplicates-banner">
          <strong>⚠ {duplicates.list.length} élève(s) avec plusieurs fiches :</strong>{" "}
          {duplicates.list.map((d, i) => (
            <span key={d.name}>
              {d.name} ({d.count}){i < duplicates.list.length - 1 ? ", " : ""}
            </span>
          ))}
        </div>
      )}

      {entries.length === 0 ? (
        <p className="empty">Aucune fiche pour le moment.</p>
      ) : visibleEntries.length === 0 ? (
        <p className="empty">Aucune fiche ne correspond à ta recherche.</p>
      ) : compact ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Erreur(s) éliminatoire(s)</th>
                <th>Inspecteur</th>
                <th>Catégorie</th>
              </tr>
            </thead>
            <tbody>
              {visibleEntries.map((entry) => {
                const errLabels = entry.erreursElim.map((id) => errorLabelById[id]).filter(Boolean);
                return (
                  <tr key={entry.id}>
                    <td>{errLabels.length ? errLabels.join(", ") : "—"}</td>
                    <td>{entry.inspecteur || "—"}</td>
                    <td><span className="cat-badge">{entry.categorie}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="fiche-list">
          {visibleEntries.map((entry) => {
            const errLabels = entry.erreursElim.map((id) => errorLabelById[id]).filter(Boolean);
            const isDuplicate = entry.eleve && duplicates.map[entry.eleve.trim().toLowerCase()];
            return (
              <div className="fiche-card" key={entry.id}>
                <div className="fiche-card-head">
                  <div className="fiche-card-title">
                    <strong>{entry.eleve || "Élève sans nom"}</strong>
                    {isDuplicate && <span className="dup-badge" title={`${isDuplicate} fiches pour cet élève`}>×{isDuplicate}</span>}
                    <span className="cat-badge">{entry.categorie}</span>
                  </div>
                  <span className={`result-badge ${entry.resultat === "Réussite" ? "success" : "danger"}`}>{entry.resultat || "—"}</span>
                </div>

                <div className="fiche-grid">
                  <div className="fiche-field"><span className="fiche-label">Date</span><span>{formatDateFr(entry.date)}</span></div>
                  <div className="fiche-field"><span className="fiche-label">Centre</span><span>{entry.centre || "—"}</span></div>
                  <div className="fiche-field"><span className="fiche-label">Inspecteur</span><span>{entry.inspecteur || "—"}</span></div>
                  <div className="fiche-field"><span className="fiche-label">Moniteur</span><span>{entry.moniteur || "—"}</span></div>
                  <div className="fiche-field"><span className="fiche-label">Heures (nous / autre)</span><span>{entry.heuresNous || "0"} / {entry.heuresAutre || "0"}</span></div>
                  <div className="fiche-field"><span className="fiche-label">Passages</span><span>{entry.passages || "—"}</span></div>
                </div>

                <div className="fiche-section">
                  <span className="fiche-label">Erreur(s) éliminatoire(s)</span>
                  <p>{errLabels.length ? errLabels.join(", ") : "—"}</p>
                </div>

                <div className="fiche-section">
                  <span className="fiche-label">Remarques</span>
                  <p>{entry.remarques || "—"}</p>
                </div>

                <div className="fiche-actions">
                  <button className="icon-btn" onClick={() => editEntry(entry)}>✏️ Modifier</button>
                  {confirmDelete === entry.id ? (
                    <>
                      <button className="icon-btn danger" onClick={() => deleteEntry(entry.id)}>✓ Confirmer</button>
                      <button className="icon-btn" onClick={() => setConfirmDelete(null)}>✕ Annuler</button>
                    </>
                  ) : (
                    <button className="icon-btn danger" onClick={() => setConfirmDelete(entry.id)}>🗑️ Supprimer</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WaitlistView({ waitlist, reorderWaitlist, resetWaitlistOrder, errorLabelById }) {
  const [dragId, setDragId] = useState(null);
  const [localOrder, setLocalOrder] = useState(null); // array of ids while actively dragging (touch only)
  const hasManualOrder = waitlist.some((w) => w.moved);

  const byId = useMemo(() => {
    const m = {};
    waitlist.forEach((w) => { m[w.entry.id] = w; });
    return m;
  }, [waitlist]);

  const eleveEchecCounts = useMemo(() => {
    const counts = {};
    waitlist.forEach((w) => {
      const key = (w.entry.eleve || "").trim().toLowerCase();
      if (!key) return;
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [waitlist]);

  const displayList = localOrder ? localOrder.map((id) => byId[id]).filter(Boolean) : waitlist;

  // --- Souris / desktop : drag & drop natif HTML5 (comportement fluide du navigateur) ---
  function handleDragStart(id) {
    setDragId(id);
  }

  function handleDragOver(e) {
    e.preventDefault();
  }

  function handleDrop(targetId) {
    if (!dragId || dragId === targetId) { setDragId(null); return; }
    const ids = waitlist.map((w) => w.entry.id);
    const fromIndex = ids.indexOf(dragId);
    const toIndex = ids.indexOf(targetId);
    if (fromIndex === -1 || toIndex === -1) { setDragId(null); return; }
    const newIds = ids.slice();
    newIds.splice(fromIndex, 1);
    newIds.splice(toIndex, 0, dragId);
    reorderWaitlist(newIds);
    setDragId(null);
  }

  function handleDragEnd() {
    setDragId(null);
  }

  // --- Tactile / mobile : événements Touch (le drag & drop HTML5 natif ne fonctionne pas au doigt) ---
  function handleTouchStart(e, id) {
    setDragId(id);
    setLocalOrder(waitlist.map((w) => w.entry.id));
  }

  function handleTouchMove(e) {
    if (!dragId) return;
    const touch = e.touches[0];
    if (!touch) return;
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    const rowEl = target && target.closest("[data-wid]");
    if (!rowEl) return;
    const overId = rowEl.getAttribute("data-wid");
    if (overId === dragId) return;
    setLocalOrder((order) => {
      if (!order) return order;
      const ids = order.slice();
      const from = ids.indexOf(dragId);
      const to = ids.indexOf(overId);
      if (from === -1 || to === -1 || from === to) return order;
      ids.splice(from, 1);
      ids.splice(to, 0, dragId);
      return ids;
    });
  }

  function handleTouchEnd() {
    if (dragId && localOrder) {
      reorderWaitlist(localOrder);
    }
    setDragId(null);
    setLocalOrder(null);
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Liste d'attente ({waitlist.length})</h2>
        {hasManualOrder && (
          <button type="button" className="link-btn" onClick={resetWaitlistOrder}>Réinitialiser l'ordre (par date)</button>
        )}
      </div>
      <p className="hint">Classée par échec le plus ancien en premier. Glisse-dépose une ligne (ou la poignée « ⋮⋮ » au doigt) pour changer l'ordre manuellement — <span className="hint-gained">vert</span> = gagne des places, <span className="hint-lost">rouge</span> = perd des places, avec l'ancienne position → la nouvelle.</p>

      {waitlist.length === 0 ? (
        <p className="empty">Aucun élève en attente pour le moment — les fiches marquées « Échec » apparaîtront ici automatiquement.</p>
      ) : (
        <ul className="waitlist">
          {displayList.map((row) => {
            if (!row) return null;
            const { entry, naturalIndex, currentIndex, moved } = row;
            const errLabels = entry.erreursElim.map((id) => errorLabelById[id]).filter(Boolean);
            const dragging = dragId === entry.id;
            const moveClass = !dragging && moved ? (currentIndex < naturalIndex ? "gained" : "lost") : "";
            const echecCount = entry.eleve ? eleveEchecCounts[entry.eleve.trim().toLowerCase()] : 0;
            return (
              <li
                key={entry.id}
                data-wid={entry.id}
                draggable
                onDragStart={() => handleDragStart(entry.id)}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(entry.id)}
                onDragEnd={handleDragEnd}
                className={`waitlist-row ${moveClass} ${dragging ? "dragging" : ""}`}
              >
                <span className={`waitlist-num ${moveClass}`}>
                  {dragging ? "•" : moved ? `${naturalIndex} → ${currentIndex}` : currentIndex}
                </span>
                <div className="waitlist-info">
                  <strong>
                    {entry.eleve || "Élève sans nom"}
                    {echecCount > 1 && <span className="dup-badge" title={`${echecCount} échecs enregistrés pour cet élève`}>{echecCount} échecs</span>}
                  </strong>
                  <span className="waitlist-meta">
                    {formatDateFr(entry.date)} · {entry.categorie}
                    {entry.centre ? ` · ${entry.centre}` : ""}
                    {entry.inspecteur ? ` · ${entry.inspecteur}` : ""}
                  </span>
                  {errLabels.length > 0 && <span className="waitlist-errors">{errLabels.join(", ")}</span>}
                </div>
                <span
                  className="drag-handle"
                  title="Glisser pour réordonner"
                  onTouchStart={(e) => handleTouchStart(e, entry.id)}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  onTouchCancel={handleTouchEnd}
                >
                  ⋮⋮
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');

.app, .app *, .app *::before, .app *::after { box-sizing:border-box; }
.app { --ink:#23282D; --muted:#5B6570; --bg:#EEF0F2; --surface:#FFFFFF; --line:#DDE1E4;
  --blue:#1B4B7A; --red:#C0272D; --amber:#E8A93A;
  font-family:'Inter',sans-serif; color:var(--ink); background:var(--bg); min-height:100%;
  overflow-x:hidden; width:100%; }
body, html, #root { overflow-x:hidden; max-width:100%; }

.topbar { background:var(--surface); border-bottom:1px solid var(--line); position:sticky; top:0; z-index:10; }
.topbar-inner { max-width:1100px; margin:0 auto; padding:16px 20px 12px; display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }
.brand { display:flex; align-items:center; gap:12px; }
.brand-mark { width:40px; height:40px; border-radius:8px; background:var(--blue); color:#fff; font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:22px; display:flex; align-items:center; justify-content:center; }
.brand-text h1 { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:22px; letter-spacing:0.02em; margin:0; line-height:1.1; }
.brand-text p { margin:2px 0 0; font-size:12.5px; color:var(--muted); }
.tabs { display:flex; gap:4px; background:var(--bg); border-radius:10px; padding:4px; flex-wrap:wrap; row-gap:4px; }
.tabs button { border:none; background:transparent; padding:8px 14px; border-radius:7px; font-size:13.5px; font-weight:600; color:var(--muted); cursor:pointer; }
.tabs button.active { background:var(--surface); color:var(--ink); box-shadow:0 1px 2px rgba(0,0,0,0.08); }
.backup-actions { display:flex; gap:8px; flex-wrap:wrap; }
.backup-btn { border:1px solid var(--blue); background:var(--blue); color:#fff; border-radius:8px; padding:8px 14px; font-size:12.5px; font-weight:700; cursor:pointer; white-space:nowrap; }
.backup-btn.ghost { background:transparent; color:var(--blue); }
.roadline { height:4px; background:var(--blue); background-image:repeating-linear-gradient(90deg,#fff 0 24px,transparent 24px 44px); }

.content { max-width:1100px; margin:0 auto; padding:24px 20px 60px; }

.card-row { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:20px; }
.stat-card { background:var(--surface); border:1px solid var(--line); border-radius:10px; padding:16px; }
.stat-value { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:32px; color:var(--blue); }
.stat-value-small { font-size:18px; font-family:'Inter',sans-serif; font-weight:700; }
.stat-label { font-size:12.5px; color:var(--muted); margin-top:4px; }

.panel { background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:20px; margin-bottom:20px; }
.panel-head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:16px; flex-wrap:wrap; }
.panel-head h2 { font-family:'Barlow Condensed',sans-serif; font-size:20px; font-weight:700; margin:0; }
.panel-head select { border:1px solid var(--line); border-radius:8px; padding:6px 10px; font-family:'Inter',sans-serif; }

.filter-row { display:flex; gap:14px; flex-wrap:wrap; margin-bottom:18px; }
.filter-field { display:flex; flex-direction:column; gap:4px; min-width:150px; flex:1 1 150px; }
.filter-field.grow { flex:2 1 200px; }
.filter-field span { font-size:12px; font-weight:600; color:var(--muted); }
.filter-field select, .filter-field input { width:100%; box-sizing:border-box; border:1px solid var(--line); border-radius:8px; padding:8px 10px; font-family:'Inter',sans-serif; font-size:13.5px; background:var(--surface); color:var(--ink); }
.filter-field select:focus, .filter-field input:focus { outline:2px solid var(--blue); outline-offset:1px; }

.empty { color:var(--muted); font-size:14px; padding:20px 0; }

.pie-wrap { display:flex; gap:24px; align-items:center; flex-wrap:wrap; min-width:0; }
.pie-wrap > div:first-child { flex:1 1 220px; min-width:0; max-width:100%; }
.legend-list { list-style:none; margin:0; padding:0; flex:1 1 200px; min-width:0; display:flex; flex-direction:column; gap:8px; }
.legend-list li { display:flex; align-items:center; gap:8px; font-size:13.5px; }
.dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
.legend-label { flex:1; }
.legend-pct { font-weight:700; color:var(--ink); }

.grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:16px; }
.field { display:flex; flex-direction:column; gap:6px; margin-bottom:16px; }
.field > span { font-size:13px; font-weight:600; color:var(--ink); }
.field input, .field select, .field textarea { border:1px solid var(--line); border-radius:8px; padding:9px 11px; font-family:'Inter',sans-serif; font-size:14px; color:var(--ink); background:var(--surface); }
.required { color:var(--red); font-style:normal; }
.field input.invalid, .field select.invalid, .field textarea.invalid { border-color:var(--red); background:#FEF6F6; }
.field-error { font-size:12px; color:var(--red); font-weight:600; }
.field input:focus, .field select:focus, .field textarea:focus { outline:2px solid var(--blue); outline-offset:1px; }
.hint { font-size:12.5px; color:var(--muted); margin:0 0 4px; }

.error-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(230px, 100%),1fr)); gap:8px; margin-bottom:12px; }
.error-chip { display:flex; align-items:center; gap:8px; border:1px solid var(--line); border-radius:8px; padding:9px 11px; font-size:13px; cursor:pointer; background:var(--bg); }
.error-chip.checked { background:#FCEAEA; border-color:var(--red); color:var(--red); font-weight:600; }
.error-chip input { accent-color:var(--red); }

.add-error-row { display:flex; gap:8px; }
.add-error-row input { flex:1; border:1px solid var(--line); border-radius:8px; padding:9px 11px; font-size:13.5px; }
.add-error-row button { border:1px solid var(--blue); color:var(--blue); background:transparent; border-radius:8px; padding:9px 14px; font-weight:600; font-size:13.5px; cursor:pointer; }

.form-actions { display:flex; justify-content:flex-end; margin-top:8px; }
button.primary { background:var(--blue); color:#fff; border:none; border-radius:8px; padding:11px 22px; font-weight:700; font-size:14px; cursor:pointer; }
.link-btn { background:none; border:none; color:var(--muted); font-size:13px; text-decoration:underline; cursor:pointer; }

.toggle { display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600; color:var(--ink); cursor:pointer; }

.table-wrap { overflow-x:auto; }
table { width:100%; border-collapse:collapse; font-size:13px; }
th { text-align:left; font-size:11.5px; text-transform:uppercase; letter-spacing:0.03em; color:var(--muted); font-weight:700; border-bottom:1px solid var(--line); padding:8px 8px; }
td { padding:9px 8px; border-bottom:1px solid var(--line); vertical-align:top; word-break:break-word; }
.sort-dir-btn { border:1px solid var(--line); background:var(--surface); border-radius:8px; padding:8px 12px; font-size:12.5px; font-weight:600; color:var(--ink); cursor:pointer; align-self:flex-end; }

.fiche-list { display:flex; flex-direction:column; gap:14px; min-width:0; }
.fiche-card { border:1px solid var(--line); border-radius:12px; padding:14px 16px; background:var(--bg); min-width:0; }
.fiche-card-head { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:10px; }
.fiche-card-title { display:flex; align-items:center; gap:8px; flex-wrap:wrap; min-width:0; }
.fiche-card-title strong { font-size:15px; word-break:break-word; }
.fiche-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px 14px; margin-bottom:10px; }
.fiche-field { display:flex; flex-direction:column; gap:2px; min-width:0; }
.fiche-field span:last-child { font-size:13px; word-break:break-word; }
.fiche-label { font-size:10.5px; text-transform:uppercase; letter-spacing:0.03em; color:var(--muted); font-weight:700; }
.fiche-section { margin-bottom:10px; min-width:0; }
.fiche-section p { margin:2px 0 0; font-size:13px; word-break:break-word; white-space:pre-wrap; }
.fiche-actions { display:flex; gap:6px; flex-wrap:wrap; padding-top:6px; border-top:1px solid var(--line); }
.icon-btn { border:1px solid var(--line); background:var(--surface); color:var(--blue); font-size:12.5px; font-weight:600; cursor:pointer; padding:6px 10px; border-radius:7px; }
.icon-btn.danger { color:var(--red); border-color:#F2C6C6; }
.cat-badge { display:inline-block; background:var(--blue); color:#fff; font-size:11.5px; font-weight:700; padding:2px 8px; border-radius:5px; }
.dup-badge { display:inline-block; margin-left:6px; background:var(--amber); color:#5A3B00; font-size:10.5px; font-weight:800; padding:1px 6px; border-radius:10px; vertical-align:middle; }
.duplicates-banner { background:#FFF6E9; border:1px solid var(--amber); border-radius:8px; padding:10px 12px; font-size:13px; margin-bottom:16px; color:#5A3B00; }
th.sortable { cursor:pointer; user-select:none; }
th.sortable:hover { color:var(--ink); }
.sort-arrow { font-size:10px; color:var(--muted); }
.sort-arrow.active { color:var(--blue); }
.result-badge { display:inline-block; font-size:11.5px; font-weight:700; padding:2px 8px; border-radius:5px; }
.result-badge.success { background:#E5F0E9; color:#3E7C59; }
.result-badge.danger { background:#FCEAEA; color:var(--red); }

.segmented { display:inline-flex; border:1px solid var(--line); border-radius:8px; overflow:hidden; }
.segmented button { border:none; background:var(--surface); padding:9px 16px; font-size:13.5px; font-weight:600; color:var(--muted); cursor:pointer; }
.segmented button + button { border-left:1px solid var(--line); }
.segmented.small button { padding:6px 12px; font-size:12.5px; }
.segmented button.active { background:var(--blue); color:#fff; }
.result-segmented button.active.success { background:#3E7C59; }
.result-segmented button.active.danger { background:var(--red); }

.bar-controls { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.bar-controls select { border:1px solid var(--line); border-radius:8px; padding:7px 10px; font-family:'Inter',sans-serif; font-size:13px; }

.legend-inline { display:flex; gap:16px; margin-bottom:6px; }
.legend-inline span { display:inline-flex; align-items:center; gap:6px; font-size:12.5px; color:var(--muted); font-weight:600; }
.legend-inline .dot { width:9px; height:9px; border-radius:50%; }

.back-btn { background:none; border:none; color:var(--blue); font-weight:600; font-size:13.5px; cursor:pointer; margin-bottom:16px; padding:0; }
.panel-head.standalone { margin-bottom:20px; }

.waitlist { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:8px; }
.waitlist-row { display:flex; align-items:center; gap:14px; border:1px solid var(--line); border-radius:10px; padding:12px 14px; background:var(--bg); cursor:grab; transition:background 0.15s, border-color 0.15s; }
.waitlist-row.dragging { opacity:0.5; }
.waitlist-row.gained { background:#EAF5EE; border-color:#3E7C59; }
.waitlist-row.lost { background:#FCEAEA; border-color:var(--red); }
.waitlist-num { flex-shrink:0; min-width:44px; text-align:center; font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:18px; color:var(--blue); background:var(--surface); border:1px solid var(--line); border-radius:8px; padding:4px 6px; }
.waitlist-num.gained { color:#3E7C59; border-color:#3E7C59; background:#E0F0E6; }
.waitlist-num.lost { color:var(--red); border-color:var(--red); background:#FCEAEA; }
.waitlist-info { flex:1; display:flex; flex-direction:column; gap:2px; min-width:0; }
.waitlist-info strong { font-size:14.5px; }
.waitlist-meta { font-size:12.5px; color:var(--muted); }
.waitlist-errors { font-size:12px; color:var(--red); }
.drag-handle { flex-shrink:0; color:var(--muted); font-size:16px; cursor:grab; user-select:none; letter-spacing:-2px; touch-action:none; padding:6px; }
.drag-handle:active { cursor:grabbing; }
.hint-gained { color:#3E7C59; font-weight:700; }
.hint-lost { color:var(--red); font-weight:700; }

@media (max-width:720px) {
  .content { padding:16px 14px 48px; }
  .topbar-inner { padding:14px 14px 10px; }
  .card-row { grid-template-columns:repeat(2,1fr); }
  .grid-2 { grid-template-columns:1fr; }
  .topbar-inner { flex-direction:column; align-items:stretch; }
  .tabs { width:100%; }
  .tabs button { flex:1 1 auto; padding:8px 6px; font-size:12px; text-align:center; }
  .backup-actions { width:100%; }
  .backup-btn { flex:1 1 auto; text-align:center; }
  .panel { padding:14px; }
  .fiche-grid { grid-template-columns:repeat(auto-fit, minmax(110px, 1fr)); }
  .filter-row { gap:10px; }
  .pie-wrap { gap:16px; }
}

@media (max-width:420px) {
  .card-row { grid-template-columns:1fr 1fr; }
  .stat-value { font-size:26px; }
  .brand-text h1 { font-size:19px; }
  .waitlist-row { gap:8px; padding:10px; }
  .waitlist-num { min-width:36px; font-size:15px; }
}
`;
