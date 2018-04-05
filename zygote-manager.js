/**
 * @fileoverview
 * This module defines ZygoteManager (see below).
 *
 * Dependencies:
 *  ./zygote.py
 *
 * Notice:
 * This file is an API description for now!
 * Implementation here is just for testing.
 */
 const _ = require('lodash');
const util = require('util');

const DIRTY = Symbol('DIRTY');
const CLEAN = Symbol('CLEAN');
const WORKING  = Symbol('WORKING');
const IN_CALL = Symbol('IN_CALL');
const EXITING = Symbol('EXITING');
const EXITED  = Symbol('EXITED');

/**
 * Error object used for when function is missing
 */
class FunctionMissingError extends Error {
  /**
   * @param {JSON} message the message correlated with the missing function
   */
  constructor(message) {
    super(message);
    this.name = 'FunctionMissingError';
  }
}

/**
 * An object which manages a python zygote. All communications between
 * javascript and python is wrapped inside this object.
 */
class ZygoteManager {
    /**
     * Create a ZygoteManager and initialize it.
     * @param {function(Error, ZygoteManager)} callback Called after the underlying
     *                                                  zygote is initialized
     */
    static create(callback) {
        console.log("[ZygoteManager] Creating zygote");
        // TODO label create function as createPython

        // Options for constructor
        const cmd = 'python3';
        // TODO python-caller-trampoline is an awful name, rename it to zygote.py
        const pythonTrampoline = path.join(__dirname, 'python-caller-trampoline.py');
        const args = ['-B', pythonTrampoline];
        const env = _.clone(process.env);
        // PYTHONIOENCODING might not be needed once we switch to Python 3.7
        // https://www.python.org/dev/peps/pep-0538/
        // https://www.python.org/dev/peps/pep-0540/
        env.PYTHONIOENCODING = 'utf-8';
        const options = {
            cwd: __dirname,
            stdio: ['pipe', 'pipe', 'pipe', 'pipe'], // stdin, stdout, stderr, and an extra one for data
            env,
        };

        var manager = new ZygoteManager(cmd, args, options, callback);
    }

    constructor(command, args, options, callback) {
        // setup pipes:
        //  STDIN(worker), STDOUT(worker), STDERR(worker), data(worker),
        //  command(zygote), message(zygote), status(exit/error worker)
        options = options || {};
        options['stdio'] = ['pipe', 'pipe', 'pipe', 'pipe', 'pipe', 'pipe', 'pipe'];
        this.child = child_process.spawn(command, args, options);

        this.stdin = this.child.stdin;
        this.stdout = this.child.stdout;
        this.stderr = this.child.stderr;
        this.stdio3 = this.child.stdio[3];
        // receive messages from Zygote
        this.child.stdio[5].setEncoding('utf8');
        this.child.stdio[6].setEncoding('utf8');

        this.state = CREATING;
        // Call back functions used by Manager for when transition to next node is done
        this.createCallBack = callback;
        this.prepCallBack = null;
        this.incallCallBack = null;
        this.exitingCallBack = null;
        // tracks whether or not zygote.py has been spawned
        this.zygoteSpawned = false;
        // tracks whehter or not zygote.py has spawned worker
        this.workerSpawned = false;
        this._checkState();
        this.zygote.stderr.on('data', this._handleStderrData.bind(this));
        this.zygote.stdout.on('data', this._handleStdoutData.bind(this));
        this.zygote.stdio3.on('data', this._handleStdio3Data.bind(this));

        this.child.stdio[5].on('data', this._zygoteMessageHandler.bind(this));
        // Call status on zygote.py inorder to determine if it is alive
        // TODO ADD TIMEOUT

        this.child.stdio[4].write(JSON.stringify({action: 'status'}));
        this.child.stdio[4].write('\n');

        // After 3 seconds, assume creating zygote failed
        this.timeoutID = setTimeout(() => {
            callback(new Error("Timeout creating zygote"), null);
        }, 3000);
    }

    /**
     * Run a function in a python script.
     * @param {String} fileName The file where the function resides
     * @param {String} functionName The function to run
     * @param {object} arg JSON object as arguments for the function
     * @param {function(Error, Output)} callback Called when the result is computed
     *                                           or any error happens
     *
     * Notice:
     * Whenever an error happens, underlying resources will be released
     * and this ZygoteManager should no longer be used. Users need to create
     * a new ZygoteManager and restart their work.
     */
    run(fileName, functionName, arg, callback) {
        console.log(util.format("[ZygoteManager] Running %s:%s", fileName, functionName));
        if (![READY].includes(this.state)) {
          return callback(new Error('invalid internal PythonCaller state for call()'));
        }

        if (!this._checkState([READY])) {
          return callback(new Error('invalid PythonCaller state'));
        }

        // TODO allow user to specify there own options
        const localOptions = _.defaults(null, {
            cwd: __dirname,
            paths: [],
            timeout: 20000, // FIXME: this number (equivalent to 20 seconds) should not have to be this high
        });

        const callData = {
            fileName, functionName, args,
            cwd: localOptions.cwd,
            paths: localOptions.paths,
        };
        const callDataString = JSON.stringify(callData);
        this.incallCallBack = callback;
        //this.timeoutID = setTimeout(this._timeout.bind(this), localOptions.timeout);

        this.outputStdout = '';
        this.outputStderr = '';
        this.outputBoth = '';
        this.outputData = '';

        this.lastCallData = callData;
        this.state = IN_CALL;
        this._checkState();
        this.stdinWrite(callDataString + '\n');
        setTimeout(() => {
            console.log(util.format("[ZygoteManager] Finish %s.%s", fileName, functionName));
            callback(null, new Output("<stdout>", "<stderr>", "<result>"));
        }, 1000);
    }

    _createdMessageHandler(message) {
        if (message['success']) {
          this._clearTimeout();
          this.state = INIT;
          this.createCallBack(null);
          this.createCallBack = null;
        } else {
          this.createCallBack(new Error(message['message']));
          this.createCallBack = null;
          this._logError('ZygoteManager state ' + this.state
            + ': Failed with messsage"' + message['message'] + '"');
        }
    }

    _initMessageHandler(message) {
        if (message['success']) {
          // TODO Add handler here
          logger.info('Cannot handle message ' + message['message'] + ' while in state INIT');
        } else {
          // TODO Add Handler here
          this._logError('ZygoteManager state ' + this.state
            + ': Failed with messsage "' + message['message'] + '"');
        }
    }

    _prepMessageHandler(message) {
        if (message['success']) {
          this._clearTimeout();
          this.state = READY;
          this.prepCallBack(null, new ZygoteInterface(this));
          this.prepCallBack = null;
        } else {
          this.prepCallBack(new Error(message['message']), null);
          this._logError('ZygoteManager state ' + this.state
            + ': Failed with messsage"' + message['message'] + '"');
          this.prepCallBack = null;
        }
    }

    _readyMessageHandler(message) {
        if (message['success']) {
          // TODO Add handler here
          logger.info('Cannot handle message ' + message['message'] + ' while in state READY');
        } else {
          // TODO Add Handler here
          this._logError('ZygoteManager state ' + this.state
            + ': Failed with messsage "' + message['message'] + '"');
        }
    }

    _incallMessageHandler(message) {
        if (message['success']) {
            //this._clearTimeout();
            // TODO add some handler here?
        } else {
            this.incallCallBack(new Error(message['message']), null);
            this._logError('Failed with messsage"' + message['message'] + '"');
            // TODO Error handle better
        }
    }

    _exitingMessageHandler(message) {
        if (message['success']) {
            this.state = EXITED;
            // TODO Return to pool
            this.exitingCallBack(null);
        } else {
            this._logError('Failed with messsage"' + message['message'] + '"');
            this.exitingCallBack(new Error(message['message']));
        }
    }

    _zygoteMessageHandler(data) {
        this.messageBuffer += data;
        if (this.messageBuffer.indexOf('\n') >= 0) {
            var arr = this.messageBuffer.split('\n');
            this.messageBuffer = arr.slice(1, arr.length).join('\n');
            const message = JSON.parse(arr[0]);
            logger.info('ZygoteManager: handling message: ' + message['success']);
            switch (this.state) {
              case CREATING:
                // TODO Create helper methods for handling messages for each state
                this._createdMessageHandler(message);
                break;
              case INIT:
                this._initMessageHandler(message);
                break;
              case PREPPING:
                this._prepMessageHandler(message);
                break;
              case READY:
                this._readyMessageHandler(message);
                break;
              case IN_CALL:
                this._incallMessageHandler(message);
                break;
              case EXITING:
                this._exitingMessageHandler(message);
                break;
              default:
                this._logError('ZygoteManager: Unsure of how to handle message "' + message['message'] + '" while in state: ' + this.state);
                // In an invalid state
            }
            this.messageBuffer = '';
        }
    }

    killMyZygote() {
        if (![CREATING,INIT].includes(this.state)) {
          return new Error('Cannot kill zygote until worker is killed');
        }
        if (!this._checkState([CREATING,INIT])) {
          return new Error('invalid ZygoteManager state');
        }
        this.state = EXITING;

        this.child.kill('SIGINT');
    }

    killMyZygote() {
      if (![CREATING,INIT].includes(this.state)) {
        return new Error('Cannot kill zygote until worker is killed');
      }
      if (!this._checkState([CREATING,INIT])) {
        return new Error('invalid ZygoteManager state');
      }
      this.state = EXITING;

      this.child.kill('SIGINT');
    }

    _checkState(allowedStates) {
        if (allowedStates && !allowedStates.includes(this.state)) {
            const allowedStatesList = '[' + _.map(allowedStates, String).join(',') + ']';
            return this._logError('Expected PythonCaller states ' + allowedStatesList + ' but actually have state ' + String(this.state));
        }

        let hasZygoteSpawned, hasWorkerSpawned, hasTimeout;
        switch (this.state) {
          case CREATING:
            hasZygoteSpawned = false;
            hasWorkerSpawned = false;
            hasTimeout = true;
            break;
          case INIT:
            hasZygoteSpawned = true;
            hasWorkerSpawned = false;

            hasTimeout = false;
            break;
          case PREPPING:
            hasZygoteSpawned = true;
            hasWorkerSpawned = false;
            hasTimeout = true;
            break;
          case READY:
            hasZygoteSpawned = true;
            hasWorkerSpawned = true;
            hasTimeout = false;
            break;
          case IN_CALL:
            hasZygoteSpawned = true;
            hasWorkerSpawned = true;
            hasTimeout = true;
            break;
          case EXITING:
            hasZygoteSpawned = true;
            hasWorkerSpawned = true;
            hasTimeout = true;
            break;
          case EXITED:
            hasZygoteSpawned = true;
            hasWorkerSpawned = false;
            hasTimeout = false;
            break;
          default:
            return this._logError('ZygoteManager state "' + String(this.state) + ': Invalid state');
        }

        if (hasZygoteSpawned != null) {
            if (!hasZygoteSpawned && this.zygoteSpawned != null) return this._logError('ZygoteManager state "' + String(this.state) + '": zygoteSpawned should be null');
            if (hasZygoteSpawned && this.zygoteSpawned == null) return this._logError('ZygoteManager state "' + String(this.state) + '": zygoteSpawned should not be null');
        }
        if (hasWorkerSpawned != null) {
            if (!hasWorkerSpawned && this.workerSpawned != null) return this._logError('ZygoteManager state "' + String(this.state) + '": workerSpawned should be null');
            if (hasWorkerSpawned && this.workerSpawned == null) return this._logError('ZygoteManager state "' + String(this.state) + '": workerSpawned should not be null');
        }
        if (hasTimeout != null) {
            if (!hasTimeout && this.timeoutID != null) return this._logError('ZygoteManager state "' + String(this.state) + '": timeoutID should be null');
            if (hasTimeout && this.timeoutID == null) return this._logError('ZygoteManager state "' + String(this.state) + '": timeoutID should not be null');
        }

        return true;
    }

    _doneCall(err, data, output) {
        if (err) err.data = this._errorData();
        const c = this.incallCallBack;
        this.incallCallBack = null;
        c(err, data, output);
    }

    _callIsFinished() {
        if (!this._checkState([IN_CALL])) return;
        //this._clearTimeout();
        let data, err = null;
        try {
            data = JSON.parse(this.outputData);
        } catch (e) {
            err = new Error('Error decoding PythonCaller JSON: ' + e.message);
        }

        if (err) {
            this.state = EXITING;
            this.killWorker();
            this._doneCall(err);
        } else {
            this.state = READY;
            if (data.present) {
                this._doneCall(null, data.val, this.outputBoth);
            } else {
                // TODO this is not how this should be handled right?
                this._doneCall(new FunctionMissingError('Function not found in module'));
            }
        }
    }

    _handleStderrData(data) {
        this._checkState([IN_CALL, EXITING, EXITED]);
        if (this.state == IN_CALL) {
            this.outputStderr += data;
            this.outputBoth += data;
        }
    }

    _handleStdoutData(data) {
        this._checkState([IN_CALL, EXITING, EXITED]);
        if (this.state == IN_CALL) {
            this.outputStdout += data;
            this.outputBoth += data;
        }
    }

    _handleStdio3Data(data) {
        this._checkState([IN_CALL, EXITING, EXITED]);
        if (this.state == IN_CALL) {
            this.outputData += data;
            if (this.outputData.indexOf('\n') >= 0) {
                this._callIsFinished();
            }
        }
    }

    /**
     * Start the underlying worker.
     * @param {function(Error)} callback Called after the zygote becomes ready
     *                                   (i.e. worker has been started)
     *                                   or any error happens
     *
     * Notice:
     * Whenever an error happens, underlying resources will be released
     * and this ZygoteManager should no longer be used. Users need to create
     * a new ZygoteManager and restart their work.
     */
    startWorker(callback) {
        console.log("[ZygoteManager] Starting worker");
        setTimeout(() => {
            console.log("[ZygoteManager] Worker started");
            callback(null);
        }, 1000);
    }

    /**
     * Kill the underlying worker.
     * @param {function(Error)} callback Called after the zygote becomes idle
     *                                   (i.e. worker has been killed)
     *                                   or any error happens
     *
     * Notice:
     * Whenever an error happens, underlying resources will be released
     * and this ZygoteManager should no longer be used. Users need to create
     * a new ZygoteManager and restart their work.
     */
    killWorker(callback) {
        console.log("[ZygoteManager] Killing worker");
        if (![READY].includes(this.state)) {
            return new Error('invalid internal ZygoteManager state for call()');
        }
        if (!this._checkState([READY])) {
            return new Error('invalid ZygoteManager state');
        }
        this.state = EXITING;

        this.child.stdio[4].write(JSON.stringify({action: 'kill worker'}));
        this.child.stdio[4].write('\n');
        this.exitingCallBack = callback;

        setTimeout(() => {
            // TODO Maybe try to kill 3 times? And then call callback?
            this.exitingCallBack(new Error("Failed to kill worker"));
        }, 1000);
    }

    _clearTimeout() {
        clearTimeout(this.timeoutID);
        this.timeoutID = null;
    }

    _logError(msg) {
        console.error('ZygoteManager state ' + this.state + ': ' + msg);
    }

    // more private methods ...
    // most complicated part here - the state machine, etc
}

/**
 * Represents the output of a program.
 */
class Output {
    /**
     * @param {String} stdout Standard out
     * @param {String} stderr Standard error
     * @param {any} result Return value
     */
    constructor(stdout, stderr, result) {
        this.stdout = stdout;
        this.stderr = stderr;
        this.result = result;
    }

    toString() {
        return util.format(
            "{stdout: %s, stderr: %s, result: %s}",
            this.stdout, this.stderr, this.result
        );
    }
}


module.exports = ZygoteManager;
