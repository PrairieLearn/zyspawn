const util = require('util');
const ZygoteManager = require('../zygote-manager');
const {timeout} = require('./test-util');

var zInterface = null;
var zErr = null;

afterEach(()=>{
    if (zInterface == null) {
        return;
    }
    console.error("Forcing death of zygote");
    var resp = zInterface.forceKillMyZygote();
});

test("Spawn Work Zygote Test", async (done) => {
    ZygoteManager.create((err, zMan)=>{
          zInterface = zMan;
          expect(err).toBeNull();
          zMan.killMyZygote((err)=>{
              expect(err).toBeNull();
              zInterface = null;
              done();
          });
    }, "test/zygotes/spawnWorkZygote.py");

});

test("Spawn Fail Refuse Zygote Test", async (done) => {
    ZygoteManager.create((err, zMan)=>{
          zInterface = zMan;
          expect(String(err)).toBe("Error: Timeout creating zygote");
          var resp = zInterface.forceKillMyZygote();
          zInterface = null;
          done();
    }, "test/zygotes/spawnFailRefuseZygote.py");
});

test("Spawn Fail Message Test", async (done) => {
    ZygoteManager.create((err, zMan)=>{
          zInterface = zMan;
          expect(String(err)).toBe("Error: _createdMessageHandler Failed with messsage: Failed to create myself...somehow");
          // TODO replace with non-force kill
          var resp = zInterface.forceKillMyZygote();
          zInterface = null;
          done();
    }, "test/zygotes/spawnFailMessageZygote.py");
});

test("Spawn Worker Timeout Test", async (done) => {
    ZygoteManager.create((err, zMan)=>{
          zInterface = zMan;
          expect(err).toBeNull();
          zMan.startWorker((err)=>{
              expect(String(err)).toBe("Error: Timeout starting worker");
              var resp = zInterface.forceKillMyZygote();
              zInterface = null;
              done();
          });
          //zInterface = null;
          //done();
    }, "test/zygotes/spawnWorkZygote.py");

});

test("Spawn Worker No Timeout Test", async (done) => {
    ZygoteManager.create((err, zMan)=>{
          zInterface = zMan;
          expect(err).toBeNull();
          zMan.startWorker((err)=>{
              expect(err).toBeNull();
              zMan.killWorker((err) => {
                  expect(err).toBeNull();
                  zMan.killMyZygote((err)=>{
                      expect(err).toBeNull();
                      zInterface = null;
                      done();
                  });
              });
          });
    }, "test/zygotes/spawnWorkerZygote.py");

});

test("Running Simple Method that times out", async (done) => {
    jest.setTimeout(6000);
    ZygoteManager.create((err, zMan)=>{
          zInterface = zMan;
          expect(err).toBeNull();
          zMan.startWorker((err)=>{
              expect(err).toBeNull();
              zMan.call("test.py", "summer", [1,2], (err, output) => {
                  expect(String(err)).toBe('Error: Timed out on calling: "summer" in "test.py"');
                  zMan.killWorker((err) => {
                      expect(err).toBeNull();
                      var resp = zInterface.forceKillMyZygote();
                      zInterface = null;
                      done();
                  });
              });
          });
    }, "test/zygotes/spawnRunTimeoutZygote.py");

});

test("Zygote call on add python", async (done) => {
    jest.setTimeout(1000);
    ZygoteManager.create((err, zMan)=>{
          zInterface = zMan;
          expect(err).toBeNull();
          zMan.startWorker((err)=>{
              expect(err).toBeNull();
              zMan.call("test/python-scripts/simple", "add", [1,2], (err, output) => {
                  expect(err).toBeNull();
                  expect(output.result["val"]).toBe(3);
                  zMan.killWorker((err) => {
                        expect(err).toBeNull();
                        var resp = zInterface.forceKillMyZygote();
                        zInterface = null;
                        done();
                  });
              });
          });
    });
});

test("Zygote call on python multiple methods", async (done) => {
    jest.setTimeout(10000);
    ZygoteManager.create((err, zMan)=>{
          zInterface = zMan;
          expect(err).toBeNull();
          zMan.startWorker((err)=>{
              expect(err).toBeNull();
              zMan.call("test/python-scripts/simple", "add", [1,2], (err, output) => {
                  expect(err).toBeNull();
                  expect(output.result["val"]).toBe(3);
                  zMan.call("test/python-scripts/simple", "add", [-11,10], (err, output) => {
                      expect(err).toBeNull();
                      expect(output.result["val"]).toBe(-1);
                      zMan.killWorker((err) => {
                            expect(err).toBeNull();
                            var resp = zInterface.forceKillMyZygote();
                            zInterface = null;
                            done();
                      });
                  });
              });
          });
    });
});

test("Zygote call on add python multiple files", async (done) => {
    jest.setTimeout(10000);
    ZygoteManager.create((err, zMan)=>{
          zInterface = zMan;
          expect(err).toBeNull();
          zMan.startWorker((err)=>{
              expect(err).toBeNull();
              zMan.call("test/python-scripts/simple", "add", [10,2], (err, output) => {
                  expect(err).toBeNull();
                  expect(output.result["val"]).toBe(12);
                  zMan.call("test/python-scripts/strings", "count", ["ababab","ab"], (err, output) => {
                      expect(err).toBeNull();
                      expect(output.result["val"]).toBe(3);
                      zMan.call("test/python-scripts/strings", "substring", ["laughter",2,5], (err, output) => {
                          expect(err).toBeNull();
                          expect(output.result["val"]).toBe("ugh");
                          zMan.killWorker((err) => {
                                expect(err).toBeNull();
                                var resp = zInterface.forceKillMyZygote();
                                zInterface = null;
                                done();
                          });
                      });
                  });
              });
          });
    });
});

test("Zygote call on non existing function", async (done) => {
    jest.setTimeout(10000);
    ZygoteManager.create((err, zMan)=>{
          zInterface = zMan;
          expect(err).toBeNull();
          zMan.startWorker((err)=>{
              expect(err).toBeNull();
              zMan.call("test/python-scripts/simple", "nonexsist", [10,2], (err, output) => {
                  expect(String(err)).toBe("FunctionMissingError: Function not found in module");
                  zMan.killWorker((err) => {
                        expect(err).toBeNull();
                        var resp = zInterface.forceKillMyZygote();
                        zInterface = null;
                        done();
                  });
              });
          });
    });
});

test("Zygote reuse zygote", async (done) => {
    jest.setTimeout(10000);
    ZygoteManager.create((err, zMan)=>{
          zInterface = zMan;
          expect(err).toBeNull();
          zMan.startWorker((err)=>{
              expect(err).toBeNull();
              zMan.call("test/python-scripts/simple", "add", [10,2], (err, output) => {
                  expect(err).toBeNull();
                  expect(output.result["val"]).toBe(12);
                  zMan.killWorker((err) => {
                        expect(err).toBeNull();
                        // REUSE of zygote
                        zMan.startWorker((err)=>{
                              expect(err).toBeNull();
                              zMan.call("test/python-scripts/strings", "substring", ["laughter",2,5], (err, output) => {
                                  expect(err).toBeNull();
                                  expect(output.result["val"]).toBe("ugh");
                                  zMan.killWorker((err) => {
                                        expect(err).toBeNull();
                                        var resp = zMan.killMyZygote((err)=>{
                                            expect(err).toBeNull();
                                            zInterface = null;
                                            done();
                                        });
                                  });
                              });
                        });
                  });
              });
          });
    });
});
