const util = require('util');
const path = require('path');
const ZygoteManager = require('../zygote-manager');
const {timeout} = require('./test-util');

const options = {
    cwd: path.join(__dirname, 'python-scripts')
}

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
    }, {'zygoteFile':"test/zygotes/spawnWorkZygote.py"});
});

test("Spawn Fail Refuse Zygote Test", async (done) => {
    ZygoteManager.create((err, zMan)=>{
          zInterface = zMan;
          expect(String(err)).toBe("ZyspawnError: Timeout on: Creating Zygote");
          var resp = zInterface.forceKillMyZygote();
          zInterface = null;
          done();
    }, {'zygoteFile':"test/zygotes/spawnFailRefuseZygote.py"});
});

test("Spawn Fail Message Test", async (done) => {
    ZygoteManager.create((err, zMan)=>{
          zInterface = zMan;
          expect(String(err)).toBe("ZyspawnError: Internal error: _createdMessageHandler Failed with messsage: Failed to create myself...somehow");
          // TODO replace with non-force kill
          var resp = zInterface.forceKillMyZygote();
          zInterface = null;
          done();
    }, opts={'zygoteFile':"test/zygotes/spawnFailMessageZygote.py"});
});

test("Spawn Worker Timeout Test", async (done) => {
    ZygoteManager.create((err, zMan)=>{
          zInterface = zMan;
          expect(err).toBeNull();
          zMan.startWorker((err)=>{
              expect(String(err)).toBe("ZyspawnError: Timeout on: Creating Worker");
              var resp = zInterface.forceKillMyZygote();
              zInterface = null;
              done();
          });
          //zInterface = null;
          //done();
    }, {'zygoteFile':"test/zygotes/spawnWorkZygote.py"});

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
    }, {'zygoteFile':"test/zygotes/spawnWorkerZygote.py"});

});

test("Running Simple Method that times out", async (done) => {
    jest.setTimeout(6000);
    ZygoteManager.create((err, zMan)=>{
          zInterface = zMan;
          expect(err).toBeNull();
          zMan.startWorker((err)=>{
              expect(err).toBeNull();
              let t = 0;
              zMan.call("simple", "timeout", [], options, (err, output) => {
                  expect(String(err)).toBe('ZyspawnError: Timeout on: function \"timeout\" in file \"simple\"');
                  zMan.killWorker((err) => {
                      expect(err).toBeNull();
                      var resp = zInterface.forceKillMyZygote();
                      zInterface = null;
                      done();
                  });
              });
          });
    },{'zygoteFile':"test/zygotes/spawnRunTimeoutZygote.py"});
});

test("Zygote call on add python", async (done) => {
    jest.setTimeout(1000);
    ZygoteManager.create((err, zMan)=>{
          zInterface = zMan;
          expect(err).toBeNull();
          zMan.startWorker((err)=>{
              expect(err).toBeNull();
              zMan.call("simple", "add", [1,2], options, (err, output) => {
                  expect(err).toBeNull();
                  expect(output.result).toBe(3);
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
              zMan.call("simple", "add", [1,2], options, (err, output) => {
                  expect(err).toBeNull();
                  expect(output.result).toBe(3);
                  zMan.call("simple", "add", [-11,10], options, (err, output) => {
                      expect(err).toBeNull();
                      expect(output.result).toBe(-1);
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
              zMan.call("simple", "add", [10,2], options, (err, output) => {
                  expect(err).toBeNull();
                  expect(output.result).toBe(12);
                  zMan.call("strings", "count", ["ababab","ab"], options, (err, output) => {
                      expect(err).toBeNull();
                      expect(output.result).toBe(3);
                      zMan.call("strings", "substring", ["laughter",2,5], options, (err, output) => {
                          expect(err).toBeNull();
                          expect(output.result).toBe("ugh");
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
              zMan.call("simple", "nonexsist", [10,2], options, (err, output) => {
                  expect(String(err)).toBe("ZyspawnError: Missing function \"nonexsist\" in file \"simple\"");
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

test("Zygote call on non existing file", async (done) => {
    jest.setTimeout(10000);
    ZygoteManager.create((err, zMan)=>{
          zInterface = zMan;
          expect(err).toBeNull();
          zMan.startWorker((err, zyInt)=>{
              expect(err).toBeNull();
              zMan.call("who", "nonexsist", [10,2], options, (err, output) => {
                  expect(String(err)).toBe("ZyspawnError: Missing file who");
                  zMan.killWorker((err)=>{
                      expect(err).toBeNull();
                      zMan.killMyZygote((err)=>{
                          expect(err).toBeNull();
                          zInterface = null;
                          done();
                      });
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
              zMan.call("simple", "add", [10,2], options, (err, output) => {
                  expect(err).toBeNull();
                  expect(output.result).toBe(12);
                  zMan.killWorker((err) => {
                        expect(err).toBeNull();
                        // REUSE of zygote
                        zMan.startWorker((err)=>{
                              expect(err).toBeNull();
                              zMan.call("strings", "substring", ["laughter",2,5], options, (err, output) => {
                                  expect(err).toBeNull();
                                  expect(output.result).toBe("ugh");
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
