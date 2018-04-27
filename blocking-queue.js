/**
 * @fileoverview
 * This module defines BlockingQueue (see below).
 */

/**
 * A blocking queue which pends get request utill an item becomes available.
 */
class BlockingQueue {
    constructor() {
        this._items = [];
        this._blockedJobs = [];
    }

    /**
     * Get item number.
     * @return {number} Current number of items in the queue
     */
    size() {
        return this._items.length;
    }

    /**
     * Get number of blocked jobs.
     * @return {number} Current number of items in the queue
     */
    waitingCount() {
        return this._blockedJobs.length;
    }

    /**
     * Get an item from the queue. The callback will be called when an item
     * is available.
     * @param {function(Error, any)} callback Called when item is avaible or
     *                                        clearWaiting() is called.
     */
    get(callback) {
        if (this._items.length == 0) {
            this._blockedJobs.push(callback);
        } else {
            callback(null, this._items.shift());
        }
    }

    /**
     * Put an item in the queue. If there are blocked jobs, the first of them
     * will be called.
     * @param {any} item The item to put
     */
    put(item) {
        if (this._blockedJobs.length == 0) {
            this._items.push(item);  
        } else {
            let callback = this._blockedJobs.shift();
            callback(null, item);
        }
    }

    /**
     * Raise an error on each waiting get requests.
     * @param {Error} err The error to raise
     */
    clearWaiting(err) {
        this._blockedJobs.forEach((callback) => {
            callback(err);
        });
        this._blockedJobs.length = 0;
    }
}

module.exports = BlockingQueue;
