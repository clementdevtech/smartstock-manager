import { useEffect, useState } from "react";
import { api } from "../../utils/api";

export default function TargetProgressPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadProgress = async () => {
      try {
        const res = await api("/reports/target-progress?period=daily");
        setData(res);
      } catch (err) {
        console.error(err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadProgress();
  }, []);

  if (loading) return null;
  if (error) return null;
  if (!data) return null;

  const color =
    data.status === "achieved"
      ? "bg-green-500"
      : data.status === "on-track"
      ? "bg-yellow-400"
      : "bg-red-500";

  return (
    <div className="bg-white rounded-xl shadow p-5">
      <h2 className="text-xl font-semibold mb-3">📊 Target Progress</h2>

      <p className="text-sm mb-2">
        Actual: <strong>{data.actual}</strong> / Target:{" "}
        <strong>{data.target}</strong>
      </p>

      <div className="w-full bg-gray-200 rounded h-3 overflow-hidden">
        <div
          className={`${color} h-3 transition-all`}
          style={{ width: `${data.percent}%` }}
        />
      </div>

      <p className="mt-2 text-sm capitalize">
        Status: <strong>{data.status}</strong>
      </p>
    </div>
  );
}
