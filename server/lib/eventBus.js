import { EventEmitter } from 'events';

/**
 * Singleton in-memory event bus for broadcasting SSE events.
 * 
 * Usage:
 *   import { eventBus } from '../lib/eventBus.js';
 *   eventBus.emit('work-order:updated', { id, data });
 */
const eventBus = new EventEmitter();
eventBus.setMaxListeners(100); // allow many SSE clients

export { eventBus };




