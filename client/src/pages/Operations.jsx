import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../utils/api";
import Toast from "../components/Toast";

const METHODS = ["cash", "mpesa", "bank", "card", "other"];
const TABS = ["Stock", "Expenses", "Suppliers", "Customer credit"];
const today = () => new Date().toISOString().slice(0, 10);

export default function Operations() {
  const [tab, setTab] = useState("Stock");
  const [items, setItems] = useState([]);
  const [movements, setMovements] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [supplierPayments, setSupplierPayments] = useState([]);
  const [receivables, setReceivables] = useState([]);
  const [creditAmounts, setCreditAmounts] = useState({});
  const [toast, setToast] = useState(null);
  const [stockForm, setStockForm] = useState({ itemId: "", movementType: "receive", quantity: "", unitCost: "", supplierName: "" });
  const [expenseForm, setExpenseForm] = useState({ expenseType: "rent", name: "", amount: "", dueDate: today(), isRecurring: false, recurrenceInterval: "monthly" });
  const [supplierForm, setSupplierForm] = useState({ supplierName: "", amount: "", paymentMethod: "mpesa", reference: "" });
  const requestIds = useRef({});

  const loadData = useCallback(async () => {
    const [itemRows, movementRows, expenseRows, supplierRows, creditRows] = await Promise.all([
      api("/api/items", "GET"),
      api("/api/items/stock-movements", "GET"),
      api("/api/expenses", "GET"),
      api("/api/expenses/supplier-payments", "GET"),
      api("/api/sales/receivables", "GET"),
    ]);
    setItems(Array.isArray(itemRows) ? itemRows : []);
    setMovements(Array.isArray(movementRows) ? movementRows : []);
    setExpenses(Array.isArray(expenseRows) ? expenseRows : []);
    setSupplierPayments(Array.isArray(supplierRows) ? supplierRows : []);
    setReceivables(Array.isArray(creditRows) ? creditRows : []);
  }, []);

  useEffect(() => {
    loadData().catch((error) => setToast({ message: error.message || "Could not load business records", type: "error" }));
  }, [loadData]);

  const submitWithId = async (key, url, body) => {
    const requestId = requestIds.current[key] || (requestIds.current[key] = crypto.randomUUID());
    const response = await api(url, "POST", body(requestId));
    requestIds.current[key] = null;
    await loadData();
    return response;
  };

  const recordStock = async (event) => {
    event.preventDefault();
    try {
      await submitWithId("stock", "/api/items/stock-movements", (movementId) => ({ ...stockForm, movementId, quantity: Number(stockForm.quantity), unitCost: stockForm.unitCost === "" ? undefined : Number(stockForm.unitCost) }));
      setStockForm({ itemId: "", movementType: "receive", quantity: "", unitCost: "", supplierName: "" });
      setToast({ message: "Stock movement recorded", type: "success" });
    } catch (error) {
      setToast({ message: error.message || "Stock movement failed", type: "error" });
    }
  };

  const recordExpense = async (event) => {
    event.preventDefault();
    try {
      await submitWithId("expense", "/api/expenses", (expenseId) => ({ ...expenseForm, expenseId, amount: Number(expenseForm.amount), currency: "KES" }));
      setExpenseForm({ expenseType: "rent", name: "", amount: "", dueDate: today(), isRecurring: false, recurrenceInterval: "monthly" });
      setToast({ message: "Expense due recorded", type: "success" });
    } catch (error) {
      setToast({ message: error.message || "Expense could not be recorded", type: "error" });
    }
  };

  const payExpense = async (expense) => {
    try {
      await api(`/api/expenses/${expense.id}/pay`, "POST", { paymentMethod: "mpesa" });
      await loadData();
      setToast({ message: `${expense.name} marked paid`, type: "success" });
    } catch (error) {
      setToast({ message: error.message || "Payment could not be recorded", type: "error" });
    }
  };

  const recordSupplierPayment = async (event) => {
    event.preventDefault();
    try {
      await submitWithId("supplier", "/api/expenses/supplier-payments", (paymentId) => ({ ...supplierForm, paymentId, amount: Number(supplierForm.amount), currency: "KES" }));
      setSupplierForm({ supplierName: "", amount: "", paymentMethod: "mpesa", reference: "" });
      setToast({ message: "Supplier payment recorded", type: "success" });
    } catch (error) {
      setToast({ message: error.message || "Supplier payment failed", type: "error" });
    }
  };

  const collectCredit = async (sale) => {
    try {
      const key = `receipt-${sale.saleId}`;
      await submitWithId(key, `/api/sales/${sale.saleId}/receipts`, (receiptId) => ({
        receiptId,
        amount: Number(creditAmounts[sale.saleId] || 0),
        paymentMethod: "mpesa",
      }));
      setCreditAmounts((current) => ({ ...current, [sale.saleId]: "" }));
      setToast({ message: "Customer payment recorded", type: "success" });
    } catch (error) {
      setToast({ message: error.message || "Payment could not be recorded", type: "error" });
    }
  };

  const fieldClass = "w-full rounded border border-gray-300 bg-white p-2 dark:bg-gray-800 dark:border-gray-600";
  const tabs = {
    Stock: (
      <div className="space-y-5">
        <form onSubmit={recordStock} className="grid gap-3 md:grid-cols-3">
          <select className={fieldClass} value={stockForm.itemId} required onChange={(e) => setStockForm({ ...stockForm, itemId: e.target.value })}>
            <option value="">Choose item</option>
            {items.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.quantity ?? item.stock ?? 0} in stock)</option>)}
          </select>
          <select className={fieldClass} value={stockForm.movementType} onChange={(e) => setStockForm({ ...stockForm, movementType: e.target.value })}>
            <option value="receive">Receive stock</option><option value="adjustment">Count adjustment (+/-)</option><option value="damage">Damaged stock</option><option value="return">Customer return</option>
          </select>
          <input className={fieldClass} type="number" step="0.01" required placeholder={stockForm.movementType === "adjustment" ? "Signed quantity change" : "Quantity"} value={stockForm.quantity} onChange={(e) => setStockForm({ ...stockForm, quantity: e.target.value })} />
          {stockForm.movementType === "receive" && <input className={fieldClass} type="number" min="0" step="0.01" placeholder="Unit cost (Ksh)" value={stockForm.unitCost} onChange={(e) => setStockForm({ ...stockForm, unitCost: e.target.value })} />}
          {stockForm.movementType === "receive" && <input className={fieldClass} placeholder="Supplier" value={stockForm.supplierName} onChange={(e) => setStockForm({ ...stockForm, supplierName: e.target.value })} />}
          <button className="rounded bg-blue-700 px-4 py-2 font-medium text-white">Record movement</button>
        </form>
        <h2 className="font-semibold">Recent stock movements</h2>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Date</th><th>Type</th><th>Item ID</th><th>Qty change</th><th>Supplier</th></tr></thead><tbody>{movements.map((row) => <tr key={row.movementId || row.createdAt + row.itemId} className="border-b"><td className="p-2">{new Date(row.createdAt).toLocaleString()}</td><td>{row.movementType}</td><td>{row.itemId}</td><td>{row.quantity}</td><td>{row.supplierName || "-"}</td></tr>)}</tbody></table></div>
      </div>
    ),
    Expenses: (
      <div className="space-y-5">
        <form onSubmit={recordExpense} className="grid gap-3 md:grid-cols-3">
          <select className={fieldClass} value={expenseForm.expenseType} onChange={(e) => setExpenseForm({ ...expenseForm, expenseType: e.target.value })}><option value="rent">Rent</option><option value="utilities">Utilities</option><option value="salary">Salary</option><option value="transport">Transport</option><option value="general">Other</option></select>
          <input className={fieldClass} required placeholder="Expense name" value={expenseForm.name} onChange={(e) => setExpenseForm({ ...expenseForm, name: e.target.value })} />
          <input className={fieldClass} required type="number" min="0.01" step="0.01" placeholder="Amount (Ksh)" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} />
          <input className={fieldClass} required type="date" value={expenseForm.dueDate} onChange={(e) => setExpenseForm({ ...expenseForm, dueDate: e.target.value })} />
          <label className="flex items-center gap-2"><input type="checkbox" checked={expenseForm.isRecurring} onChange={(e) => setExpenseForm({ ...expenseForm, isRecurring: e.target.checked })} /> Repeat expense</label>
          {expenseForm.isRecurring && <select className={fieldClass} value={expenseForm.recurrenceInterval} onChange={(e) => setExpenseForm({ ...expenseForm, recurrenceInterval: e.target.value })}><option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="yearly">Yearly</option></select>}
          <button className="rounded bg-blue-700 px-4 py-2 font-medium text-white">Save due expense</button>
        </form>
        <h2 className="font-semibold">Expenses</h2>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Due</th><th>Expense</th><th>Amount</th><th>Status</th><th /></tr></thead><tbody>{expenses.map((expense) => <tr key={expense.id} className="border-b"><td className="p-2">{expense.dueDate}</td><td>{expense.name}{expense.isRecurring ? ` (${expense.recurrenceInterval})` : ""}</td><td>{expense.currency} {Number(expense.amount).toFixed(2)}</td><td>{expense.paidAt ? "Paid" : "Due"}</td><td>{!expense.paidAt && <button className="text-blue-700 underline" onClick={() => payExpense(expense)}>Mark paid</button>}</td></tr>)}</tbody></table></div>
      </div>
    ),
    Suppliers: (
      <div className="space-y-5">
        <form onSubmit={recordSupplierPayment} className="grid gap-3 md:grid-cols-3">
          <input className={fieldClass} required placeholder="Supplier" value={supplierForm.supplierName} onChange={(e) => setSupplierForm({ ...supplierForm, supplierName: e.target.value })} />
          <input className={fieldClass} required type="number" min="0.01" step="0.01" placeholder="Amount (Ksh)" value={supplierForm.amount} onChange={(e) => setSupplierForm({ ...supplierForm, amount: e.target.value })} />
          <select className={fieldClass} value={supplierForm.paymentMethod} onChange={(e) => setSupplierForm({ ...supplierForm, paymentMethod: e.target.value })}>{METHODS.map((method) => <option key={method} value={method}>{method.toUpperCase()}</option>)}</select>
          <input className={fieldClass} placeholder="Receipt / transaction reference" value={supplierForm.reference} onChange={(e) => setSupplierForm({ ...supplierForm, reference: e.target.value })} />
          <button className="rounded bg-blue-700 px-4 py-2 font-medium text-white">Record supplier payment</button>
        </form>
        <h2 className="font-semibold">Recent supplier payments</h2>
        <ul className="divide-y">{supplierPayments.map((payment) => <li key={payment.id} className="flex justify-between py-2"><span>{payment.supplierName} · {payment.paymentMethod} · {new Date(payment.paidAt).toLocaleDateString()}</span><span>{payment.currency} {Number(payment.amount).toFixed(2)}</span></li>)}</ul>
      </div>
    ),
    "Customer credit": (
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Customer</th><th>Receipt</th><th>Balance</th><th>Collect</th></tr></thead><tbody>{receivables.map((sale) => <tr key={sale.saleId} className="border-b"><td className="p-2">{sale.customerName || "Walk-in Customer"}</td><td>{sale.receiptNo}</td><td>{sale.currency} {Number(sale.balance).toFixed(2)}</td><td className="flex gap-2 py-2"><input className="w-28 rounded border p-1" type="number" min="0.01" max={sale.balance} step="0.01" value={creditAmounts[sale.saleId] || ""} onChange={(e) => setCreditAmounts({ ...creditAmounts, [sale.saleId]: e.target.value })} /><button className="text-blue-700 underline" onClick={() => collectCredit(sale)}>Record M-Pesa</button></td></tr>)}</tbody></table>{!receivables.length && <p className="py-5 text-gray-500">No outstanding customer balances.</p>}</div>
    ),
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Business operations</h1>
      <div className="flex flex-wrap gap-2 border-b">{TABS.map((name) => <button key={name} onClick={() => setTab(name)} className={`border-b-2 px-3 py-2 text-sm ${tab === name ? "border-blue-700 text-blue-700" : "border-transparent text-gray-600"}`}>{name}</button>)}</div>
      <section className="rounded border bg-white p-4 dark:bg-gray-900">{tabs[tab]}</section>
      {toast && <div className="fixed bottom-4 right-4 z-50"><Toast {...toast} onClose={() => setToast(null)} /></div>}
    </div>
  );
}
