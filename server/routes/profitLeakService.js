exports.detectLeaks = ({ profit, expenses }) => {
  const totalExpenses = expenses.reduce((a, b) => a + b.total, 0);
  const margin = profit - totalExpenses;

  const alerts = [];

  if (margin < profit * 0.4)
    alerts.push("⚠️ High expenses reducing profit margin");

  const salary = expenses.find(e => e.expense_type === "salary");
  if (salary && salary.total > profit * 0.35)
    alerts.push("⚠️ Salary costs too high");

  return alerts;
};
