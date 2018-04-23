const util = require('util');
const { ZygotePool, ZygoteInterface } = require('../zygote-pool');

const { timeout }  = require('./test-util');

test("Create and shutdown test", async () => {
    var zygotePool;
    await new Promise((resolve) => {
        zygotePool = new ZygotePool(5, (err) => {
            expect(err).toBeFalsy();
            resolve();
        });
        expect(zygotePool.idleZygoteNum()).toBe(0);
    });

    expect(zygotePool.idleZygoteNum()).toBe(5);
    
    var zygoteInterface = zygotePool.request();

    // zygotes are lazily allocated
    expect(zygotePool.idleZygoteNum()).toBe(5);
    
    await new Promise((resolve) => {
        zygoteInterface.done((err) => {
            expect(err).toBeFalsy();
            resolve();
        });
    });

    expect(zygotePool.idleZygoteNum()).toBe(5);

    await new Promise((resolve) => {
        zygotePool.shutdown((err) => {
            expect(err).toBeFalsy();
            resolve();
        });
    });

    expect(zygotePool.isShutdown()).toBe(true);
});

test("Simple call test", async () => {
    var zygotePool = new ZygotePool(5);
    var zygoteInterface = zygotePool.request();

    zygoteInterface.call("test/python-scripts/simple", "add", [1,2],
        (err, output) => {
            expect(err).toBeFalsy();
            expect(output.result.val).toBe(3);
            zygoteInterface.done()
        }
    );

    await new Promise((resolve) => {
        zygotePool.shutdown((err) => {
            expect(err).toBeFalsy();
            resolve();
        });
    });

    expect(zygotePool.isShutdown()).toBe(true);
});


test("Call non-existing function test", async () => {
    var zygotePool = new ZygotePool(5);
    var zygoteInterface = zygotePool.request();

    zygoteInterface.call("test/python-scripts/simple", "nonexsist", null,
        (err, output) => {
            expect(err).toBeTruthy();
            zygoteInterface.done();
        }
    );

    await new Promise((resolve) => {
        zygotePool.shutdown((err) => {
            expect(err).toBeFalsy();
            resolve();
        });
    });

    expect(zygotePool.isShutdown()).toBe(true);
});

// TODO In this case, ZygoteManager.killWorker() doesn't call the callback
// test("Call non-existing file test", async () => {
//     var zygotePool = new ZygotePool(5);
//     var zygoteInterface = zygotePool.request();

//     zygoteInterface.call("nowhere", "nonesense", null, (err, output) => {
//         expect(err).toBeTruthy();
//     });

//     await new Promise((resolve) => {
//         zygoteInterface.done((err) => {
//             expect(err).toBeFalsy();
//             resolve();
//         });
//     });

//     await new Promise((resolve) => {
//         zygotePool.shutdown((err) => {
//             expect(err).toBeFalsy();
//             resolve();
//         });
//     });

//     expect(zygotePool.isShutdown()).toBe(true);
// });