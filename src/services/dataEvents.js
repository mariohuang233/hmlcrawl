const EventEmitter = require('events');

const dataEvents = new EventEmitter();

dataEvents.setMaxListeners(20);

module.exports = dataEvents;
