/**
 * @fileoverview
 * This module manages a pool of python zygotes and includes API to use them.
 * 
 * Usage:
 *  const {ZygotePool} = require('zygote-pool');
 * 
 *  var zygotePool = new ZygotePool(10, (err) => { throw err; });
 * 
 *  var zygoteInterface = zygotePool.request();
 * 
 *  zygoteInterface.run(
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
const BlockingQueue = require('./blocking-queue');
const ZygoteManager = require('./zygote-manager');

/**
 * Manages a pool of zygotes. Users create and use zygotes through this class.
 */
class ZygotePool {
    /**
     * Create a zygote pool.
     * @param {number} zygoteNum The number of zygotes to use
     * @param {function(Error)} callback Callback called after initialization
     */
    constructor(zygoteNum, callback) {
        this._zygoteManagerList = []; // TODO health check?
        this._idleZygoteManagerQueue = new BlockingQueue();

        for (let i = 0; i < zygoteNum; i++) {
            ZygoteManager.create((err, zygoteManager) => {
                if (err) {
                    // TODO
                } else {
                    this._zygoteManagerList.push(zygoteManager);
                    this._idleZygoteManagerQueue.put(zygoteManager);
                }
            });
        }
    }

    /**
     * Get number of idle zygotes.
     * @return {number} Number of idle zygotes
     */
    idleZygoteNum() {
        return this._idleZygoteManagerQueue.size();
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
     * @param {function(Error, ZygoteManager)} callback The callback called after
     *      a ZygoteManager is ready to work
     */
    _allocateZygoteManager(zygoteInterface, callback) {
        this._idleZygoteManagerQueue.get((zygoteManager) => {
            zygoteManager.startWorker((err) => {
                if (err) {
                    // TODO create a new Zygote?
                    callback(err); // do we need to pass the error outside
                } else {
                    zygoteInterface.zygoteManager = zygoteManager;
                    zygoteInterface._done = () => {
                        // TODO check if the zygote is still healthy
                        zygoteManager.killWorker((err) => {
                            if (err) {
                                // TODO log the error (and create a new Zygote?)
                            } else {
                                this._idleZygoteManagerQueue.put(zygoteManager);
                            }
                        });
                    }
                    callback(null);
                }
            });
        });
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
        this._done = () => {};
    }

    /**
     * Run a function in a python script (See ZygoteManager.run()).
     * @param {String} fileName The file where the function resides
     * @param {String} functionName The function to run
     * @param {object} arg JSON object as arguments for the function
     * @param {function(Error, Output)} callback Called when the result is computed
     *      or any error happens. Output contains tree fields: stdout(String),
     *      stderr(String), result(object)
     */
    run(fileName, functionName, arg, callback) {
        if (this._zygoteManager == null) {
            this._zygotePool._allocateZygoteManager(this, (err) => {
                if (err) {
                    // TODO Do we really need to pass this error outside?
                } else {
                    this.zygoteManager.run(fileName, functionName, arg, callback);
                }
            });
        } else {
            this.zygoteManager.run(fileName, functionName, arg, callback);
        }
    }

    /**
     * Call the registered done function. Must be called after finishing using
     * this zygote, except that any error happens in use.
     */
    done() {
        this._done();
    }
}

module.exports.ZygotePool = ZygotePool
