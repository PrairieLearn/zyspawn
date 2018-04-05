const util = require('util')
const BlockingQueue = require('../blocking-queue');


console.log("> Testing BlockingQueue...");
correctnessTest()
.then(stressTest)
.then(() => {
    console.log("> BlockingQueue test finished");
});


function correctnessTest() {
    console.log("> Start correctness test");
    var q = new BlockingQueue();

    q.put(1);
    q.put(2);

    q.get((n) => {
        console.log(util.format('Got %d', n));
        setTimeout(() => {
            console.log(util.format('Put %d', n));
            q.put(n);
        }, 1000);
    });

    q.get((n) => {
        console.log(util.format('Got %d', n));
        setTimeout(() => {
            console.log(util.format('Put %d', n));
            q.put(n);
        }, 500);
    });

    q.get((n) => {
        console.log(util.format('Got %d', n));
    });

    q.get((n) => {
        console.log(util.format('Got %d', n));
    });

    return new Promise((resolve) => {
        setTimeout(()=> {
            console.log("> Order should be Got 1, Got 2, Put 2, Got 2, Put 1, Got 1");
            console.log("> Correctness test done");            
            resolve();
        }, 2000);
    });
}


function stressTest() {
    console.log("> Start stress test");

    const resourceNum = 1000;
    const requestNum = 30000;

    var q = new BlockingQueue();
    var jobs = [];

    for (let i = 0; i < resourceNum; i++) {
        q.put(Math.random());
    }

    for (let i = 0; i < requestNum; i++) {
        jobs.push(new Promise((resolve) => {
            q.get((n) => {
                setTimeout(() => {
                    q.put(n);
                    resolve();
                }, Math.floor(n*1000));
            });
        }));
    }

    return Promise.all(jobs).then(() => {
        if (q.size() == resourceNum && q.waitingCount() == 0) {
            console.log("> Stress test done successfully");
        } else {
            console.log(util.format(
                "> Error in stress test (size=%d, waiting=%d), " +
                "expect (size=%d, waiting=%d)",
                q.size(), q.waitingCount(), resourceNum, 0
            ));
        }
    });
}
