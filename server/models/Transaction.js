import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  tokenId: {
    type: String,
    required: true,
    index: true
  },
  timestamp: {
    type: Date,
    required: true,
    index: true
  },
  sender: {
    type: String,
    required: true
  },
  receiver: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  involvesTreasury: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

// Compound index for faster queries
transactionSchema.index({ tokenId: 1, timestamp: -1 });

const Transaction = mongoose.model('Transaction', transactionSchema);
export default Transaction;
export { transactionSchema };
