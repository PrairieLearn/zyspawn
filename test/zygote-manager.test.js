const util = require('util');
const ZygoteManager = require('../zygote-manager');
const {hlt} = require('./testutil');
const {timeout} = require('./testutil');

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
    await ZygoteManager.create((err, zMan)=>{
          zInterface = zMan;
          expect(err).toBeNull();
          zMan.killMyZygote(()=>{
              zInterface = null;
              done();
          });
    }, "test/zygotes/spawnWorkZygote.py");

    await timeout(150);
});

test("Spawn Fail Refuse Zygote Test", async (done) => {
    await ZygoteManager.create((err, zMan)=>{
          zInterface = zMan;
          expect(String(err)).toBe("Error: Timeout creating zygote");
          var resp = zInterface.forceKillMyZygote();
          zInterface = null;
          done();
    }, "test/zygotes/spawnFailRefuseZygote.py");
    await timeout(300);
});

test("Spawn Fail Message Test", async (done) => {
    await ZygoteManager.create((err, zMan)=>{
          zInterface = zMan;
          expect(String(err)).toBe("Error: _createdMessageHandler Failed with messsage: Failed to create myself...somehow");
          // TODO replace with non-force kill
          var resp = zInterface.forceKillMyZygote();
          zInterface = null;
          done();
    }, "test/zygotes/spawnFailMessageZygote.py");
    await timeout(150);
});

test("Spawn Worker Timeout Test", async (done) => {
    await ZygoteManager.create((err, zMan)=>{
          zInterface = zMan;
          expect(err).toBeNull();
          zMan.startWorker((err, zyInt)=>{
              expect(String(err)).toBe("Error: Timeout starting worker");
              var resp = zInterface.forceKillMyZygote();
              zInterface = null;
              done();
          });
          //zInterface = null;
          //done();
    }, "test/zygotes/spawnWorkZygote.py");
    await timeout(150);
});

test("Spawn Worker No Timeout Test", async (done) => {
    await ZygoteManager.create((err, zMan)=>{
          zInterface = zMan;
          expect(err).toBeNull();
          zMan.startWorker((err, zyInt)=>{
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
    await timeout(150);
});
