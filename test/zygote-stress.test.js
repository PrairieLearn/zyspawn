const util = require('util');
const path = require('path');
const { ZygotePool } = require('../zygote-pool');
const { ZygoteInterface } = require('../zygote-pool');
const {timeout} = require('./test-util');

const options = {
    cwd: path.join(__dirname, 'python-scripts'),
    timeout: 3000,
}

var zyPool = null;

afterEach((done)=>{
    zyPool.shutdown(done);
});

const getRandomInt = function(max) {
  return Math.floor(Math.random() * Math.floor(max));
}

const roundCheck = function (zyInt, number, handleDone) {
    //console.log("Number is: " + number);
    if (number <= 0) {
        zyInt.done(handleDone);
    } else {
        switch (getRandomInt(2)) {
            case 0:
                zyInt.call("simple", "add", [1,2], options, (err, output) => {
                    expect(err).toBeNull();
                    expect(output.result).toBe(3);
                    roundCheck(zyInt, number-1, handleDone);
                });
                break;
            case 1:
                zyInt.call("simple", "add", [1,2], options, (err, output) => {
                    expect(err).toBeNull();
                    expect(output.result).toBe(3);
                    roundCheck(zyInt, number-1, handleDone);
                });
                break;
            case 2:
                zyInt.call("simple", "bad", [], options, (err, output) => {
                    expect(err).toBeNull();
                    expect(output.result).toBe(1);
                    roundCheck(zyInt, number-1, handleDone);
                });
                break;
        }

    }
};

test("Stress test", async (done) => {
    jest.setTimeout(30000);
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
            roundCheck(zyInt, 10, handleDone);
        }
    });
});
