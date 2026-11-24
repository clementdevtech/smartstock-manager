import { useCallback, useEffect, useState } from "react";
import { api } from "../utils/api";
import Toast from "../components/Toast";

const monthStart = () => `${new Date().toISOString().slice(0, 7)}-01`;
const today = () => new Date().toISOString().slice(0, 10);
const amount = (currency, value) => `${currency} ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Reports() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [report, setReport] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [toast, setToast] = useState(null);

  const loadReport = useCallback(async () => {
    try {
      const [financial, salesForecast] = await Promise.all([
        api(`/api/reports/financial?from=${from}&to=${to}`, "GET"),
        api("/api/forecast", "GET"),
      ]);
      setReport(financial);
      setForecast(salesForecast);
    } catch (error) {
      setToast({ message: error.message || "Could not load financial reports", type: "error" });
    }
  }, [from, to]);

  useEffect(() => { loadReport(); }, [loadReport]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold">Financial reports</h1>
        <div className="flex flex-wrap gap-3">
          <label className="text-sm">From<input className="ml-2 rounded border p-2 dark:bg-gray-800" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label className="text-sm">To<input className="ml-2 rounded border p-2 dark:bg-gray-800" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        </div>
      </div>

      {report && <>
        <p className="text-sm text-gray-600 dark:text-gray-300">{report.from} to {report.to}. {report.basis}.</p>
        {report.byCurrency.length === 0 ? <p className="py-8 text-gray-500">No financial activity in this period.</p> : report.byCurrency.map((row) => (
          <section key={row.currency} className="space-y-4 border-t py-4">
            <h2 className="text-lg font-semibold">{row.currency}</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
              <div><dt className="text-sm text-gray-500">Revenue, before tax</dt><dd className="font-medium">{amount(row.currency, row.revenue)}</dd></div>
              <div><dt className="text-sm text-gray-500">Tax collected</dt><dd className="font-medium">{amount(row.currency, row.taxCollected)}</dd></div>
              <div><dt className="text-sm text-gray-500">Gross profit</dt><dd className="font-medium">{amount(row.currency, row.grossProfit)}</dd></div>
              <div><dt className="text-sm text-gray-500">Paid operating expenses</dt><dd className="font-medium">{amount(row.currency, row.expenses)}</dd></div>
              <div><dt className="text-sm text-gray-500">Net profit</dt><dd className={`font-semibold ${row.netProfit < 0 ? "text-red-600" : "text-green-700"}`}>{amount(row.currency, row.netProfit)}</dd></div>
              <div><dt className="text-sm text-gray-500">Customer balances due</dt><dd className="font-medium">{amount(row.currency, row.receivables)}</dd></div>
              <div><dt className="text-sm text-gray-500">Cash collected in period</dt><dd className="font-medium">{amount(row.currency, row.collected)}</dd></div>
              <div><dt className="text-sm text-gray-500">Supplier payments (cash flow)</dt><dd className="font-medium">{amount(row.currency, row.supplierPayments)}</dd></div>
            </dl>
            <p className="text-xs text-gray-500">{row.transactions} sales. Supplier payments are shown as cash flow and are not subtracted again from profit; cost of goods is recognized from each sale’s cost snapshot.</p>
          </section>
        ))}
      </>}

      <section className="space-y-3 border-t pt-5">
        <h2 className="text-lg font-semibold">Sales forecast</h2>
        {!forecast ? <p className="text-sm text-gray-500">Loading forecast...</p> : forecast.forecasts.map((series) => (
          <div key={series.currency} className="space-y-3">
            <h3 className="font-medium">{series.currency} · {series.method}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">Based on {series.sampleCount} calendar months of history.</p>
            {series.forecast.length ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{series.forecast.map((point) => <div key={point.month} className="border-b py-2"><span className="text-sm text-gray-500">{point.month}</span><p className="font-semibold">{amount(series.currency, point.revenue)}</p></div>)}</div> : <p className="text-sm text-gray-500">Not enough history to estimate sales.</p>}
            <div className="grid gap-4 text-sm md:grid-cols-2">
              <div><h4 className="font-medium">Assumptions</h4><ul className="list-disc pl-5">{series.assumptions.map((line) => <li key={line}>{line}</li>)}</ul></div>
              <div><h4 className="font-medium">Limitations</h4><ul className="list-disc pl-5">{series.limitations.map((line) => <li key={line}>{line}</li>)}</ul></div>
            </div>
          </div>
        ))}
      </section>

      {toast && <div className="fixed bottom-4 right-4 z-50"><Toast {...toast} onClose={() => setToast(null)} /></div>}
    </div>
  );
}
