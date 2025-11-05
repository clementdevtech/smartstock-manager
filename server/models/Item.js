/**
 * server/models/Item.js
 * Inventory Item schema for SmartStock Manager Pro
 */

const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Item name is required'],
      trim: true,
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: ['electronics', 'groceries', 'clothing', 'home', 'other'],
      default: 'other',
    },
    wholesalePrice: {
      type: Number,
      required: [true, 'Wholesale price is required'],
      min: [0, 'Price cannot be negative'],
    },
    retailPrice: {
      type: Number,
      required: [true, 'Retail price is required'],
      min: [0, 'Price cannot be negative'],
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [0, 'Quantity cannot be negative'],
    },
    profitMargin: {
      type: Number,
      default: 0,
    },
    entryDate: {
      type: Date,
      required: [true, 'Entry date is required'],
    },
    expiryDate: {
      type: Date,
      default: null,
    },
    imageUrl: {
      type: String,
      default: '', // optional uploaded image or base64 URL
    },
    lowStockThreshold: {
      type: Number,
      default: 5,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

// Automatically calculate profit margin before save
itemSchema.pre('save', function (next) {
  if (this.retailPrice && this.wholesalePrice) {
    this.profitMargin = this.retailPrice - this.wholesalePrice;
  }
  next();
});

const Item = mongoose.model('Item', itemSchema);

module.exports = Item;
