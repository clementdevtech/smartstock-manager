const asyncHandler = require("express-async-handler");
const crypto = require("crypto");
const db = require("../sqlite");

const getTenant = (req) => ({
  adminId: req.user.adminId || req.user.id,
  storeId: req.user.storeId || "default-store",
});

const money = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function nextDueDate(date, interval) {
  const next = new Date(`${date}T00:00:00.000Z`);
  if (interval === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  else if (interval === "monthly") {
    const day = next.getUTCDate();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + 1);
    next.setUTCDate(Math.min(day, new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate()));
  } else if (interval === "yearly") {
    const month = next.getUTCMonth();
    const day = next.getUTCDate();
    next.setUTCDate(1);
    next.setUTCFullYear(next.getUTCFullYear() + 1);
    next.setUTCMonth(month);
    next.setUTCDate(Math.min(day, new Date(Date.UTC(next.getUTCFullYear(), month + 1, 0)).getUTCDate()));
  }
  else throw Object.assign(new Error("Unsupported recurrence interval"), { statusCode: 400 });
  return next.toISOString().slice(0, 10);
}

exports.createExpense = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const { adminId, storeId } = getTenant(req);
  const name = String(body.name || body.expense_name || "").trim();
  const expenseType = String(body.expenseType || body.expense_type || "general").trim();
  const amount = money(body.amount);
  const currency = String(body.currency || "KES").toUpperCase();
  const dueDate = String(body.dueDate || body.pay_date || new Date().toISOString().slice(0, 10));
  const isRecurring = Boolean(body.isRecurring);
  const recurrenceInterval = body.recurrenceInterval || null;

  if (!name || !Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    res.status(400);
    throw new Error("Provide an expense name, positive amount, and valid due date");
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    res.status(400);
    throw new Error("Currency must be a three-letter code");
  }
  if (isRecurring && !["weekly", "monthly", "yearly"].includes(recurrenceInterval)) {
    res.status(400);
    throw new Error("Recurring expense must be weekly, monthly, or yearly");
  }

  const id = body.expenseId || crypto.randomUUID();
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    res.status(400);
    throw new Error("Expense ID must be a UUID");
  }
  const parentExpenseId = isRecurring ? id : null;
  const paidAt = body.paid ? new Date().toISOString() : null;
  db.run(
    `INSERT OR IGNORE INTO local_expenses (
       id, expenseType, name, amount, currency, dueDate, paidAt, paymentMethod,
       supplierName, isRecurring, recurrenceInterval, nextDueDate,
       parentExpenseId, periodKey, notes, storeId, adminId, createdBy
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, expenseType, name, amount, currency, dueDate, paidAt,
      body.paymentMethod || null, body.supplierName || null, isRecurring ? 1 : 0,
      recurrenceInterval, isRecurring ? nextDueDate(dueDate, recurrenceInterval) : null,
      parentExpenseId, dueDate, body.notes || null, storeId, adminId, req.user.id]
  );

  const saved = db.get("SELECT * FROM local_expenses WHERE id = ? AND adminId = ? AND storeId = ?", [id, adminId, storeId]);
  if (!saved) {
    res.status(409);
    throw new Error("Expense ID is already used by another business record");
  }
  res.status(201).json({ success: true, expense: saved });
});

exports.getExpenses = asyncHandler(async (req, res) => {
  const { adminId, storeId } = getTenant(req);
  res.json(db.all(
    `SELECT * FROM local_expenses WHERE adminId = ? AND storeId = ? ORDER BY dueDate DESC, createdAt DESC`,
    [adminId, storeId]
  ));
});

exports.payExpense = asyncHandler(async (req, res) => {
  const { adminId, storeId } = getTenant(req);
  const { paymentMethod = "cash" } = req.body || {};
  if (!["cash", "mpesa", "card", "bank", "other"].includes(paymentMethod)) {
    res.status(400);
    throw new Error("Unsupported payment method");
  }
  const expense = db.get(
    `SELECT * FROM local_expenses WHERE id = ? AND adminId = ? AND storeId = ?`,
    [req.params.id, adminId, storeId]
  );
  if (!expense) {
    res.status(404);
    throw new Error("Expense not found");
  }
  if (expense.paidAt) return res.json({ success: true, expense, replayed: true });

  db.transaction(() => {
    db.run(
      `UPDATE local_expenses SET paidAt = CURRENT_TIMESTAMP, paymentMethod = ?,
        syncStatus = 'pending', updatedAt = CURRENT_TIMESTAMP
       WHERE id = ? AND paidAt IS NULL AND adminId = ? AND storeId = ?`,
      [paymentMethod, expense.id, adminId, storeId]
    );

    if (expense.isRecurring && expense.recurrenceInterval) {
      const dueDate = expense.nextDueDate || nextDueDate(expense.dueDate, expense.recurrenceInterval);
      const nextId = crypto.randomUUID();
      db.run(
        `INSERT OR IGNORE INTO local_expenses (
          id, expenseType, name, amount, currency, dueDate, isRecurring,
          recurrenceInterval, nextDueDate, parentExpenseId, periodKey, notes,
          supplierName, storeId, adminId, createdBy
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [nextId, expense.expenseType, expense.name, expense.amount, expense.currency,
          dueDate, expense.recurrenceInterval, nextDueDate(dueDate, expense.recurrenceInterval),
          expense.parentExpenseId || expense.id, dueDate, expense.notes,
          expense.supplierName, storeId, adminId, req.user.id]
      );
    }
  });

  res.json({ success: true, expense: db.get("SELECT * FROM local_expenses WHERE id = ?", [expense.id]) });
});

exports.createSupplierPayment = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const { adminId, storeId } = getTenant(req);
  const supplierName = String(body.supplierName || "").trim();
  const amount = money(body.amount);
  const paymentMethod = String(body.paymentMethod || "").toLowerCase();
  const currency = String(body.currency || "KES").toUpperCase();
  const id = body.paymentId || crypto.randomUUID();
  if (!supplierName || amount <= 0 || !Number.isFinite(amount) || !/^[A-Z]{3}$/.test(currency) || !["cash", "mpesa", "card", "bank", "other"].includes(paymentMethod)) {
    res.status(400);
    throw new Error("Provide a supplier, positive amount, and valid payment method");
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    res.status(400);
    throw new Error("Payment ID must be a UUID");
  }

  const inserted = db.run(
    `INSERT OR IGNORE INTO supplier_payments (
      id, supplierName, amount, currency, paymentMethod, reference, notes,
      storeId, adminId, createdBy
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, supplierName, amount, currency,
      paymentMethod, body.reference || null, body.notes || null,
      storeId, adminId, req.user.id]
  );
  const payment = db.get(
    `SELECT * FROM supplier_payments WHERE id = ? AND adminId = ? AND storeId = ?`,
    [id, adminId, storeId]
  );
  if (!payment) {
    res.status(409);
    throw new Error("Payment ID is already used by another business record");
  }
  res.status(201).json({
    success: true,
    payment,
    replayed: inserted.changes === 0,
  });
});

exports.getSupplierPayments = asyncHandler(async (req, res) => {
  const { adminId, storeId } = getTenant(req);
  res.json(db.all(
    `SELECT * FROM supplier_payments WHERE adminId = ? AND storeId = ? ORDER BY paidAt DESC LIMIT 500`,
    [adminId, storeId]
  ));
});