const util = require('util')

/**
 * All errors happening inside zyspawn
 */
class ZyspawnError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ZyspawnError';
    }
}

/**
 * Errors due to problems of implementation.
 */
class InternalZyspawnError extends ZyspawnError {
    constructor(message) {
        super("Internal error: " + message);
    }
}

/**
 * Error when function is missing. Occurs in
 *      ZygoteInterface.call()
 */
class FunctionMissingError extends ZyspawnError {
    /**
     * @param {string} message the message correlated with the missing function
     */
    constructor(funcname, filename) {
        super("Missing function \"" + funcname + "\" in file \"" + filename + "\"");
    }
}

/**
 * Error when file is missing. Occurs in
 *      ZygoteInterface.call()
 */
class FileMissingError extends ZyspawnError {
    /**
     * @param {string} message the message correlated with the missing function
     */
    constructor(filename) {
        super("Missing file " + filename);
    }
}

/**
 * Error when a method is called in a wrong state. Occurs in
 *      ZygoteInterface.call()
 *      // TODO ...
 */
class InvalidOperationError extends ZyspawnError {
    constructor(issue) {
        super("invald operation: " + issue);
    }
}

/**
 * Error when a method is timesout
 *      ZygoteInterface.call()
 *      // TODO ...
 */
class TimeoutError extends ZyspawnError {
    constructor(timeoutDesc) {
        super("Timeout on: " + timeoutDesc);
    }
}


// const {ZyspawnError, InternalZyspawnError, FileMissingError, FunctionMissingError, InvalidOperationError, TimeoutError}
module.exports.ZyspawnError = ZyspawnError;
module.exports.InternalZyspawnError = InternalZyspawnError;
module.exports.FileMissingError = FileMissingError;
module.exports.FunctionMissingError = FunctionMissingError;
module.exports.InvalidOperationError = InvalidOperationError;
module.exports.TimeoutError = TimeoutError;
