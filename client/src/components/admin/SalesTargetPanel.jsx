import { useState } from "react";
import { api } from "../../utils/api";

export default function SalesTargetPanel() {
  const [period, setPeriod] = useState("daily");
  const [loading, setLoading] = useState(false);
  const [target, setTarget] = useState(null);
  const [error, setError] = useState(null);

  const generateTarget = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await api("/reports/auto", "POST", { period });
      setTarget(res);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow p-5">
      <h2 className="text-xl font-semibold mb-3">🎯 Sales Targets</h2>

      <div className="flex items-center gap-3">
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="border rounded px-3 py-2"
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>

        <button
          onClick={generateTarget}
          disabled={loading}
          className="bg-black text-white px-4 py-2 rounded disabled:opacity-60"
        >
          {loading ? "Calculating..." : "Auto Generate"}
        </button>
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-600">{error}</p>
      )}

      {target && (
        <div className="mt-4 text-sm">
          <p>
            <strong>Target:</strong> {target.target_amount}
          </p>
          <p>
            <strong>Baseline Avg:</strong>{" "}
            {Math.round(target.baseline_avg)}
          </p>
          <p>
            <strong>Growth Bias:</strong>{" "}
            {(target.growth_factor * 100).toFixed(1)}%
          </p>
        </div>
      )}
    </div>
  );
}
