const mongoose = require('mongoose');

const xiaomiCloudCredentialSchema = new mongoose.Schema({
  account: { type: String, required: true, unique: true, default: 'xiaomi-cn' },
  ciphertext: { type: String, required: true },
  iv: { type: String, required: true },
  auth_tag: { type: String, required: true },
  last_sync_at: { type: Date },
  backfill_completed_at: { type: Date },
  last_error: { type: String, maxlength: 300 },
  connected_at: { type: Date, required: true, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('XiaomiCloudCredential', xiaomiCloudCredentialSchema);
