const util = require('util')
const BlockingQueue = require('../blocking-queue');

const { timeout }  = require('./test-util');


test("simple correctness test", async () => {
    var q = new BlockingQueue();
    var record = [];

    q.put(1);
    q.put(2);

    q.get((err, n) => {
        expect(err).toBeNull();
        record.push(util.format('Got %d', n));
        setTimeout(() => {
            record.push(util.format('Put %d', n));
            q.put(n);
        }, 75);
    });

    q.get((err, n) => {
        expect(err).toBeNull();        
        record.push(util.format('Got %d', n));
        setTimeout(() => {
            record.push(util.format('Put %d', n));
            q.put(n);
        }, 50);
    });

    q.get((err, n) => {
        expect(err).toBeNull();        
        record.push(util.format('Got %d', n));
    });

    q.get((err, n) => {
        expect(err).toBeNull();        
        record.push(util.format('Got %d', n));
    });

    await timeout(100);
    var correct_record = ["Got 1", "Got 2", "Put 2", "Got 2", "Put 1", "Got 1"];    
    expect(record).toEqual(correct_record);
});


test("stress test", async () => {
    const resourceNum = 1000;
    const requestNum = 30000;

    var q = new BlockingQueue();
    var jobs = [];

    for (let i = 0; i < resourceNum; i++) {
        q.put(Math.random());
    }

    for (let i = 0; i < requestNum; i++) {
        jobs.push(new Promise((resolve) => {
            q.get((err, n) => {
                expect(err).toBeNull();                
                setTimeout(() => {
                    q.put(n);
                    resolve();
                }, Math.floor(n*100));
            });
        }));
    }

    await Promise.all(jobs);

    expect(q.size()).toBe(resourceNum);
    expect(q.waitingCount()).toBe(0);
});
