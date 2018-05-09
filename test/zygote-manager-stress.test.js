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

const getRandomInt = function(max) {
  return Math.floor(Math.random() * Math.floor(max));
}

const roundCheck = function(zMan, done, rounds) {
    if (rounds <= 0) {
        zMan.killWorker((err) => {
              expect(err).toBeNull();
              zInterface.forceKillMyZygote();
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
            zMan.call("simple", "add", [a,b], options, (err, output) => {
                expect(err).toBeNull();
                expect(output.result).toBe(a+b);
                roundCheck(zMan, done, rounds-1);
            });
            break;
          case 1:
            zMan.call("strings", "count", ["abababab","ab"], options, (err, output) => {
                expect(err).toBeNull();
                expect(output.result).toBe(4);
                roundCheck(zMan, done, rounds-1);
            });
            break;
          case 2:
            var a = getRandomInt(2);
            var b = getRandomInt(3)+3;
            zMan.call("strings", "substring", ["abababab", a, b], options, (err, output) => {
                expect(err).toBeNull();
                expect(output.result).toBe("abababab".substring(a,b));
                roundCheck(zMan, done, rounds-1);
            });
            break;
      }
    }
};
test("Stress test 1 round", async (done) => {
    jest.setTimeout(1000);
    ZygoteManager.create((err, zMan)=>{
          zInterface = zMan;
          expect(err).toBeNull();
          zMan.startWorker((err)=>{
              expect(err).toBeNull();
              roundCheck(zMan, done, 1);
          });
    });
});

test("Stress test 100 round", async (done) => {
    jest.setTimeout(9000);
    ZygoteManager.create((err, zMan)=>{
          zInterface = zMan;
          expect(err).toBeNull();
          zMan.startWorker((err)=>{
              expect(err).toBeNull();
              roundCheck(zMan, done, 100);
          });
    });
});

test("Stress test 1000 rounds", async (done) => {
    jest.setTimeout(10000);
    ZygoteManager.create((err, zMan)=>{
          zInterface = zMan;
          expect(err).toBeNull();
          zMan.startWorker((err)=>{
              expect(err).toBeNull();
              roundCheck(zMan, done, 1000);
          });
    });
});

test("Stress test over 9000 rounds", async (done) => {
    jest.setTimeout(6000);
    ZygoteManager.create((err, zMan)=>{
          zInterface = zMan;
          expect(err).toBeNull();
          zMan.startWorker((err)=>{
              expect(err).toBeNull();
              roundCheck(zMan, done, 9999);
          });
    });
});
/*
test("Stress test 1,000,000 rounds", async (done) => {
    jest.setTimeout(1000000);
    ZygoteManager.create((err, zMan)=>{
          zInterface = zMan;
          expect(err).toBeNull();
          zMan.startWorker((err)=>{
              expect(err).toBeNull();
              roundCheck(zMan, done, 1000000);
          });
    });
});
*/
const createRoundCheck = function(done, rounds) {
    if (rounds <= 0) {
        done();
        return;
    }
    ZygoteManager.create((err, zMan)=>{
          zInterface = zMan;
          expect(err).toBeNull();
          zMan.startWorker((err)=>{
              expect(err).toBeNull();
              roundCheck(zMan, ()=>{createRoundCheck(done, rounds-1)}, 1);
          });
    });
};
/*
test("Stress test no reuse of zygote for 10 rounds", async (done) => {
    jest.setTimeout(10000);
    createRoundCheck(done, 10);
});
*/
