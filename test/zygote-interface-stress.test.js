const util = require('util');
const path = require('path');
const { ZygotePool } = require('../zygote-pool');
const { ZygoteInterface } = require('../zygote-pool');
const {timeout} = require('./test-util');

const options = {
    cwd: path.join(__dirname, 'python-scripts')
}

var zyPool = null;

const getRandomInt = function(max) {
  return Math.floor(Math.random() * Math.floor(max));
}

afterEach((done)=>{
    zyPool.shutdown(done);
});

const roundCheck = function (zyInt, number, handleDone) {
    //console.log("Number is: " + number);
    if (number <= 0) {
        zyInt.done(handleDone);
    } else {
        zyInt.call("simple", "add", [1,2], options, (err, output) => {
            expect(err).toBeNull();
            expect(output.result).toBe(3);
            roundCheck(zyInt, number-1, handleDone);
        });
    }
};

test("Stress test for 10 ZyInterface with 1 zygote", async (done) => {
    const maxZy = 10;
    var zyLeft = maxZy-1; // Must have -1
    const handleDone = ()=>{
        if (zyLeft <= 0) {
            done();
        } else {
            zyLeft--;
        }
    };
    zyPool = new ZygotePool(1, (err)=>{
        for (var i = 0; i < maxZy; i++) {
            var zyInt = zyPool.request();
            roundCheck(zyInt, 100, handleDone);
        }
    });
});

test("Stress test for 10 ZyInterface with 5 zygotes", async (done) => {
    const maxZy = 10;
    var zyLeft = maxZy-1; // Must have -1
    const handleDone = ()=>{
        if (zyLeft <= 0) {
            done();
        } else {
            zyLeft--;
        }
    };
    zyPool = new ZygotePool(5, (err)=>{
        for (var i = 0; i < maxZy; i++) {
            var zyInt = zyPool.request();
            roundCheck(zyInt, 100, handleDone);
        }
    });
});

test("Stress test for 100 ZyInterface with 1 zygotes", async (done) => {
    jest.setTimeout(10000);
    const maxZy = 100;
    var zyLeft = maxZy-1; // Must have -1
    const handleDone = ()=>{
        if (zyLeft <= 0) {
            done();
        } else {
            zyLeft--;
        }
    };
    zyPool = new ZygotePool(1, (err)=>{
        for (var i = 0; i < maxZy; i++) {
            var zyInt = zyPool.request();
            roundCheck(zyInt, 100, handleDone);
        }
    });
});

test("Stress test for 100 ZyInterface with 5 zygotes", async (done) => {
    const maxZy = 100;
    var zyLeft = maxZy-1; // Must have -1
    const handleDone = ()=>{
        if (zyLeft <= 0) {
            done();
        } else {
            zyLeft--;
        }
    };
    zyPool = new ZygotePool(5, (err)=>{
        for (var i = 0; i < maxZy; i++) {
            var zyInt = zyPool.request();
            roundCheck(zyInt, 100, handleDone);
        }
    });
});

test("Stress test random", async (done) => {
    const maxZy = 500;
    var zyLeft = maxZy-1; // Must have -1
    const handleDone = ()=>{
        if (zyLeft <= 0) {
            done();
        } else {
            zyLeft--;
        }
    };
    zyPool = new ZygotePool(5, (err)=>{
        for (var i = 0; i < maxZy; i++) {
            var zyInt = zyPool.request();
            var numTimes = getRandomInt(10) + 10;
            roundCheck(zyInt, numTimes, handleDone);
        }
    });
});
