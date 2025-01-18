import mongoose from 'mongoose';

const holderSchema = new mongoose.Schema({
  tokenId: {
    type: String,
    required: true,
    index: true
  },
  account: {
    type: String,
    required: true
  },
  balance: {
    type: Number,
    required: true
  },
  isTreasury: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

// Compound index for faster queries
holderSchema.index({ tokenId: 1, account: 1 }, { unique: true });

const Holder = mongoose.model('Holder', holderSchema);
export default Holder;
export { holderSchema };
