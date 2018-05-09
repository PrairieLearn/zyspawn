/**
 * @fileoverview
 * This module manages a pool of python zygotes and includes API to use them.
 *
 * Usage: // TODO need to be updated
 *  const {ZygotePool} = require('zygote-pool');
 *
 *  var zygotePool = new ZygotePool(10);
 *
 *  var zygoteInterface = zygotePool.request();
 *
 *  zygoteInterface.call(
 *      "file-name",
 *      "function-name",
 *      {"argument1": "value1", "argument2": "value2", "and": "more"},
 *      (err, output)=> {
 *          if (err) {
 *              // failed, need to request another zygote and restart work
 *              // no need to call zygoteInterface.done()
 *              // actually calling it will not make any effect
 *          } else {
 *              use(output.stdout, output.stderr, output.result);
 *              // call zygoteInterface.run() again if needed
 *              // after finishing using zygoteInterface
 *              zygoteInterface.done();
 *              // otherwise this zygote would not be reused
 *          }
 *      }
 *  );
 *
 * Design:
 *  TODO
 *
 * Error handling:
 *  TODO
 *
 * Dependencies:
 *  ./blocking-queue.js
 *  ./zygote-manager.js
 *  ./zygote.py
 *
 */
const _ = require('lodash');
const assert = require('assert');
const BlockingQueue = require('./blocking-queue');
const ZygoteManager = require('./zygote-manager');
const { ZyspawnError, InternalZyspawnError } = require('./error');

const DEFAULT_CALLBACK = (err) => { if(err) throw err; };

/**
 * Manages a pool of zygotes. Users create and use zygotes through this class.
 */
class ZygotePool {
    /**
     * Create a zygote pool.
     * @param {number} zygoteNum The number of zygotes to use
     * @param {function(Error)} callback Called after initialization,
     *      if not specified, errors will be throwed.
     */
    constructor(zygoteNum, callback = DEFAULT_CALLBACK, debugMode = false) {
        this._isShutdown = false;
        this._totalZygoteNum = 0;
        this._zygoteManagerList = []; // TODO health check?
        this._idleZygoteManagerQueue = new BlockingQueue();
        this.addZygote(zygoteNum, callback, debugMode);
    }

    /**
     * Add zygotes to the pool.
     * @param {number} num Number of zygotes to add
     * @param {function(Error)} callback Called after zygotes are created,
     *                                   or error happens
     */
    addZygote(num, callback = DEFAULT_CALLBACK, debugMode = false) {
        this._totalZygoteNum += num;

        var jobs = [];
        for (let i = 0; i < num; i++) {
            jobs.push(new Promise((resolve) => {
                ZygoteManager.create((err, zygoteManager) => {
                    if (!err) {
                        this._zygoteManagerList.push(zygoteManager);
                        this._idleZygoteManagerQueue.put(zygoteManager);
                        // TODO need to consider the case of shutdown before
                        // before creating finished
                    }
                    resolve(err);
                }, "zygote.py", debugMode);
            }));
        }

        Promise.all(jobs).then((errs) => {
            _.pull(errs, null);
            callback(errs.length == 0 ? null : errs);
            // TODO
            // need to define error object
            // kill live zygotes when error happens?
        });
    }

    /**
     * Remove zygotes from the pool.
     * @param {number} num Number of zygotes to remove
     * @param {function(Error)} callback Called after zygotes are removed,
     *                                   or error happens
     */
    removeZygote(num, callback = DEFAULT_CALLBACK) {
        if (num < this._totalZygoteNum) {
            callback(new Error()); // TODO
        }

        this._totalZygoteNum -= num;

        var jobs = [];
        for (let i = 0; i < num; i++) {
            jobs.push(new Promise((resolve) => {
                this._idleZygoteManagerQueue.get((err, zygoteManager) => {
                    assert(!err); // BlockingQueue.clearWaiting() is never called
                    zygoteManager.shutdown((err) => { resolve(err); });
                });
            }));
        }

        Promise.all(jobs).then((errs) => {
            _.pull(errs, null);
            callback(errs.length == 0 ? null : errs);
            // TODO
            // need to define error object
            // kill live zygotes when error happens?
        });
    }

    /**
     * Shutdown ZygotePool. Stop allocating idle zygotes but working zygotes
     * won't be interrupted. All zygotes will be shutdown after they finish
     * their work.
     * @param {function(Error)} callback Called after all zygotes are shutdown.
     */
    shutdown(callback = DEFAULT_CALLBACK) {
        this._isShutdown = true;
        this.removeZygote(this._totalZygoteNum, callback);
    }

    /**
     * Check if this ZygotePool has been shutdown
     * @return {boolean} True if the ZygotePool has been shutdown
     */
    isShutdown() {
        return this._isShutdown;
    }

    /**
     * Get total number of zygotes.
     * @return {number} Total number of zygotes
     */
    totalZygoteNum() {
        return this._totalZygoteNum;
    }

    /**
     * Get number of idle zygotes.
     * @return {number} Number of idle zygotes
     */
    idleZygoteNum() {
        return this._idleZygoteManagerQueue.size();
    }

    /**
     * Get number of busy zygotes.
     * @return {number} Number of busy zygotes
     */
    busyZygoteNum() {
        return this.totalZygoteNum() - this.idleZygoteNum();
    }

    /**
     * Request a ZygoteIterface to use (but Zygote will not be allocated until
     * the first time of calling ZygoteIterface.run()). See implementation of
     * ZygoteInterface and allocateZygoteManager() below.
     * @return {ZygoteInterface} An interface to use the zygote.
     */
    request() {
        return new ZygoteInterface(this);
    }

    /**
     * Allocate a ZygoteManager for a ZygoteInterface.
     * @param {ZygoteInterface} zygoteInterface Where to allocate the ZygoteManager
     * @param {function(Error)} callback Called after a ZygoteManager is allocated
     *                                   or error happens
     */
    _allocateZygoteManager(zygoteInterface, callback) {
        if (this._isShutdown) {
            callback(new Error()); // TODO error type
            return;
        }

        this._idleZygoteManagerQueue.get((err, zygoteManager) => {
            assert(!err); // BlockingQueue.clearWaiting() is never called
            zygoteManager.startWorker((err) => {
                if (err) {
                    // TODO create a new Zygote?
                    callback(err); // do we need to pass the error outside
                } else {
                    zygoteInterface._initialize(zygoteManager, (callback) => {
                        this._reclaimZygoteManager(zygoteInterface, callback);
                    });
                    callback(null);
                }
            });
        });
    }

    /**
     * Reclaim the ZygoteManager from a ZygoteInterface.
     * @param {ZygoteInterface} zygoteInterface
     * @param {function(Error)} callback Called after the ZygoteManager is reclaimed
     *                                   or error happens
     */
    _reclaimZygoteManager(zygoteInterface, callback) {
        // TODO check if the zygote is still healthy
        var zygoteManager = zygoteInterface._zygoteManager;
        // console.log("Cleaning up! Start killing worker...");
        zygoteManager.killWorker((err) => {
            // console.log("Worker is killed!");
            if (err) {
                // TODO create a new Zygote?
                callback(err);
            } else {
                this._idleZygoteManagerQueue.put(zygoteManager);
                callback(null);
            }
        });
        zygoteInterface._finalize();
    }
}


/**
 * A handle object representing a working zygote and hiding implementation
 * details. It wraps a ZygoteManager internally and is registered with a
 * done() function which releases the resource.
 *
 * Notice:
 * Users must call done() method to release resources after finishing
 * their work.
 */
class ZygoteInterface {
    constructor(zygotePool) {
        this._zygotePool = zygotePool;
        this._zygoteManager = null;
        this._done = (callback) => { callback(null); };
        this._state = ZygoteInterface.UNINITIALIZED;
    }

    /**
     * Initialize with a ready ZygoteManager and done function
     * @param {ZygoteManager} zygoteManager A ready ZygoteManager
     * @param {function(function(Error))} done The function to release resource
     *      of which the callback will be called after resource is released or
     *      error happens.
     */
    _initialize(zygoteManager, done) {
        this._zygoteManager = zygoteManager;
        this._done = done;
        this._state = ZygoteInterface.INITIALIZED;
    }

    /**
     * Finalize such that this ZygoteInterface is no longer usable.
     */
    _finalize() {
        this._zygoteManager = null;
        this._done = (callback) => { callback(null); };
        this._state = ZygoteInterface.FINALIZED;
    }

    /**
     * Get the state of ZygoteInterface
     * @return {Number} One of the following:
     *      ZygoteInterface.UNINITIALIZED (0)
     *      ZygoteInterface.INITIALIZED (1)
     *      ZygoteInterface.FINALIZED (2);
     */
    state() {
        return this._state;
    }

    /**
     * Run a function in a python script (See ZygoteManager.run()).
     * @param {String} moduleName The module where the function resides
     * @param {String} functionName The function to run
     * @param {Array} arg Arguments for the function as an array
     * @param {Object} options Include optional cwd (as absolute path), paths and timeout.
     * @param {function(Error, Output)} callback Called when the result is computed
     *      or any error happens. Output contains tree fields: stdout(String),
     *      stderr(String), result(object)
     */
    call(moduleName, functionName, arg, options, callback) {
        switch (this.state()) {
        case ZygoteInterface.UNINITIALIZED:
            this._zygotePool._allocateZygoteManager(this, (err) => {
                if (err) { // Failure in ZygoteManager.startWorker()
                    callback(err);
                } else {
                    this._zygoteManager.call(moduleName, functionName, arg, options, callback);
                }
            });
            break;
        case ZygoteInterface.INITIALIZED:
            this._zygoteManager.call(moduleName, functionName, arg, options, callback);
            break;
        case ZygoteInterface.FINALIZED:
            callback(new Error()); // TODO Error type
            break;
        default:
            assert(false, "Bad state of ZygoteInterface: " + this.state());
        }
    }

    /**
     * Call the registered done function. Must be called after finishing using
     * this zygote, except that any error happens in use.
     * @param {function(Error)} callback Called after the zygote is released
     *      or error happens. If not specified, errors will be throwed.
     */
    done(callback = DEFAULT_CALLBACK) {
        this._done(callback);
    }
}
ZygoteInterface.UNINITIALIZED = 0;
ZygoteInterface.INITIALIZED = 1;
ZygoteInterface.FINALIZED = 2;


module.exports.ZygotePool = ZygotePool;
module.exports.ZygoteInterface = ZygoteInterface;

module.exports.ZyspawnError = ZyspawnError;
module.exports.InternalZyspawnError = InternalZyspawnError;
