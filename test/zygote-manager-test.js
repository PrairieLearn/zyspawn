const ZygoteManager = require('../zygote-manager');
const hlt = require('./testutil');

var numFailed = 0;
var numSuccess = 0;
console.log("> Testing ZygoteManager...");
spawnWorkZygoteTest()
.then(spawnFailRefuseZygoteTest)
.then(spawnFailMessageTest)
.then(() => {
    console.log(hlt("> ZygoteManager test finished", "inv"));
    console.log(">  " +  hlt("Success: " + numSuccess, "green"));
    console.log("> " + hlt("Failures: " + numFailed, "red"));
});

function spawnWorkZygoteTest() {
    console.log(hlt("> Start spawnWorkZygoteTest test", "under"));
    ZygoteManager.create((err, zMan)=>{
        if (err != null) {
            console.error(hlt("Failed", "red") + " to create Zygote\n" + err);
            var resp = zMan.forceKillMyZygote();
            if (resp != null) {
                console.error(hlt("Failed", "red") + " to force kill:" + resp);
            }
            numFailed++;
        } else {
            numSuccess++;
            zMan.killMyZygote();
        }
    }, "test/zygotes/spawnWorkZygote.py");

    return new Promise((resolve) => {
        setTimeout(()=> {
            console.log("Completed");
            resolve();
        }, 5000);
    });
}

function spawnFailRefuseZygoteTest() {
    console.log(hlt("> Start spawnFailRefuseZygoteTest test", "under"));
    ZygoteManager.create((err, zMan)=>{
        if (err != null) {
            if (String(err) == "Error: Timeout creating zygote") {
              numSuccess++;
            } else {
              console.error(hlt("Failed", "red") + " to create Zygote with wrong error:\n" + err);
              numFailed++;
            }
            var resp = zMan.forceKillMyZygote();
            if (resp != null) {
                console.error(hlt("Failed", "red") + " to force kill:" + resp);
            }
        } else {
            console.error(hlt("Failed", "red") + " by successfully creating Zygote");
            numFailed++;
            zMan.killMyZygote();
        }
    }, "test/zygotes/spawnFailRefuseZygote.py");

    return new Promise((resolve) => {
        setTimeout(()=> {
            console.log("Completed");
            resolve();
        }, 5000);
    });
}

function spawnFailMessageTest() {
    console.log(hlt("> Start spawnFailMessageTest test", "under"));
    ZygoteManager.create((err, zMan)=>{
        if (err != null) {
            if (String(err) == "Error: Failed with messsage: Failed to create myself...somehow") {
              numSuccess++;
            } else {
              console.error(hlt("Failed", "red") + " to create Zygote with wrong error:\n" + err);
              numFailed++;
            }
            var resp = zMan.forceKillMyZygote();
            if (resp != null) {
                console.error(hlt("Failed", "red") + " to force kill:" + resp);
            }
        } else {
            console.error(hlt("Failed", "red") + " by successfully creating Zygote");
            numFailed++;
            zMan.killMyZygote();
        }
    }, "test/zygotes/spawnFailMessageZygote.py");

    return new Promise((resolve) => {
        setTimeout(()=> {
            console.log("Completed");
            resolve();
        }, 5000);
    });
}
