const ZygoteManager = require('../zygote-manager');

console.log("> Testing ZygoteManager...");
simpleTest()
.then(() => {
    console.log("> ZygoteManager test finished");
});

function simpleTest() {
    return new Promise((resolve) => {
        resolve();
    });
}

