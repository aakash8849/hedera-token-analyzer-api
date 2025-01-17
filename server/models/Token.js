import mongoose from 'mongoose';

const tokenSchema = new mongoose.Schema({
  tokenId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  symbol: {
    type: String,
    required: true
  },
  decimals: {
    type: Number,
    required: true
  },
  totalSupply: {
    type: String,
    required: true
  },
  lastAnalyzed: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

export const Token = mongoose.model('Token', tokenSchema);
