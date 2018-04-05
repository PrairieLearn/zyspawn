/**
 * @fileoverview
 * This module defines BlockingQueue (see below).
 */

/**
 * A blocking queue which pends get request utill an item becomes available.
 */
class BlockingQueue {
    constructor() {
        this.items = [];
        this.blockedJobs = [];
    }

    /**
     * Get item number.
     * @return {number} Current number of items in the queue
     */
    size() {
        return this.items.length;
    }

    /**
     * Get number of blocked jobs.
     * @return {number} Current number of items in the queue
     */
    waitingCount() {
        return this.blockedJobs.length;
    }

    /**
     * Get an item from the queue. The callback will be called when an item
     * is available.
     * @param {function(any)} callback Callback function of form callback(item)
     */
    get(callback) {
        if (this.items.length == 0) {
            this.blockedJobs.push(callback);
        } else {
            callback(this.items.shift());
        }
    }

    /**
     * Put an item in the queue. If there are blocked jobs, the first of them
     * will be called.
     * @param {any} item
     */
    put(item) {
        if (this.blockedJobs.length == 0) {
            this.items.push(item);  
        } else {
            let callback = this.blockedJobs.shift();
            callback(item);
        }
    }
}

module.exports = BlockingQueue;
