const mongoose = require('mongoose');

const alertStateSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true
  },
  last_sent_at: {
    type: Date,
    default: null
  },
  locked_until: {
    type: Date,
    default: null
  },
  last_value: Number,
  last_source: String,
  last_error: String
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('AlertState', alertStateSchema);
