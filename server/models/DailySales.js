const mongoose = require('mongoose');

const expenseItemSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  note: {
    type: String,
    required: true,
    trim: true,
  },
  photoUrl: {
    type: String,
    default: '',
  },
  photoFilename: {
    type: String,
    default: '',
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
});

const dailySalesSchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    index: true,
  },
  date: {
    type: String, // Format 'YYYY-MM-DD' for straightforward date lookup
    required: true,
    index: true,
  },
  systemSales: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
  },
  expenses: [expenseItemSchema],
  totalExpenses: {
    type: Number,
    default: 0,
  },
  totalCash: {
    type: Number,
    default: 0,
    min: 0,
  },
  totalGpay: {
    type: Number,
    default: 0,
    min: 0,
  },
  // Single expense photo fields
  expensePhotoUrl: {
    type: String,
    default: '',
  },
  expensePhotoFilename: {
    type: String,
    default: '',
  },
  expenseNote: {
    type: String,
    default: '',
    trim: true,
  },
  // Sales tally: system sales = expenses + total cash + total GPay
  // totalAccounted = expenses + total cash + total GPay
  // difference = totalAccounted - systemSales (0 if balanced)
  totalAccounted: {
    type: Number,
    default: 0,
  },
  difference: {
    type: Number,
    default: 0,
  },
  isTallied: {
    type: Boolean,
    default: true,
  },
  notes: {
    type: String,
    default: '',
  },
  submittedBy: {
    userId: String,
    name: String,
    role: String,
  },
  lastUpdatedBy: {
    userId: String,
    name: String,
    role: String,
  },
}, { timestamps: true });

// Auto calculate totals before save
dailySalesSchema.pre('save', function (next) {
  // If totalExpenses was passed directly as a number, use it; otherwise sum expenses array
  if (this.totalExpenses === undefined || this.totalExpenses === null || isNaN(this.totalExpenses)) {
    const sumExpenses = (this.expenses || []).reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
    this.totalExpenses = Math.round(sumExpenses * 100) / 100;
  } else {
    this.totalExpenses = Math.round(Number(this.totalExpenses) * 100) / 100;
  }
  
  const cash = Number(this.totalCash) || 0;
  const gpay = Number(this.totalGpay) || 0;
  const sys = Number(this.systemSales) || 0;
  const exp = Number(this.totalExpenses) || 0;
  
  const accounted = Math.round((exp + cash + gpay) * 100) / 100;
  this.totalAccounted = accounted;
  this.difference = Math.round((accounted - sys) * 100) / 100;
  this.isTallied = (this.difference === 0);
  
  next();
});

// Compound unique index per branch and date
dailySalesSchema.index({ branchId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('DailySales', dailySalesSchema);

