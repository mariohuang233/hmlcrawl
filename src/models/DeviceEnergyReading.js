const mongoose = require('mongoose');

const deviceEnergyReadingSchema = new mongoose.Schema({
  device_id: {
    type: String,
    required: true,
    trim: true,
    maxlength: 80,
    index: true
  },
  device_name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 80
  },
  entity_id: {
    type: String,
    trim: true,
    maxlength: 160
  },
  energy_kwh: {
    type: Number,
    required: true,
    min: 0,
    max: 10000000
  },
  collected_at: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  source: {
    type: String,
    trim: true,
    maxlength: 40,
    default: 'home-assistant'
  },
  reading_type: {
    type: String,
    enum: ['cumulative', 'daily'],
    default: 'cumulative',
    index: true
  }
}, {
  timestamps: true
});

deviceEnergyReadingSchema.index({ device_id: 1, collected_at: -1 }, { unique: true });

deviceEnergyReadingSchema.statics.getPeriodReadings = async function(deviceId, startDate, endDate) {
  const [baseline, readings] = await Promise.all([
    this.findOne({
      device_id: deviceId,
      collected_at: { $lte: startDate }
    }).sort({ collected_at: -1 }).lean(),
    this.find({
      device_id: deviceId,
      collected_at: { $gt: startDate, $lte: endDate }
    }).sort({ collected_at: 1 }).lean()
  ]);

  return {
    baseline,
    readings: baseline ? [baseline, ...readings] : readings
  };
};

module.exports = mongoose.model('DeviceEnergyReading', deviceEnergyReadingSchema);
