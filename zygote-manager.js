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
const path = require('path');
const child_process = require('child_process');
const {LineTransform,Port} = require('./pipe-util');
const {ZyspawnError, InternalZyspawnError, FileMissingError, FunctionMissingError, InvalidOperationError, TimeoutError} = require('./error');

/*CREATING, INIT, PREPPING, READY, IN_CALL, EXITING, EXITED, DEPARTING, DEPARTED, ERROR*/
// States for creating zygote
const CREATING = Symbol('CREATING');
const INIT = Symbol('INIT');
// States for creating worker
const PREPPING = Symbol('PREPPING');
const READY  = Symbol('READY');
// States for when a call is in progress
const IN_CALL = Symbol('IN_CALL');
// States for when worker is exiting
const EXITING = Symbol('EXITING');
const EXITED  = Symbol('EXITED');
// States for when zygote is exiting
const DEPARTING = Symbol('DEPARTING');
const DEPARTED = Symbol('DEPARTED'); // The zygote has died
const ERROR  = Symbol('ERROR');

class BadStateError extends InternalZyspawnError {
    constructor(validStates, state) {
        const allowedStatesList = '[' + _.map(validStates, String).join(',') + ']';
        super("Expected state(s): " + String(allowedStatesList) + " actually in: " + String(state));
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
    static create(callback, zygote = 'zygote.py', debugMode = false) {
        // TODO label create function as createPython

        // Options for constructor
        const cmd = 'python3';
        // TODO python-caller-trampoline is an awful name, rename it to zygote.py
        const pythonTrampoline = path.join(__dirname, zygote);
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

        var manager = new ZygoteManager(cmd, args, options, debugMode, callback);
        return manager;
    }

    constructor(command, args, options, debugMode, callback) {
        // setup pipes:
        //  STDIN(worker), STDOUT(worker), STDERR(worker), data(worker),
        //  command(zygote), message(zygote), status(exit/error worker)
        this.debugMode = debugMode;
        options = options || {};
        options['stdio'] = ['pipe', 'pipe', 'pipe', 'pipe', 'pipe', 'pipe', 'pipe'];
        this.messageBuffer = "";
        this.child = child_process.spawn(command, args, options);

        this.stdin = this.child.stdin;
        this.stdout = this.child.stdout;
        this.stderr = this.child.stderr;
        this.stdio3 = this.child.stdio[3];
        // receive messages from Zygote
        this.child.stdio[5].setEncoding('utf8');
        this.child.stdio[6].setEncoding('utf8');
        // Add exit listener for child
        this.child.on('exit', this._zygoteExitListener.bind(this));


        this.child.stdio[6].on('data', (data)=>{/*console.log(data);*/});

        this.state = CREATING;
        // Call back functions used by Manager for when transition to next node is done
        /*
        this.createCallBack = callback;
        this.prepCallBack = null;
        this.incallCallBack = null;
        this.exitingCallBack = null;
        this.departingCallback = null;
        // tracks whether or not zygote.py has been spawned
        this.zygoteSpawned = false;
        // tracks whehter or not zygote.py has spawned worker
        this.workerSpawned = false;

        // Add listeners to each of the pipes
        this.stdio3.on('data', this._handleStdio3Data.bind(this));
        this.child.stdio[5].on('data', this._zygoteMessageHandler.bind(this));
        */
        this.child.stderr.on('data', this._handleStderrData.bind(this));
        this.child.stdout.on('data', this._handleStdoutData.bind(this));
        // Add Remove listeners
        this.child.stderr.on('close', ()=>{
            this.child.stderr.removeAllListeners();
        });
        this.child.stdout.on('close', ()=>{
            this.child.stdout.removeAllListeners();
        });
        this.stdio3.on('close', ()=>{
            this.stdio3.removeAllListeners();
        });
        this.child.stdio[5].on('close', ()=>{
            this.child.stdio[5].removeAllListeners();
        });

        this.controlPort = new Port(this.child.stdio[4], this.child.stdio[5]);
        this.callPort = new Port(this.child.stdin, this.child.stdio[3]);

        this.controlPort.send({action: 'status'}, 3000, (err, message) => {
            if (err != null) {
                this.state = ERROR;

                callback(new TimeoutError("Creating Zygote"), this);
            } else {
                if (message['success']) {
                  this.state = INIT;
                  this.zygoteSpawned = true;
                  callback(null, this);
                } else {
                  this.state = ERROR;
                  this.zygoteSpawned = false;
                  callback(new InternalZyspawnError('_createdMessageHandler Failed with messsage: ' + message['message']), this);
                  this._logError('_createdMessageHandler Failed with messsage "' + message['message'] + '"');
                }
            }
        });
        /*
        // Call status on zygote.py inorder to determine if it is alive
        this.child.stdio[4].write(JSON.stringify({action: 'status'}) + "\n");
        // After 3 seconds, assume creating zygote failed
        this.timeoutID = setTimeout(() => {
            this.state = ERROR;
            this.timeoutID = null;
            this.createCallBack(new Error("Timeout creating zygote"), this);
            this.createCallBack = null;
        }, 3000);*/
    }

    /**
     * Call a function in a python script.
     * @param {String} fileName The file where the function resides
     * @param {String} functionName The function to run
     * @param {Array} arg Arguments for the function as an array
     * @param {Object} options Include optional cwd (as absolute path), paths and timeout.
     * @param {function(Error, Output)} callback Called when the result is computed
     *                                           or any error happens
     *
     * Notice:
     * Whenever an error happens, underlying resources will be released
     * and this ZygoteManager should no longer be used. Users need to create
     * a new ZygoteManager and restart their work.
     */
    call(fileName, functionName, args, options, callback) {
        if (this.debugMode) {
          console.log(util.format("[ZygoteManager] Running %s:%s", fileName, functionName));
        }

        if (![READY].includes(this.state)) {
            callback(new BadStateError([READY], this.state));
            return;
        }

        if (!this._checkState([READY], 'run')) {
            callback(new Error('Invalid ZygoteManager state for call()'));
            return;
        }

        _.defaults(options, {
            cwd: __dirname,
            paths: [],
            timeout: 3000,
        });

        const callData = {
            file: fileName,
            fcn: functionName,
            args: args,
            cwd: options.cwd,
            paths: options.paths,
        };
        const callDataString = JSON.stringify(callData);

        if (this.debugMode) {
            console.log("Calling function: " + callDataString + " with timeout: " + options.timeout);
        }

        this.outputStdout = '';
        this.outputStderr = '';
        this.outputBoth = '';

        this.lastCallData = callData;
        this.state = IN_CALL;
        this.callPort.send(callData, options.timeout, (err, message) => {
            if (err != null) {
                this.state = ERROR;
                var output = new Output(
                    this.outputStdout, this.outputStderr,
                    this.outputBoth, null
                );
                callback(new TimeoutError("function \"" + functionName + "\" in file \"" + fileName + "\""), output);
            } else {
                if (message['present']) {
                  var output = new Output(
                      this.outputStdout, this.outputStderr,
                      this.outputBoth, message.val
                  );
                  this.state = READY;
                  callback(null, output);
                } else {
                  // TODO we can read from the message to see internal state/specificly what went wrong
                  this.state = READY;
                  if (message['error'] == "Function not present") {
                      callback(new FunctionMissingError(functionName, fileName)); // TODO implement stderr and stdout
                  } else if (message['error'] == "File not present in the current directory") {
                      callback(new FileMissingError(fileName));
                  } else {
                      callback(new InternalZyspawnError(message['message'] + " " + message['error']));
                  }
                  this._logError('_createdMessageHandler Failed with messsage "' + message['message'] + '"');
                }
            }
        });
    }

    /**
     * Shutdown the zygote.
     * @param {function(Error)} callback Called after shutdown.
     */
    shutdown(callback) {
        this.killMyZygote((err)=>{
            if (err) {
                this.forceKillMyZygote(callback);
            } else {
                callback(null);
            }
        });
    }

    /*
     * Kill Zygote with request over pipe
     */
    killMyZygote(callback) {
        if (this.debugMode) {
            console.log("[ZygoteManager] killing my zygote");
        }
        // TODO add check for state=departed
        // TODO remove state exited from the check here
        if (![INIT, EXITED, ERROR].includes(this.state)) {
          callback(new Error('Cannot kill zygote until worker is killed: ' + String(this.state)));
        }
        if (!this._checkState([INIT, EXITED, ERROR],'killMyZygote')) {
          callback(new Error('invalid ZygoteManager state for killMyZygote'));
        }
        this.state = DEPARTING;
        if (callback) {
            this.departingCallback = callback;
        } else {
            this.departingCallback = (err)=>{
                console.log("TODO: REMOVE ME");
            };
        }
        // TODO this cannot work with the pipe system, it needs to be updated to allow this to be replaced
        this.departingCallback = callback;
        this.timeoutID = setTimeout(() => {
            if (this.debugMode) {
              console.log("[ZygoteManager] timeout while trying to kill zygote");
            }
            this.timeoutID = null;
            // TODO listen for child dieing event instead
            //this.departingCallback(new Error("timeout while trying to kill zygote"), new Output("<stdout>", "<stderr>", "<result>"));
            this.departingCallback(new Error("timeout while trying to kill zygote"));
            this.departingCallback = null;
            this.state = DEPARTED;
        }, 3000);

      this.child.stdio[4].write(JSON.stringify({action: 'kill self'})+'\n');
    }

    /*
     * Kill Zygote with SIGINT
     */
    forceKillMyZygote(callback) {
        /*
        if (![CREATING, INIT, ERROR].includes(this.state)) {
          return new Error('Cannot force kill zygote until worker is killed: ' + String(this.state));
        }
        if (!this._checkState([CREATING, INIT, ERROR])) {
          return new Error('invalid ZygoteManager for forceKillMyZygote');
        }
        */
        if (this.debugMode) {
            console.log("[ZygoteManager] Forcing death of zygote");
        }

        this.state = DEPARTING;
        if (callback) {
            this.departingCallback = callback;
        } else {
            this.departingCallback = ()=>{};
        }

        this.timeoutID = setTimeout(() => {
            if (this.debugMode) {
                console.log("[ZygoteManager] timeout while trying to force kill zygote");
            }

            this.state = DEPARTED;
            this.timeoutID = null;
            if (this.departingCallback != null) {
                this.departingCallback(new Error("[ZygoteManager] timeout while trying to force kill zygote"));
            }
            this.departingCallback = null;
        }, 3000);
        this.child.kill('SIGKILL');
    }

    _checkState(allowedStates, from=null) {
        if (allowedStates && !allowedStates.includes(this.state)) {
            const allowedStatesList = '[' + _.map(allowedStates, String).join(',') + ']';
            return this._logError('Expected PythonCaller states ' + allowedStatesList + ' but actually have state ' + String(this.state));
        }

        /*CREATING, INIT, PREPPING, READY, IN_CALL, EXITING, EXITED, DEPARTING, DEPARTED, ERROR*/
        let hasZygoteSpawned, hasWorkerSpawned, hasTimeout;
        switch (this.state) {
          case CREATING:
            hasZygoteSpawned = false;
            hasWorkerSpawned = false;
            break;
          case INIT:
            hasZygoteSpawned = true;
            hasWorkerSpawned = false;
            break;
          case PREPPING:
            hasZygoteSpawned = true;
            hasWorkerSpawned = false;
            break;
          case READY:
            hasZygoteSpawned = true;
            hasWorkerSpawned = true;
            break;
          case IN_CALL:
            hasZygoteSpawned = true;
            hasWorkerSpawned = true;
            break;
          case EXITING:
            hasZygoteSpawned = true;
            hasWorkerSpawned = true;
            break;
          case EXITED:
            hasZygoteSpawned = true;
            hasWorkerSpawned = false;
            break;
          case DEPARTING:
            hasTimeout = true;
            break;
          case DEPARTED:
            hasTimeout = true;
            break;
          case ERROR:
            break;
          default:
            return this._logError('Invalid state');
        }

        if (hasZygoteSpawned != null) {
            if (hasZygoteSpawned && !this.zygoteSpawned) return this._logError('zygoteSpawned should be true from ' + from);
            if (!hasZygoteSpawned && this.zygoteSpawned) return this._logError('zygoteSpawned should be false from ' + from);
        }
        if (hasWorkerSpawned != null) {
            if (hasWorkerSpawned && !this.workerSpawned) return this._logError('workerSpawned should be true from ' + from);
            if (!hasWorkerSpawned && this.workerSpawned) return this._logError('workerSpawned should be false from ' + from);
        }
        if (hasTimeout != null) {
            if (hasTimeout && this.timeoutID == null) return this._logError('timeoutID should not be null from ' + from);
            if (!hasTimeout && this.timeoutID != null) return this._logError('timeoutID should be null from ' + from);
        }

        return true;
    }



    _zygoteExitListener(code) {
        // TODO add check for state=departed
        var err = null;
        if (![DEPARTING].includes(this.state)) {
          err = new Error('invalid state for _zygoteExitListener:' + String(this.state));
        }
        else if (!this._checkState([DEPARTING],'_zygoteExitListener')) {
          err = new Error('invalid ZygoteManager state for _zygoteExitListener');
        }
        else if (code != 0) {
          err = new Error('Bad return code for _zygoteExitListener: ' + code);
        }
        this._clearTimeout();
        // TODO clear current port's timeout??
        // TODO Add check for other states for sperious deaths
        this.state = DEPARTED;
        this.departingCallback(err);
        if (this.debugMode) {
            console.log("Zygote Exited with code: " + String(code));
        }
        /*
        if (this.departingCallback != null) {
            this.departingCallback(err);
        }*/
        this.departingCallback = null;
    }

    _handleStderrData(data) {
        if (this.debugMode) {
          console.log("ZygoteManager: Stderr: " + data);
        }
        // CREATING, INIT and Prepping Are added for zygote
        this._checkState([CREATING, INIT, PREPPING, IN_CALL, EXITING, EXITED, ERROR, DEPARTING], '_handleStderrData');
        if (this.state == IN_CALL) {
            this.outputStderr += data;
            this.outputBoth += data;
        }
    }

    _handleStdoutData(data) {
        if (this.debugMode) {
          console.log("ZygoteManager: Stdout: " + data);
        }
        this._checkState([IN_CALL, EXITING, EXITED], '_handleStdoutData');
        if (this.state == IN_CALL) {
            this.outputStdout += data;
            this.outputBoth += data;
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
        // TODO Add create worker code
        if (this.debugMode) {
            console.log("[ZygoteManager] creating worker");
        }
        if (![INIT, EXITED].includes(this.state)) {
            callback(new BadStateError([INIT, EXITED], this.state));
            return;
        }
        if (!this._checkState([INIT, EXITED], 'startWorker')) {
            callback(new Error('invalid ZygoteManager state for startWorker()'));
            return;
        }
        this.state = PREPPING;
        this.controlPort.send({action: 'create worker'}, 4000, (err, message) => {
            if (err != null) {
                this.state = ERROR;
                callback(new TimeoutError("Creating Worker"));
            } else {
                if (message['success']) {
                  this.state = READY;
                  this.workerSpawned = true;
                  callback(null);
                } else {
                  // TODO we can read from the message to see internal state/specificly what went wrong
                  this.state = INIT;
                  this.workerSpawned = false;
                  callback(new InternalZyspawnError("Failed to spawn worker"));
                  this._logError('startWorker Failed with messsage "' + message['message'] + '"');
                }
            }
        });
        /*
        this.prepCallBack = callback;
        this.child.stdio[4].write(JSON.stringify({action: 'create worker'})+'\n');

        this.timeoutID = setTimeout(() => {
            this.state = INIT;
            this.timeoutID = null;
            this.prepCallBack(new Error("Timeout starting worker"));
            this.prepCallBack = null;
        }, 4000);
        */

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
        if (![READY, ERROR].includes(this.state)) {
            callback(new BadStateError([READY], this.state), null);
            return;
        }
        if (!this._checkState([READY, ERROR], 'killWorker')) {
            callback(new Error('invalid ZygoteManager state for killWorker()'), null);
            return;
        }

        this.state = EXITING;

        this.controlPort.send({action: 'kill worker'}, 1000, (err, message) => {
            if (err != null) {
                this.state = ERROR;
                this.workerSpawned = false;
                callback(new TimeoutError("Killing Worker"));
            } else {
                if (message['success']) {
                  this.state = EXITED;
                  this.workerSpawned = false;
                  callback(null);
                } else {
                  // TODO we can read from the message to see internal state/specificly what went wrong
                  this.state = ERROR;
                  this.workerSpawned = false;
                  callback(new InternalZyspawnError("Failed to kill worker due to: " + message['message']));
                  this._logError('killWorker Failed with messsage "' + message['message'] + '"');
                }
            }
        });
        /*
        this.exitingCallBack = callback;

        this.timeoutID = setTimeout(() => {
            console.log("Timeout Error");
            // TODO Maybe try to kill 3 times? And then call callback?
            this.timeoutID = null;
            this.exitingCallBack(new Error("Failed to kill worker"));
            this.exitingCallBack = null;
        }, 1000);
        this.child.stdio[4].write(JSON.stringify({action: 'kill worker'})+'\n');
        */
    }

    _clearTimeout() {
        if (this.timeoutID == null) {
            this._logError("cannot clear timeout with no active timeout");
        }
        clearTimeout(this.timeoutID);
        this.timeoutID = null;
    }

    _logError(msg) {
        if (this.debugMode) {
            console.error('[ZygoteManager error] in state (' + String(this.state) + ') error: ' + msg);
        }
    }
}

/**
 * Represents the output of a program.
 */
class Output {
    /**
     * @param {String} stdout Standard out
     * @param {String} stderr Standard error
     * @param {String} consoleLog Combined standard out and standard error
     * @param {any} result Return value
     */
    constructor(stdout, stderr, consoleLog, result) {
        this.stdout = stdout;
        this.stderr = stderr;
        this.consoleLog = consoleLog;
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
