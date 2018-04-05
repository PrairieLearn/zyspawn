/**
 * @fileoverview
 * This module manages a pool of python zygotes and includes API to use them.
 * 
 * Usage:
 *  const zygotePool = require('zygote-pool');
 * 
 *  zygotePool.init(10);
 * 
 *  var zygoteInterface = zygotePool.request();
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

// const logger = require('./logger');
const BlockingQueue = require('./blocking-queue');
const ZygoteManager = require('./zygote-manager');


const zygoteManagerList = []; // TODO health check?
const idleZygoteManagerQueue = new BlockingQueue();


/**
 * Initialize the zygote pool.
 * @param {number} zygoteNum The number of zygotes to use
 */
function init(zygoteNum) {
    for (let i = 0; i < zygoteNum; i++) {
        ZygoteManager.create((err, zygoteManager) => {
            if (err) {
                // TODO
            } else {
                zygoteManagerList.push(zygoteManager);
                idleZygoteManagerQueue.put(zygoteManager);
            }
        });
    }
}


/**
 * Get number of idle zygotes.
 * @return {number} Number of idle zygotes
 */
function idleZygoteNum() {
    return idleZygoteManagerQueue.size();
}


/**
 * Request a ZygoteIterface to use (but Zygote will not be allocated until
 * the first time of calling ZygoteIterface.run()). See implementation of
 * ZygoteInterface and allocateZygoteManager() below.
 * @return {ZygoteInterface} An interface to use the zygote.
 */
function request() {
    return new ZygoteInterface();
}


/**
 * A handle object representing a working zygote and hiding implementation
 * details. Internally it wraps a ZygoteManager and is registered with a
 * done() function which releases the resource.
 * 
 * Notice:
 * Users must call done() method to release resources after finishing
 * their work.
 */
class ZygoteInterface {
    constructor() {
        this.zygoteManager = null;
        this.done = () => {};
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
        if (this.zygoteManager == null) {
            allocateZygoteManager(this, (err) => {
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
        this.done();
    }
}


/**
 * Allocate a ZygoteManager for a ZygoteInterface.
 * @param {ZygoteInterface} zygoteInterface Where to allocate the ZygoteManager
 * @param {function(Error, ZygoteManager)} callback The callback called after
 *      a ZygoteManager is ready to work
 */
function allocateZygoteManager(zygoteInterface, callback) {
    idleZygoteManagerQueue.get((zygoteManager) => {
        zygoteManager.startWorker((err) => {
            if (err) {
                // TODO create a new Zygote?
                callback(err); // do we need to pass the error outside
            } else {
                zygoteInterface.zygoteManager = zygoteManager;
                zygoteInterface.done = () => {
                    // TODO check if the zygote is still healthy
                    zygoteManager.killWorker((err) => {
                        if (err) {
                            // TODO log the error (and create a new Zygote?)
                        } else {
                            idleZygoteManagerQueue.put(zygoteManager);
                        }
                    });
                }
                callback(null);
            }
        });
    });
}


module.exports.init = init;
module.exports.request = request;
module.exports.idleZygoteNum = idleZygoteNum;
