"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigurationError = exports.InternalError = void 0;
class InternalError extends Error {
    constructor(message) {
        super("[SYSTEM]: Whoops, something went wrong! Please report it at our GitHub page: " + message);
        this.name = "InternalError";
    }
}
exports.InternalError = InternalError;
;
class ConfigurationError extends Error {
    constructor(message) {
        super("[SYSTEM]: An error occurred when configuring an Entity or the System: " + message);
        this.name = "ConfigurationError";
    }
}
exports.ConfigurationError = ConfigurationError;
;
//# sourceMappingURL=Error.js.map