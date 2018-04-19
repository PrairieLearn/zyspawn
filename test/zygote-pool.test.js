const util = require('util');
const { ZygotePool } = require('../zygote-pool');

const { timeout }  = require('./test-util');

// test("simple test", async () => {
//     var zygotePool = new ZygotePool(10);
//     expect(zygotePool.idleZygoteNum()).toBe(0);

//     await timeout(150);

//     var zygoteInterface = zygotePool.request();
//     expect(zygotePool.idleZygoteNum()).toBe(10);

//     await new Promise((resolve, reject) => {
//         zygoteInterface.call("module", "function1", {}, (err, result) => {
//             expect(zygotePool.idleZygoteNum()).toBe(9);
//             expect(zygotePool.idleZygoteNum()).toBe(9);
//             resolve();
//         });
//     });

//     await new Promise((resolve, reject) => {
//         zygoteInterface.call("module", "function2", {}, (err, result) => {
//             expect(zygotePool.idleZygoteNum()).toBe(9);
//             zygoteInterface.done();
//             expect(zygotePool.idleZygoteNum()).toBe(9);
//             resolve();
//         });
//     });

//     await timeout(150);
//     expect(zygotePool.idleZygoteNum()).toBe(10);    
// });
