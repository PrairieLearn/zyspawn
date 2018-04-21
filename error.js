const util = require('util')

class ZyError extends Error {
    constructor(message) {
        super(message);
    }
}

class TimeoutError extends ZyError {
    constructor(message) {
        super(message);
    }
}

class BadStateError extends ZyError {
    constructor(message) {
        super(message);
    }
}

class JSONParseError extends ZyError {
    constructor(message, badJSON) {
        super(util.format("%s in %s", message, badJSON));
    }
}

module.exports.ZyError = ZyError;
module.exports.TimeoutError = TimeoutError;
module.exports.BadStateError = BadStateError;
module.exports.JSONParseError = JSONParseError;