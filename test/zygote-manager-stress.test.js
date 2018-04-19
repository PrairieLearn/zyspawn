const util = require('util');
const ZygoteManager = require('../zygote-manager');
const {hlt} = require('./testutil');
const {timeout} = require('./testutil');
//const  math = require('math');

var zInterface = null;
var zErr = null;

afterEach(()=>{
    if (zInterface == null) {
        return;
    }
    console.error("Forcing death of zygote");
    var resp = zInterface.forceKillMyZygote();
});

const getRandomInt = function(max) {
  return Math.floor(Math.random() * Math.floor(max));
}

const roundCheck = function(zMan, done, rounds) {
    if (rounds <= 0) {
        zMan.killWorker((err) => {
              expect(err).toBeNull();
              var resp = zInterface.forceKillMyZygote();
              zInterface = null;
              if (done != null) {
                  done();
              }
        });
    } else {
      var method = getRandomInt(3);
      switch(method) {
          case 0:
            var a = getRandomInt(100);
            var b = getRandomInt(100);
            zMan.call("test/python-scripts/simple", "add", [a,b], (err, output) => {
                expect(err).toBeNull();
                expect(output.result["val"]).toBe(a+b);
                roundCheck(zMan, done, rounds-1);
            });
            break;
          case 1:
            zMan.call("test/python-scripts/strings", "count", ["abababab","ab"], (err, output) => {
                expect(err).toBeNull();
                expect(output.result["val"]).toBe(4);
                roundCheck(zMan, done, rounds-1);
            });
            break;
          case 2:
            var a = getRandomInt(2);
            var b = getRandomInt(3)+3;
            zMan.call("test/python-scripts/strings", "substring", ["abababab", a, b], (err, output) => {
                expect(err).toBeNull();
                expect(output.result["val"]).toBe("abababab".substring(a,b));
                roundCheck(zMan, done, rounds-1);
            });
            break;
      }
    }
};
test("Stress test 1 round", async (done) => {
    ZygoteManager.create((err, zMan)=>{
          zInterface = zMan;
          expect(err).toBeNull();
          zMan.startWorker((err, zyInt)=>{
              expect(err).toBeNull();
              roundCheck(zMan, done, 1);
          });
    });
});

test("Stress test 100 round", async (done) => {
    ZygoteManager.create((err, zMan)=>{
          zInterface = zMan;
          expect(err).toBeNull();
          zMan.startWorker((err, zyInt)=>{
              expect(err).toBeNull();
              roundCheck(zMan, done, 100);
          });
    });
});

test("Stress test 1000 rounds", async (done) => {
    ZygoteManager.create((err, zMan)=>{
          zInterface = zMan;
          expect(err).toBeNull();
          zMan.startWorker((err, zyInt)=>{
              expect(err).toBeNull();
              roundCheck(zMan, done, 1000);
          });
    });
});

test("Stress test over 9999 rounds", async (done) => {
    ZygoteManager.create((err, zMan)=>{
          zInterface = zMan;
          expect(err).toBeNull();
          zMan.startWorker((err, zyInt)=>{
              expect(err).toBeNull();
              roundCheck(zMan, done, 9999);
          });
    });
});

const createRoundCheck = function(done, rounds) {
    if (rounds <= 0) {
        done();
        return;
    }
    ZygoteManager.create((err, zMan)=>{
          zInterface = zMan;
          expect(err).toBeNull();
          zMan.startWorker((err, zyInt)=>{
              expect(err).toBeNull();
              roundCheck(zMan, ()=>{createRoundCheck(done, rounds-1)}, 1);
          });
    });
};

test("Stress test no reuse of zygote for 10 rounds", async (done) => {
    jest.setTimeout(10000);
    createRoundCheck(done, 10);
});
