/**
 * server/models/Sale.js
 * Sales schema for SmartStock Manager Pro
 * 🔐 Multi-tenant safe (Admin + Store scoped)
 */

const mongoose = require("mongoose");

const saleItemSchema = new mongoose.Schema(
  {
    item: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Item",
      required: true,
    },

    name: {
      type: String, // snapshot of item name
      required: true,
      trim: true,
    },

    saleType: {
      type: String,
      enum: ["retail", "wholesale"],
      default: "retail",
    },

    quantity: {
      type: Number,
      required: true,
      min: [1, "Quantity must be at least 1"],
    },

    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    total: {
      type: Number,
      required: true,
      min: 0,
    },

    profit: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

const saleSchema = new mongoose.Schema(
  {
    /* ================= ITEMS ================= */
    items: {
      type: [saleItemSchema],
      required: true,
      validate: v => v.length > 0,
    },

    /* ================= TOTALS ================= */
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    totalProfit: {
      type: Number,
      default: 0,
    },

    /* ================= PAYMENT ================= */
    paymentStatus: {
      type: String,
      enum: ["paid", "credit", "pending"],
      default: "paid",
      index: true,
    },

    customerName: {
      type: String,
      default: "Walk-in Customer",
      trim: true,
    },

    saleDate: {
      type: Date,
      default: Date.now,
      index: true,
    },

    /* ================= 🔐 OWNERSHIP ================= */
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

/* =====================================================
   INDEXES (PERFORMANCE + SECURITY)
===================================================== */
saleSchema.index({ admin: 1, store: 1, createdAt: -1 });

/* =====================================================
   AUTO TOTAL CALCULATION
===================================================== */
saleSchema.pre("validate", function (next) {
  if (this.items && this.items.length > 0) {
    this.totalAmount = this.items.reduce((sum, i) => sum + i.total, 0);
    this.totalProfit = this.items.reduce((sum, i) => sum + i.profit, 0);
  }
  next();
});

const Sale = mongoose.model("Sale", saleSchema);

module.exports = Sale;
