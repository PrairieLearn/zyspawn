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
 * Error object used for when in bad state
 */
class BadStateError extends Error {
  /**
   * @param {JSON} message the message correlated with the missing function
   */
  constructor(expected, actual) {
    const allowedStatesList = '[' + _.map(expected, String).join(',') + ']';
    super("expected state(s):" + allowedStatesList + " but was in:" + String(actual));
    this.name = 'BadStateError';
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

        this.state = CREATING;
        // Call back functions used by Manager for when transition to next node is done
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
        this.child.stderr.on('data', this._handleStderrData.bind(this));
        this.child.stdout.on('data', this._handleStdoutData.bind(this));
        this.stdio3.on('data', this._handleStdio3Data.bind(this));
        this.child.stdio[5].on('data', this._zygoteMessageHandler.bind(this));
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

        // Call status on zygote.py inorder to determine if it is alive
        this.child.stdio[4].write(JSON.stringify({action: 'status'}) + "\n");
        // After 3 seconds, assume creating zygote failed
        this.timeoutID = setTimeout(() => {
            this.state = ERROR;
            this.timeoutID = null;
            this.createCallBack(new Error("Timeout creating zygote"), this);
            this.createCallBack = null;
        }, 3000);
    }

    /**
     * Call a function in a python script.
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
    call(fileName, functionName, args, callback) {
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
        // TODO add a check for relative vs absolute file paths
        // for relative paths
        var filepath = path.join(__dirname, fileName);
        /*
        // TODO allow user to specify there own options
        const localOptions = _.defaults(null, {
            cwd: __dirname,
            paths: paths,
            timeout: 20000, // FIXME: this number (equivalent to 20 seconds) should not have to be this high
        });
        */
        const callData = {
            file: path.basename(filepath),
            fcn: functionName,
            args: args,
            cwd: path.dirname(filepath),
            paths: [],
        };
        const callDataString = JSON.stringify(callData);
        this.incallCallBack = callback;

        this.outputStdout = '';
        this.outputStderr = '';
        this.outputBoth = '';
        this.outputData = '';

        this.lastCallData = callData;
        this.state = IN_CALL;
        this.timeoutID = setTimeout(() => {
            if (this.debugMode) {
              console.log(util.format("[ZygoteManager] Timeout on %s.%s", fileName, functionName));
            }
            this.state = ERROR; // TODO Make this better. I can see this causing issues
            this.timeoutID = null;
            this.incallCallBack(new Error('Timed out on calling: "' + functionName + '" in "' + fileName + '"'));
            this.incallCallBack = null;
        }, 3000);

        const err = this.stdinWrite(callDataString + '\n');
        /*
        if (err != null) {
            this.incallCallBack(err, null);
            this._clearTimeout();
            this.incallCallBack = null;
        }*/
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

    _createdMessageHandler(message) {
        if (message['success']) {
          this._clearTimeout();
          this.state = INIT;
          this.zygoteSpawned = true;
          this.createCallBack(null, this);
          this.createCallBack = null;
        } else {
          this._clearTimeout();
          this.state = ERROR;
          this.createCallBack(new Error('_createdMessageHandler Failed with messsage: ' + message['message']), this);
          this.createCallBack = null;
          this._logError('_createdMessageHandler Failed with messsage "' + message['message'] + '"');
        }
    }

    _initMessageHandler(message) {
        if (message['success']) {
          // TODO Add handler here
          logger.info('Cannot handle message ' + message['message'] + ' while in state INIT');
        } else {
          // TODO Add Handler here
          this._logError('_initMessageHandler Failed with messsage "' + message['message'] + '"');
        }
    }

    _prepMessageHandler(message) {
        if (message['success']) {
          this._clearTimeout();
          this.state = READY;
          this.workerSpawned = true;
          this.prepCallBack(null);
          this.prepCallBack = null;
        } else {
          this._clearTimeout();
          this.state = INIT;
          this.workerSpawned = false;
          this.prepCallBack(new Error(message['message']));
          this.prepCallBack = null;
          this._logError('_prepMessageHandler Failed with messsage"' + message['message'] + '"');
        }
    }

    _readyMessageHandler(message) {
        if (message['success']) {
          // TODO Add handler here
          logger.info('Cannot handle message ' + message['message'] + ' while in state READY');
        } else {
          // TODO Add Handler here
          this._logError('_readyMessageHandler Failed with messsage "' + message['message'] + '"');
        }
    }

    _incallMessageHandler(message) {
        if (message['success']) {
            //this._clearTimeout();
            // TODO add some handler here?
        } else {
            this.incallCallBack(new Error(message['message']), null);
            this._logError('_incallMessageHandler Failed with messsage"' + message['message'] + '"');
            // TODO Error handle better
        }
    }

    _exitingMessageHandler(message) {
        if (message['success']) {
            this._clearTimeout();
            this.state = EXITED;
            // TODO Return to pool
            this.workerSpawned = false;
            this.exitingCallBack(null);
            this.exitingCallBack = null;
        } else {
            this.state = ERROR;
            this._clearTimeout();
            this._logError('_exitingMessageHandler Failed with messsage"' + message['message'] + '"');
            if (message['message'] == 'no current worker') {
                this.workerSpawned = false;
                this.state = EXITED;
            }
            this.exitingCallBack(new Error(message['message']));
            this.exitingCallBack = null;
        }
    }

    _zygoteMessageHandler(data) {
        this.messageBuffer += data;
        if (this.messageBuffer.indexOf('\n') >= 0) {
            var arr = this.messageBuffer.split('\n', 1);
            if (arr[1] == null) {
                arr[1] = ""
            }
            this.messageBuffer = arr[1];
            const message = JSON.parse(arr[0]);
            //logger.info('ZygoteManager: handling message: ' + message['success']);
            if (this.debugMode) {
                console.log("Message Recieved: " + arr[0]);
            }
            /*CREATING, INIT, PREPPING, READY, IN_CALL, EXITING, EXITED, DEPARTING, DEPARTED, ERROR*/
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
                this._logError('Unsure of how to handle message "' + message['message']);
                // In an invalid state
            }
            //this.messageBuffer = '';
        }
    }

    /*
     * Kill Zygote with request over pipe
     */
    killMyZygote(callback) {
        if (this.debugMode) {
            console.log("[ZygoteManager] killing my zygote");
        }
        // TODO add check for state=departed
        if (![INIT, EXITED].includes(this.state)) {
          callback(new Error('Cannot kill zygote until worker is killed: ' + String(this.state)));
        }
        if (!this._checkState([INIT, EXITED],'killMyZygote')) {
          callback(new Error('invalid ZygoteManager state for killMyZygote'));
        }
        this.state = DEPARTING;

        // TODO add callback
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
        this.departingCallback = callback;
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

        this.child.kill('SIGINT');
    }

    _checkState(allowedStates, from=null) {
        if (allowedStates && !allowedStates.includes(this.state)) {
            const allowedStatesList = '[' + _.map(allowedStates, String).join(',') + ']';
            return this._logError('Expected PythonCaller states ' + allowedStatesList + ' but actually have state ' + String(this.state));
        }

        /*CREATING, INIT, PREPPING, READY, IN_CALL, EXITING, EXITED, DEPARTING, DEPARTED, ERROR*/
        let hasZygoteSpawned, hasWorkerSpawned, hasTimeout;
        let hasInCallBack;
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
            hasInCallBack = true;
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
          case DEPARTING:
            hasTimeout = true;
            break;
          case DEPARTED:
            hasTimeout = false;
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
        if (hasInCallBack != null) {
            if (hasInCallBack && this.incallCallBack == null) return this._logError('incallCallBack should not be null from ' + from);
            if (!hasInCallBack && this.incallCallBack != null) return this._logError('incallCallBack should be null from ' + from);
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

        if (this.departingCallback != null) {
            this.departingCallback(err);
        }
        this.departingCallback = null;
    }

    _callIsFinished() {
        if (!this._checkState([IN_CALL],'_callIsFinished')) {
            // TODO callback function
            return;
        }

        this._clearTimeout();
        let data, err = null;
        try {
            data = JSON.parse(this.outputData);
            this.outputData = '';
        } catch (e) {
            err = new Error('Error decoding PythonCaller JSON: ' + e.message);
        }

        if (err) {
            console.log("!!!!!!!!!!!: _callIsFinished is trying to kill worker");
            this.state = EXITING;
            this._logError(String(err));
            this.killWorker();
            this.incallCallBack(err, new Output(null, null, data));
            this.incallCallBack = null;
        } else {
            this.state = READY;
            if (data.present) {
                const c = this.incallCallBack;
                this.incallCallBack = null;
                // WHY DO I NEED TO DO THIS???
                c(null, new Output(null, null, data));
            } else {
                this.state = READY;
                // TODO this is not how this should be handled right?
                this.incallCallBack(
                  new FunctionMissingError('Function not found in module')
                , null);
                this.incallCallBack = null;
            }
        }
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

    _handleStdio3Data(data) {
        if (this.debugMode) {
          console.log("ZygoteManager: Stdio3: " + data);
        }
        this._checkState([IN_CALL, EXITING, EXITED], '_handleStdio3Data');
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
        this.prepCallBack = callback;
        this.child.stdio[4].write(JSON.stringify({action: 'create worker'})+'\n');

        this.timeoutID = setTimeout(() => {
            this.state = INIT;
            this.timeoutID = null;
            this.prepCallBack(new Error("Timeout starting worker"));
            this.prepCallBack = null;
        }, 4000);

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
        if (![READY].includes(this.state)) {
            callback(new BadStateError([READY], this.state), null);
            return;
        }
        if (!this._checkState([READY, ERROR], 'killWorker')) {
            callback(new Error('invalid ZygoteManager state for killWorker()'), null);
            return;
        }

        this.state = EXITING;
        this.exitingCallBack = callback;

        this.timeoutID = setTimeout(() => {
            console.log("Timeout Error");
            // TODO Maybe try to kill 3 times? And then call callback?
            this.timeoutID = null;
            this.exitingCallBack(new Error("Failed to kill worker"));
            this.exitingCallBack = null;
        }, 1000);
        this.child.stdio[4].write(JSON.stringify({action: 'kill worker'})+'\n');
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

    stdinWrite(obj) {
        if (![IN_CALL].includes(this.state)) {
            return new BadStateError([IN_CALL], this.state);
        }
        if (!this._checkState([IN_CALL], 'stdinWrite')) {
            return new Error('invalid ZygoteManager state for stdinWrite');
        }
        this.child.stdin.write(obj);
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
