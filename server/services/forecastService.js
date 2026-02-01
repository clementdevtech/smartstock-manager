exports.forecastSales = (monthlySales) => {
  const avg =
    monthlySales.reduce((a, b) => a + b, 0) / monthlySales.length;

  return {
    nextMonth: Math.round(avg * 1.06),
    twoMonths: Math.round(avg * 1.12),
    threeMonths: Math.round(avg * 1.18),
  };
};
