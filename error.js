const util = require('util')

/**
 * All errors happening inside zyspawn
 */
class ZyspawnError extends Error {
    constructor(message) {
        super(message);
    }
}

/**
 * Errors due to problems of implementation.
 */
class InternalZyspawnError extends ZyspawnError {
    constructor(message) {
        super(message);
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
    constructor(message) {
        super(message);
    }
}

/**
 * Error when a method is called in a wrong state. Occurs in
 *      ZygoteInterface.call()
 *      // TODO ...
 */
class InvalidOperationError extends ZyspawnError {
    constructor(message) {
        super(message);
    }
}


module.exports.ZyspawnError = ZyspawnError;
module.exports.InternalZyspawnError = InternalZyspawnError;
module.exports.FunctionMissingError = FunctionMissingError;
module.exports.InvalidOperationError = InvalidOperationError;
