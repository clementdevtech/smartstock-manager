exports.calculateProgress = (actual, target) => {
  const percent = target ? Math.min((actual / target) * 100, 100) : 0;

  return {
    actual,
    target,
    percent: Math.round(percent),
    status:
      percent >= 100 ? "achieved" :
      percent >= 80 ? "on-track" :
      "behind",
  };
};
