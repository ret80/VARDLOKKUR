/** Polyfill for an event emitter. */
export default class EventEmitter {
    private events;
    /** Adds a listener for an event. */
    on(event: string, listener: Function): void;
    /** Emits an event. */
    emit(event: string, ...args: any[]): void;
}
//# sourceMappingURL=EventEmitter.d.ts.map