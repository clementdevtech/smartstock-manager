function getGrowthFactor(period, trend) {
  const base =
    period === "daily" ? 0.04 :
    period === "weekly" ? 0.06 :
    0.08;

  // soften if trend is negative
  if (trend < 0) return base / 2;

  // boost if strong trend
  if (trend > 0.15) return base + 0.03;

  return base;
}

exports.generateTarget = ({
  averageSales,
  trendRate,
  period,
}) => {
  const growthFactor = getGrowthFactor(period, trendRate);
  const target = Math.round(averageSales * (1 + growthFactor));

  return {
    target,
    growthFactor,
  };
};
