const mongoose = require("mongoose");

/**
 * Item Schema
 * - Admin owns Stores
 * - Store owns Items
 * - SKU / Barcode is store-specific
 */

const itemSchema = new mongoose.Schema(
  {
    /* ================= BASIC INFO ================= */
    name: {
      type: String,
      required: [true, "Item name is required"],
      trim: true,
    },

    // Barcode / SKU (POS CORE)
    sku: {
      type: String,
      required: [true, "SKU / Barcode is required"],
      trim: true,
      index: true,
    },

    category: {
      type: String,
      enum: [
        "electronics",
        "groceries",
        "clothing",
        "pharmacy",
        "restaurant",
        "hardware",
        "home",
        "other",
      ],
      default: "other",
    },

    unit: {
      type: String,
      enum: ["pcs", "kg", "liters", "cartons"],
      default: "pcs",
    },

    /* ================= PRICING ================= */
    wholesalePrice: {
      type: Number,
      required: true,
      min: 0,
    },

    retailPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    profitMargin: {
      type: Number,
      default: 0,
    },

    /* ================= STOCK ================= */
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },

    lowStockThreshold: {
      type: Number,
      default: 5,
    },

    /* ================= FOOD / PHARMACY ================= */
    batchNumber: {
      type: String,
      trim: true,
    },

    expiryDate: {
      type: Date,
      default: null,
    },

    entryDate: {
      type: Date,
      required: true,
    },

    /* ================= SUPPLIER ================= */
    supplier: {
      name: { type: String },
      phone: { type: String },
      email: { type: String },
    },

    imageUrl: {
      type: String,
      default: "",
    },

    /* ================= OWNERSHIP ================= */

    // System owner (license, analytics)
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Store / branch
    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },

    // User who last modified
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    /* ================= SYNC ================= */
    lastSyncedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

/* =====================================================
   INDEXES (CRITICAL FOR BARCODE SCANNING)
===================================================== */

// SKU must be unique per store per admin
itemSchema.index({ sku: 1, store: 1, admin: 1 }, { unique: true });

/* =====================================================
   AUTOMATIONS
===================================================== */

// Auto-calculate profit
itemSchema.pre("save", function (next) {
  if (this.retailPrice != null && this.wholesalePrice != null) {
    this.profitMargin = this.retailPrice - this.wholesalePrice;
  }
  next();
});

const Item = mongoose.model("Item", itemSchema);

module.exports = Item;
