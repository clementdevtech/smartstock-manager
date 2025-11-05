/**
 * server/models/Sale.js
 * Sales schema for SmartStock Manager Pro
 */

const mongoose = require('mongoose');

const saleSchema = new mongoose.Schema(
  {
    items: [
      {
        item: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Item',
          required: true,
        },
        name: String, // snapshot of item name
        saleType: {
          type: String,
          enum: ['retail', 'wholesale'],
          default: 'retail',
        },
        quantity: {
          type: Number,
          required: true,
          min: [1, 'Quantity must be at least 1'],
        },
        unitPrice: {
          type: Number,
          required: true,
        },
        total: {
          type: Number,
          required: true,
        },
        profit: {
          type: Number,
          default: 0,
        },
      },
    ],
    totalAmount: {
      type: Number,
      required: true,
      min: [0, 'Total cannot be negative'],
    },
    totalProfit: {
      type: Number,
      default: 0,
    },
    paymentStatus: {
      type: String,
      enum: ['paid', 'credit', 'pending'],
      default: 'paid',
    },
    customerName: {
      type: String,
      default: 'Walk-in Customer',
      trim: true,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

// Pre-save hook to auto-sum profits
saleSchema.pre('save', function (next) {
  if (this.items && this.items.length > 0) {
    this.totalAmount = this.items.reduce((acc, i) => acc + i.total, 0);
    this.totalProfit = this.items.reduce((acc, i) => acc + i.profit, 0);
  }
  next();
});

const Sale = mongoose.model('Sale', saleSchema);

module.exports = Sale;
