const mongoose = require("mongoose");

/**
 * Item Schema
 * - Admin owns Stores
 * - Store owns Items
 * - User operates within a Store
 */

const itemSchema = new mongoose.Schema(
  {
    /* ---------------- BASIC INFO ---------------- */
    name: {
      type: String,
      required: [true, "Item name is required"],
      trim: true,
    },

    sku: {
      type: String,
      trim: true,
      index: true, // barcode / SKU for supermarkets
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

    /* ---------------- PRICING ---------------- */
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

    /* ---------------- STOCK ---------------- */
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },

    lowStockThreshold: {
      type: Number,
      default: 5,
    },

    /* ---------------- PHARMACY / FOOD ---------------- */
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

    /* ---------------- SUPPLIER ---------------- */
    supplier: {
      name: String,
      phone: String,
    },

    imageUrl: {
      type: String,
      default: "",
    },

    /* ---------------- OWNERSHIP & ACCESS ---------------- */

    /**
     * Admin (system owner)
     * Used for licensing, online activation, analytics
     */
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    /**
     * Store / Branch
     * Allows multi-branch businesses
     */
    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },

    /**
     * User who created / last modified item
     */
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

/* ---------------- AUTOMATIONS ---------------- */

// Auto-calculate profit
itemSchema.pre("save", function (next) {
  if (this.retailPrice != null && this.wholesalePrice != null) {
    this.profitMargin = this.retailPrice - this.wholesalePrice;
  }
  next();
});

const Item = mongoose.model("Item", itemSchema);

module.exports = Item;
