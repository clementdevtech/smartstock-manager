const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

exports.forecastSales = (history) => {
  const values = history.map((row) => Number(row.revenue || 0));
  if (!values.length) {
    return {
      method: "linear trend over the last six calendar months",
      sampleCount: 0,
      history,
      forecast: [],
      assumptions: ["There is no sales history for this store and currency."],
      limitations: ["A forecast is unavailable until at least one monthly period is recorded."],
    };
  }

  const centerX = (values.length - 1) / 2;
  const centerY = values.reduce((sum, value) => sum + value, 0) / values.length;
  const denominator = values.reduce((sum, _value, index) => sum + (index - centerX) ** 2, 0);
  const slope = denominator
    ? values.reduce((sum, value, index) => sum + (index - centerX) * (value - centerY), 0) / denominator
    : 0;
  const lastMonth = new Date(`${history[history.length - 1].month}-01T00:00:00.000Z`);
  const forecast = [1, 2, 3].map((offset) => {
    const month = new Date(lastMonth);
    month.setUTCMonth(month.getUTCMonth() + offset);
    return {
      month: month.toISOString().slice(0, 7),
      revenue: roundMoney(Math.max(0, values[values.length - 1] + slope * offset)),
    };
  });

  return {
    method: "linear trend over the last six calendar months",
    sampleCount: values.length,
    history,
    forecast,
    assumptions: [
      "The recent monthly revenue trend continues for the next three months.",
      "Revenue is measured before tax and after discounts, in the currency shown.",
      "Months without recorded sales are treated as zero revenue.",
    ],
    limitations: [
      "This simple trend does not model seasonality, price changes, stockouts, or planned events.",
      "Treat the result as a planning signal, not a guarantee or accounting projection.",
    ],
  };
};