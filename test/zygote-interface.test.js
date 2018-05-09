const util = require('util');
const path = require('path');
const { ZygotePool } = require('../zygote-pool');
const { ZygoteInterface } = require('../zygote-pool');
const {timeout} = require('./test-util');

const options = {
    cwd: path.join(__dirname, 'python-scripts')
}

var zyPool = null;

afterEach((done)=>{
    zyPool.shutdown(done);
});

test("Simple test for ZyInterface", async (done)=>{
    zyPool = new ZygotePool(1, (err)=>{
        var zyInt = zyPool.request();
        zyInt.call("simple", "add", [1,2], options, (err, output) => {
            expect(err).toBeNull();
            expect(output.result["val"]).toBe(3);
            zyInt.done(done);
        });
    });
});

test("Unknown method test for ZyInterface", async (done)=>{
    zyPool = new ZygotePool(1, (err)=>{
        var zyInt = zyPool.request();
        zyInt.call("simple", "unkown", [1,2], options, (err, output) => {
            expect(String(err)).toBe("ZyspawnError: Missing function \"unkown\" in file \"simple\"");
            zyInt.done(done);
        });
    });
});

test("2 Calls test for ZyInterface", async (done)=>{
    zyPool = new ZygotePool(1, (err)=>{
        var zyInt = zyPool.request();
        zyInt.call("simple", "add", [1,2], options, (err, output) => {
            expect(err).toBeNull();
            expect(output.result["val"]).toBe(3);
            zyInt.call("simple", "add", [-5,9], options, (err, output) => {
                expect(err).toBeNull();
                expect(output.result["val"]).toBe(4);
                zyInt.done(done);
            });
        });
    });
});

test("Multiple test for single ZyInterface", async (done)=>{
    var tracker = 0;
    zyPool = new ZygotePool(1, (err)=>{
        var zyInt = zyPool.request();
        zyInt.call("simple", "add", [1,2], options, (err, output) => {
            expect(err).toBeNull();
            expect(output.result["val"]).toBe(3);
            zyInt.call("simple", "add", [-5,9], options, (err, output) => {
                expect(err).toBeNull();
                expect(output.result["val"]).toBe(4);
                tracker++;
                zyInt.done();
            });
        });

        var zyInt2 = zyPool.request();
        zyInt.call("simple", "add", [1,2], options, (err, output) => {
            expect(err).toBeNull();
            expect(output.result["val"]).toBe(3);
            zyInt.call("simple", "add", [-5,9], options, (err, output) => {
                expect(err).toBeNull();
                expect(output.result["val"]).toBe(4);
                tracker++;
                expect(tracker).toBe(2);
                zyInt.done(done);
            });
        });
    });
});

test("Multiple test for 2 ZyInterfaces", async (done)=>{
    var tracker = 0;
    zyPool = new ZygotePool(2, (err)=>{
        var zyInt = zyPool.request();
        zyInt.call("simple", "add", [1,2], options, (err, output) => {
            expect(err).toBeNull();
            expect(output.result["val"]).toBe(3);
            zyInt.call("simple", "add", [-5,9], options, (err, output) => {
                expect(err).toBeNull();
                expect(output.result["val"]).toBe(4);
                tracker++;
                if (tracker == 2) {
                  zyInt.done(done);
                } else {
                  zyInt.done();
                }
            });
        });

        var zyInt2 = zyPool.request();
        zyInt2.call("simple", "add", [1,2], options, (err, output) => {
            expect(err).toBeNull();
            expect(output.result["val"]).toBe(3);
            zyInt2.call("simple", "add", [-5,9], options, (err, output) => {
                expect(err).toBeNull();
                expect(output.result["val"]).toBe(4);
                tracker++;
                if (tracker == 2) {
                  zyInt2.done(done);
                } else {
                  zyInt2.done();
                }
            });
        });
    });
});
