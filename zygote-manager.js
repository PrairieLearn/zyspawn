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
const util = require('util');


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
        setTimeout(() => {
            console.log("[ZygoteManager] Zygote created");
            callback(null, new ZygoteManager());
        }, 100);
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
        }, 100);
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
        setTimeout(() => {
            console.log("[ZygoteManager] Worker killed");
            callback(null);
        }, 100);
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
        setTimeout(() => {
            console.log(util.format("[ZygoteManager] Finish %s.%s", fileName, functionName));
            callback(null, new Output("<stdout>", "<stderr>", "<result>"));
        }, 100);
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
