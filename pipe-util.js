const assert = require('assert');
const util = require('util');
const stream = require('stream');

const { TimeoutError, JSONParseError } = require('./error');

/**
 * Transform a stream of bytes into a stream of String (break by newline).
 */
class LineTransform extends stream.Transform {
    constructor(options) {
        options = options || {};
        options.readableObjectMode = true;
        options.decodeStrings = false;
        super(options);
        this._buffer = "";
    }

    _transform(data, encoding, callback) {
        this._buffer += data;
        let end = this._buffer.indexOf('\n');
        if (end != -1) {
            this.push(this._buffer.substring(0, end));
            this._buffer = this._buffer.substring(end+1);
        }
        callback();
    }

    _flush(callback) {
        this.push(this._buffer);
        this._buffer = "";
        callback();
    }
}

/**
 * Wraps the logic of two-way communication through two pipes (one to
 * send and another to receive). Messages are expected to be strings of
 * JSON objects and seperated by newlines.
 * 
 * Timeout is also supported. Note that a timeout of one message will
 * lead to errors in all subsequent message sending. This is because
 * the sender cannot distinguish a late response for a timeout message
 * from the response for the current message (unless we specify an ID
 * for each message, which adds more complexity).
 */
class Port {
    /**
     * @param {stream.Writable} sender A raw stream to send data to
     * @param {stream.Readable} receiver A raw stream to receive data from
     */
    constructor(sender, receiver) {
        this._in = receiver.pipe(new LineTransform());
        this._out = sender;
        this._busy = false;
        this._waiting_jobs = [];
        this._broken = false;
    }

    /**
     * Send an object and get a response.
     * @param {Number} timeout Maximum waiting time (0 means no timeout)
     * @param {Object} obj The object to send
     * @param {Function(Error, Object)} callback Called when response received
     *                                           or any error happens
     */
    send(obj, timeout, callback) {
        if (this._broken) {
            callback(new InternalError());
        } else {
            this._waiting_jobs.push({obj: obj, timeout: timeout, callback: callback});
            if (!this._busy) {
                this._start_next_job();
            }
        }
    }

    /**
     * Check if this Port is busy (waiting for some response).
     */
    isBusy() {
        return this._busy;
    }

    /**
     * Check if this Port is broken (unable to send/receive objects)
     */
    isBroken() {
        return this._broken;
    }

    _start_next_job() {
        assert(!this._busy);
        assert(this._waiting_jobs.length != 0);

        this._busy = true;
        let job = this._waiting_jobs.shift();
        
        let timer, dataReceivedCallback;

        timer = job.timeout === 0 ? null : setTimeout(() => {
            // clean up
            this._in.removeListener('data', dataReceivedCallback);
            this._busy = false;

            this._break(job, new TimeoutError());
        }, job.timeout);

        dataReceivedCallback = (response) => {
            // clean up
            if (job.timeout !== 0) clearTimeout(timer);
            this._busy = false;
            
            let obj = parseJSON(response);
            if (obj instanceof SyntaxError) {
                this._break(job, new JSONParseError(obj.message, response));
            } else {
                if (this._waiting_jobs.length != 0) this._start_next_job();                
                job.callback(null, obj);
            }
        };

        this._in.once('data', dataReceivedCallback);
        this._out.write(JSON.stringify(job.obj) + '\n');        
    }

    _break(current_job, err) {
        this._broken = true;
        current_job.callback(err);
        this._waiting_jobs.forEach((job) => {
            job.callback(new InternalError()); //TODO
        });
        this._waiting_jobs.length = 0;
    }
}

function parseJSON(str) {
    try {
        return JSON.parse(str);
    } catch (error) {
        return error;
    }
}

module.exports.LineTransform = LineTransform;
module.exports.Port = Port;