const util = require('util');
const {ZygotePool} = require('../zygote-pool');

var zygotePool;

console.log("> Testing ZygotePool...");
initialize()
.then(wait(1500))
.then(simpleTest)
.then(wait(1500))
.then(() => {
    console.log(util.format("> Idle zygote number=%d (should be %d)",
                            zygotePool.idleZygoteNum(), 10));
    console.log("> ZygotePool test finished");
});

function initialize() {
    return new Promise((resolve) => {
        zygotePool = new ZygotePool(10);
        console.log(util.format("> Idle zygote number=%d (should be %d)",
                                zygotePool.idleZygoteNum(), 0));
        resolve();
    });
}

function simpleTest() {
    return new Promise((resolve, reject) => {
        var zygoteInterface = zygotePool.request();
        console.log(util.format("> Idle zygote number=%d (should be %d)",
                                zygotePool.idleZygoteNum(), 10));
        zygoteInterface.run("module", "function", {}, (err, result) => {
            console.log(util.format("> Idle zygote number=%d (should be %d)",
                                    zygotePool.idleZygoteNum(), 9));
            console.log("> Result: " + result);
            zygoteInterface.done();
            console.log(util.format("> Idle zygote number=%d (should be %d)",
                                    zygotePool.idleZygoteNum(), 9));
            resolve();
        });
    });
}

function wait(milliseconds) {
    return () => new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });
}
