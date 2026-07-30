const mongoose = require('mongoose');

const reportDeliverySchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true
  },
  report_type: {
    type: String,
    required: true,
    enum: ['daily', 'weekly', 'monthly', 'system_alert']
  },
  meter_id: {
    type: String,
    required: true
  },
  period_key: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'sending', 'sent', 'failed'],
    default: 'pending'
  },
  lock_token: String,
  locked_until: Date,
  attempt_count: {
    type: Number,
    default: 0
  },
  sent_at: Date,
  provider_message_id: String,
  last_error: String
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

reportDeliverySchema.index(
  { report_type: 1, meter_id: 1, period_key: 1 },
  { unique: true }
);

module.exports = mongoose.model('ReportDelivery', reportDeliverySchema);
