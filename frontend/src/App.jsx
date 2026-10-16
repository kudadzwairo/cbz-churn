import { Fragment, useEffect, useMemo, useState } from "react";

const TABS = [
  { id: "assess", label: "Assess a customer" },
  { id: "batch", label: "Score a file" },
  { id: "model", label: "Model quality" },
];

const STATUS_STYLE = {
  Retained: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  "At-Risk Low": "bg-amber-50 text-amber-800 ring-amber-200",
  "At-Risk Medium": "bg-orange-50 text-orange-800 ring-orange-200",
  "At-Risk High": "bg-red-50 text-brand ring-red-200",
  Churned: "bg-red-700 text-white ring-red-800",
};

const EMPTY = {
  id: "",
  credit_sco: "680",
  gender: "female",
  age: "42",
  occupation: "Teacher/Lecturer",
  balance_usd: "1500",
  monthly_income_usd: "450",
  tenure_ye: "2",
  married: "1",
  nums_card: "2",
  nums_service: "3",
  active_member: "yes",
  last_active_date: "2025-06-01",
  last_transaction_month_usd: "120",
  created_date: "2023-01-15",
  customer_segment: "Emerging",
  engagement_score: "40",
  loyalty_level: "Bronze",
};

const FALLBACK_OPTIONS = {
  gender: ["female", "male"],
  occupation: [
    "Accountant/Finance Professional",
    "Engineer/IT Specialist",
    "General Labourer",
    "Homemaker/Student",
    "Manager/Executive",
    "Office Worker/Civil Servant",
    "Retired",
    "Sales/Business Development",
    "Small Business Owner",
    "Teacher/Lecturer",
  ],
  married: ["0", "1", "2", "3"],
  active_member: ["yes", "no"],
  customer_segment: ["Affluent", "Emerging", "Mass", "Priority"],
  loyalty_level: ["Bronze", "Gold", "Silver"],
};

async function readJson(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body.detail;
    const message = Array.isArray(detail)
      ? detail.map((item) => item.msg).join(" ")
      : detail || "The request could not be completed.";
    throw new Error(message);
  }
  return body;
}

function Badge({ status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ring-1 ${STATUS_STYLE[status] || "bg-slate-100"}`}>
      {status}
    </span>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-navy">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

const controlClass =
  "w-full rounded-lg border border-ice bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-navy focus:ring-2 focus:ring-navy/20";

function Meter({ value }) {
  const percent = Math.round(value * 100);
  return (
    <div>
      <div className="mb-1 flex items-end justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Chance of leaving</span>
        <span className="font-display text-2xl font-bold text-navy">{percent}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-ice">
        <div
          className="h-full rounded-full bg-gradient-to-r from-navy to-brand"
          style={{ width: `${Math.max(percent, 2)}%` }}
        />
      </div>
    </div>
  );
}

function ResultPanel({ result }) {
  if (!result) {
    return (
      <div className="rounded-2xl border border-dashed border-ice bg-white p-6 text-sm leading-6 text-slate-600 shadow-card">
        Score a customer to see the risk band and the retention action. The result is a decision aid for staff. It does not close an account or replace a relationship manager.
      </div>
    );
  }
  return (
    <div className="rounded-2xl bg-white p-6 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Predicted status</p>
          <h2 className="mt-1 font-display text-2xl font-bold text-navy-ink">
            {result.id ? `Customer ${result.id}` : "This customer"}
          </h2>
        </div>
        <Badge status={result.status} />
      </div>
      <div className="mt-5">
        <Meter value={result.probability} />
        <p className="mt-3 text-sm text-slate-600">
          {result.likely_to_churn
            ? "Above the study decision threshold, so the binary screen also flags this customer as likely to churn."
            : "Below the study decision threshold. The band still shows how close the profile sits to that line."}
        </p>
      </div>
      {result.signals?.length ? (
        <div className="mt-5">
          <h3 className="font-display text-sm font-bold text-navy">What stands out</h3>
          <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-700">
            {result.signals.map((item) => (
              <li key={item} className="rounded-lg bg-mist px-3 py-2">{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-5">
        <h3 className="font-display text-sm font-bold text-navy">Suggested next step</h3>
        <ol className="mt-2 space-y-2 text-sm leading-6 text-slate-700">
          {result.actions.map((item, index) => (
            <li key={item} className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">
                {index + 1}
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Assess({ options, examples }) {
  const [form, setForm] = useState(EMPTY);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function loadExample(example) {
    setForm({
      ...EMPTY,
      ...example,
      married: String(example.married ?? ""),
      active_member: String(example.active_member ?? "yes"),
    });
    setResult(null);
    setError("");
  }

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = {
        ...form,
        id: form.id || null,
        credit_sco: Number(form.credit_sco),
        age: Number(form.age),
        balance_usd: Number(form.balance_usd),
        monthly_income_usd: Number(form.monthly_income_usd),
        tenure_ye: Number(form.tenure_ye),
        nums_card: Number(form.nums_card),
        nums_service: Number(form.nums_service),
        last_transaction_month_usd: Number(form.last_transaction_month_usd),
        engagement_score: Number(form.engagement_score),
      };
      const response = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setResult(await readJson(response));
    } catch (err) {
      setResult(null);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
      <form onSubmit={onSubmit} className="rounded-2xl bg-white p-6 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold text-navy">Customer profile</h2>
            <p className="mt-1 text-sm text-slate-600">Score from account behaviour only. Customer ID is optional, and name and address are not collected.</p>
          </div>
          <div className="flex gap-2">
            {examples.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => loadExample(example.values)}
                className="rounded-full border border-ice px-3 py-1.5 text-xs font-bold text-navy hover:bg-mist"
              >
                {example.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field label="Customer ID" hint="Optional. This is the only identifier kept on the worklist.">
            <input className={controlClass} value={form.id} onChange={(e) => update("id", e.target.value)} />
          </Field>
          <Field label="Gender">
            <select className={controlClass} value={form.gender} onChange={(e) => update("gender", e.target.value)}>
              {options.gender.map((item) => <option key={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="Age">
            <input className={controlClass} type="number" min="18" max="100" required value={form.age} onChange={(e) => update("age", e.target.value)} />
          </Field>
          <Field label="Occupation">
            <select className={controlClass} value={form.occupation} onChange={(e) => update("occupation", e.target.value)}>
              {options.occupation.map((item) => <option key={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="Marital code" hint="Kept as 0–3, the codes in the study file.">
            <select className={controlClass} value={form.married} onChange={(e) => update("married", e.target.value)}>
              {options.married.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="Segment">
            <select className={controlClass} value={form.customer_segment} onChange={(e) => update("customer_segment", e.target.value)}>
              {options.customer_segment.map((item) => <option key={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="Loyalty">
            <select className={controlClass} value={form.loyalty_level} onChange={(e) => update("loyalty_level", e.target.value)}>
              {options.loyalty_level.map((item) => <option key={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="Active member">
            <select className={controlClass} value={form.active_member} onChange={(e) => update("active_member", e.target.value)}>
              {options.active_member.map((item) => <option key={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="Credit score">
            <input className={controlClass} type="number" min="0" max="900" required value={form.credit_sco} onChange={(e) => update("credit_sco", e.target.value)} />
          </Field>
          <Field label="Engagement score">
            <input className={controlClass} type="number" min="0" max="100" required value={form.engagement_score} onChange={(e) => update("engagement_score", e.target.value)} />
          </Field>
          <Field label="Balance (USD)">
            <input className={controlClass} type="number" min="0" step="0.01" required value={form.balance_usd} onChange={(e) => update("balance_usd", e.target.value)} />
          </Field>
          <Field label="Monthly income (USD)">
            <input className={controlClass} type="number" min="0" step="0.01" required value={form.monthly_income_usd} onChange={(e) => update("monthly_income_usd", e.target.value)} />
          </Field>
          <Field label="Tenure (years)">
            <input className={controlClass} type="number" min="0" step="1" required value={form.tenure_ye} onChange={(e) => update("tenure_ye", e.target.value)} />
          </Field>
          <Field label="Latest month spend (USD)">
            <input className={controlClass} type="number" min="0" step="0.01" required value={form.last_transaction_month_usd} onChange={(e) => update("last_transaction_month_usd", e.target.value)} />
          </Field>
          <Field label="Cards held">
            <input className={controlClass} type="number" min="0" required value={form.nums_card} onChange={(e) => update("nums_card", e.target.value)} />
          </Field>
          <Field label="Services held">
            <input className={controlClass} type="number" min="0" required value={form.nums_service} onChange={(e) => update("nums_service", e.target.value)} />
          </Field>
          <Field label="Account opened">
            <input className={controlClass} type="date" required value={form.created_date} onChange={(e) => update("created_date", e.target.value)} />
          </Field>
          <Field label="Last active">
            <input className={controlClass} type="date" required value={form.last_active_date} onChange={(e) => update("last_active_date", e.target.value)} />
          </Field>
        </div>

        {error ? <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-brand">{error}</p> : null}

        <button
          type="submit"
          disabled={busy}
          className="mt-6 rounded-full bg-brand px-6 py-3 text-sm font-bold text-white transition hover:bg-brand-hot disabled:opacity-60"
        >
          {busy ? "Scoring…" : "Score this customer"}
        </button>
      </form>
      <ResultPanel result={result} />
    </div>
  );
}

function Batch() {
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [file, setFile] = useState(null);

  async function score(selected) {
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", selected);
      const response = await fetch("/api/predict/batch", { method: "POST", body });
      const data = await readJson(response);
      setSummary(data.summary);
      setRows(data.rows);
      setMeta({ scored: data.scored_count, shown: data.shown_count, snapshot: data.snapshot_date });
      setOpenId(null);
    } catch (err) {
      setSummary(null);
      setRows([]);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    if (!file) return;
    const body = new FormData();
    body.append("file", file);
    const response = await fetch("/api/predict/batch.csv", { method: "POST", body });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.detail || "The full file could not be downloaded.");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "cbz_churn_scores.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const visible = useMemo(() => {
    return rows.filter((row) => {
      const statusOk = filter === "All" || row.status === filter;
      const haystack = `${row.id || ""} ${row.customer_segment}`.toLowerCase();
      return statusOk && haystack.includes(query.trim().toLowerCase());
    });
  }, [rows, filter, query]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-6 shadow-card">
        <h2 className="font-display text-xl font-bold text-navy">Score a customer file</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Upload a CSV of account behaviour. Customer ID is optional. Name and address columns are ignored, and nothing is stored after the score is returned. The highest-risk customers appear first.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <a href="/sample_customers.csv" className="text-sm font-bold text-navy underline decoration-brand decoration-2 underline-offset-4">
            Download a sample file
          </a>
          <label className="cursor-pointer rounded-full bg-navy px-5 py-2.5 text-sm font-bold text-white hover:bg-navy-deep">
            {busy ? "Scoring…" : "Choose CSV"}
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={busy}
              onChange={(event) => {
                const selected = event.target.files?.[0];
                if (selected) {
                  setFile(selected);
                  score(selected);
                }
              }}
            />
          </label>
          {file && summary ? (
            <button type="button" onClick={download} className="rounded-full border border-navy px-5 py-2.5 text-sm font-bold text-navy hover:bg-mist">
              Download all scores
            </button>
          ) : null}
        </div>
        {error ? <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-brand">{error}</p> : null}
      </section>

      {summary ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {Object.entries(summary).map(([status, count]) => (
              <button
                key={status}
                type="button"
                onClick={() => setFilter(filter === status ? "All" : status)}
                className={`rounded-2xl bg-white p-4 text-left shadow-card ring-1 ${filter === status ? "ring-brand" : "ring-transparent"}`}
              >
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{status}</p>
                <p className="mt-1 font-display text-3xl font-bold text-navy">{count}</p>
              </button>
            ))}
          </div>
          <section className="rounded-2xl bg-white p-4 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3 px-2 pb-3">
              <p className="text-sm text-slate-600">
                Showing {visible.length} of {meta.shown} highest-risk rows from {meta.scored} scored customers.
                Activity is measured at {meta.snapshot}.
              </p>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search customer ID or segment"
                className={`${controlClass} max-w-xs`}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Customer ID</th>
                    <th className="px-3 py-2">Segment</th>
                    <th className="px-3 py-2">Chance</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row, index) => {
                    const key = `${row.id}-${index}`;
                    const open = openId === key;
                    return (
                      <Fragment key={key}>
                        <tr
                          onClick={() => setOpenId(open ? null : key)}
                          className="cursor-pointer border-t border-ice hover:bg-mist"
                        >
                          <td className="px-3 py-3 font-bold text-navy-ink">{row.id || "No ID"}</td>
                          <td className="px-3 py-3">{row.customer_segment}</td>
                          <td className="px-3 py-3 font-bold">{Math.round(row.probability * 100)}%</td>
                          <td className="px-3 py-3"><Badge status={row.status} /></td>
                        </tr>
                        {open ? (
                          <tr key={`${key}-detail`} className="border-t border-ice bg-mist/60">
                            <td colSpan={4} className="px-3 py-3">
                              <p className="text-xs font-bold uppercase tracking-wide text-navy">Suggested next step</p>
                              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                                {row.actions.map((action) => <li key={action}>{action}</li>)}
                              </ul>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function MetricBars({ comparison }) {
  const metrics = ["accuracy", "precision", "recall", "f1", "roc_auc"];
  const labels = {
    accuracy: "Accuracy",
    precision: "Precision",
    recall: "Recall",
    f1: "F1",
    roc_auc: "ROC-AUC",
  };
  return (
    <div className="space-y-4">
      {metrics.map((metric) => (
        <div key={metric}>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">{labels[metric]}</p>
          <div className="space-y-1.5">
            {comparison.map((row) => (
              <div key={row.model} className="grid grid-cols-[140px_1fr_48px] items-center gap-2 text-sm">
                <span className={row.selected ? "font-bold text-navy" : "text-slate-600"}>{row.model}</span>
                <div className="h-2.5 rounded-full bg-ice">
                  <div
                    className={`h-full rounded-full ${row.selected ? "bg-brand" : "bg-navy"}`}
                    style={{ width: `${Math.round(row.test[metric] * 100)}%` }}
                  />
                </div>
                <span className="text-right font-bold text-navy-ink">{row.test[metric].toFixed(3)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ModelQuality() {
  const [card, setCard] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/model")
      .then(readJson)
      .then(setCard)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-brand">{error}</p>;
  if (!card) return <p className="text-sm text-slate-600">Loading the model card…</p>;

  const maxImportance = Math.max(...card.feature_importance.map((item) => item.importance), 0.01);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl bg-navy text-white shadow-card">
        <div className="grid gap-6 p-6 md:grid-cols-[1.4fr_0.8fr] md:p-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-ice">Selected model</p>
            <h2 className="mt-2 font-display text-3xl font-bold">{card.selected_model}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-ice">{card.selection_reason}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              ["F1", card.selected_test_metrics.f1],
              ["Recall", card.selected_test_metrics.recall],
              ["Precision", card.selected_test_metrics.precision],
              ["ROC-AUC", card.selected_test_metrics.roc_auc],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-white/10 p-3">
                <p className="text-xs uppercase tracking-wide text-ice">{label}</p>
                <p className="font-display text-2xl font-bold">{Number(value).toFixed(3)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow-card">
          <h3 className="font-display text-lg font-bold text-navy">Holdout comparison</h3>
          <p className="mt-1 text-sm text-slate-600">Same unseen 20% of customers for every algorithm. The red bar is the model in the staff tool.</p>
          <div className="mt-5">
            <MetricBars comparison={card.comparison} />
          </div>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-card">
          <h3 className="font-display text-lg font-bold text-navy">Features that move the score</h3>
          <p className="mt-1 text-sm text-slate-600">Grouped permutation importance on the holdout sample. Longer bars change ROC-AUC more when shuffled.</p>
          <div className="mt-5 space-y-2">
            {card.feature_importance.map((item) => (
              <div key={item.feature} className="grid grid-cols-[160px_1fr] items-center gap-2 text-sm">
                <span className="truncate text-slate-700">{item.label}</span>
                <div className="h-2.5 rounded-full bg-ice">
                  <div className="h-full rounded-full bg-navy" style={{ width: `${(item.importance / maxImportance) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-card">
        <h3 className="font-display text-lg font-bold text-navy">How a score becomes a worklist status</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          {card.bands.map((band) => (
            <div key={band.status} className="rounded-xl bg-mist p-3">
              <Badge status={band.status} />
              <p className="mt-3 text-sm font-bold text-navy">{band.range}</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">{band.meaning}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-600">{card.imbalance_note}</p>
      </section>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("assess");
  const [options, setOptions] = useState(FALLBACK_OPTIONS);
  const [examples, setExamples] = useState([]);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    fetch("/api/health")
      .then((response) => {
        if (!response.ok) setOffline(true);
        return response.json();
      })
      .then((health) => setOffline(!health.model_ready))
      .catch(() => setOffline(true));

    fetch("/api/model")
      .then((response) => (response.ok ? response.json() : null))
      .then((card) => {
        if (card?.options) setOptions(card.options);
      })
      .catch(() => {});

    fetch("/api/examples")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data?.examples) setExamples(data.examples);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen">
      <header className="bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-4">
            <img src="/cbz-logo.jpg" alt="CBZ Holdings" className="h-14 w-auto" />
            <div className="hidden sm:block">
              <p className="font-display text-sm font-bold uppercase tracking-[0.16em] text-navy">CBZ Bank</p>
              <p className="text-sm text-slate-600">Customer churn worklist</p>
            </div>
          </div>
          <p className="max-w-xs text-right text-xs leading-5 text-slate-500">
            Staff prototype. Predictions support judgement and do not replace it.
          </p>
        </div>
        <div className="h-1 bg-gradient-to-r from-navy via-navy to-brand" />
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {offline ? (
          <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-brand">
            The scoring service is not responding. Start the API, then refresh this page.
          </p>
        ) : null}
        <div className="mb-6 flex flex-wrap gap-2">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`rounded-full px-4 py-2 text-sm font-bold ${
                tab === item.id ? "bg-navy text-white" : "bg-white text-navy shadow-card"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        {tab === "assess" ? <Assess options={options} examples={examples} /> : null}
        {tab === "batch" ? <Batch /> : null}
        {tab === "model" ? <ModelQuality /> : null}
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs leading-5 text-slate-500">
        Built for the CBZ churn study. Customer data used outside the bank should already be anonymised under the Cyber and Data Protection Act [Chapter 12:07]. Brand colours and logo follow cbz.co.zw.
      </footer>
    </div>
  );
}
