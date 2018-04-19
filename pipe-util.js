const assert = require('assert');
const util = require('util');
const stream = require('stream');

const { TimeoutError, InternalError } = require('./error')

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
 * TODO
 */
class Port {
    /**
     * @param {stream.Readable} in_stream A raw stream to receive data from
     * @param {stream.Writable} out_stream A raw stream to send data to
     */
    constructor(in_stream, out_stream) {
        this._in = in_stream.pipe(new LineTransform());
        this._out = out_stream;
        this._busy = false;
        this._waiting_jobs = [];
    }

    /**
     * Send an object and get a response.
     * @param {Number} timeout Maximum waiting time (0 means no timeout)
     * @param {Object} obj The object to send
     * @param {Function(Error, Object)} callback Called when response received
     *                                           or any error happens
     */
    send(obj, timeout, callback) {
        this._waiting_jobs.push({obj: obj, timeout: timeout, callback: callback});
        if (!this._busy) {
            this._start_next_job();
        }
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

            if (this._waiting_jobs.length != 0) this._start_next_job();  

            job.callback(new TimeoutError());
        }, job.timeout);

        dataReceivedCallback = (response) => {
            // clean up
            if (job.timeout !== 0) clearTimeout(timer);
            this._busy = false;
            
            if (this._waiting_jobs.length != 0) this._start_next_job();
            
            let obj = parseJSON(response);
            if (obj instanceof InternalError) {
                job.callback(obj);
            } else {
                job.callback(null, obj);
            }
        };

        this._in.once('data', dataReceivedCallback);
        this._out.write(JSON.stringify(job.obj) + '\n');        
    }
}

function parseJSON(str) {
    try {
        return JSON.parse(str);
    } catch (error) {
        return new InternalError(error);
    }
}

module.exports.LineTransform = LineTransform;
module.exports.Port = Port;