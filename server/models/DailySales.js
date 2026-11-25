const mongoose = require('mongoose');

// One document per branch per day: the evening cash tally.
//
//   The tally rule:  system sales  =  expenses + cash + GPay
//   difference = (expenses + cash + GPay) - system sales
//   difference > 0 → excess money,  difference < 0 → shortage,  0 → tallied.

const expenseSchema = new mongoose.Schema({
  amount: { type: Number, required: true, min: 0 },
  note: { type: String, default: '', trim: true },
  photoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Photo' },
  photoUrl: { type: String, default: '' }, // legacy (old disk-based uploads)
  photoFilename: { type: String, default: '' }, // legacy
  uploadedAt: { type: Date, default: Date.now },
});

const personSchema = { userId: String, name: String, role: String };

const dailySalesSchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    date: { type: String, required: true, index: true }, // 'YYYY-MM-DD'
    systemSales: { type: Number, default: 0, min: 0 },
    expenses: [expenseSchema],
    totalExpenses: { type: Number, default: 0 },
    totalCash: { type: Number, default: 0, min: 0 },
    totalGpay: { type: Number, default: 0, min: 0 },
    totalAccounted: { type: Number, default: 0 },
    difference: { type: Number, default: 0 },
    isTallied: { type: Boolean, default: true },
    notes: { type: String, default: '' },
    submittedBy: personSchema,
    lastUpdatedBy: personSchema,
  },
  { timestamps: true }
);

dailySalesSchema.index({ branchId: 1, date: 1 }, { unique: true });

const round2 = (n) => Math.round(n * 100) / 100;

/** The single place where the tally maths lives. */
dailySalesSchema.statics.computeTally = ({ systemSales = 0, expenses = [], totalCash = 0, totalGpay = 0 }) => {
  const totalExpenses = round2(expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0));
  const totalAccounted = round2(totalExpenses + totalCash + totalGpay);
  const difference = round2(totalAccounted - systemSales);
  return { totalExpenses, totalAccounted, difference, isTallied: difference === 0 };
};

dailySalesSchema.pre('save', function () {
  Object.assign(this, this.constructor.computeTally(this));
});

module.exports = mongoose.model('DailySales', dailySalesSchema);
