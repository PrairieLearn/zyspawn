const ZygoteManager = require('../zygote-manager');

console.log("> Testing ZygoteManager...");
spawnWorkZygoteTest()
.then(spawnFailRefuseZygoteTest)
.then(spawnFailMessageTest)
.then(() => {
    console.log("> ZygoteManager test finished");
});

function spawnWorkZygoteTest() {
    console.log("> Start spawnWorkZygoteTest test");
    return new Promise((resolve) => {
        ZygoteManager.create((err, zMan)=>{
            if (err != null) {
                console.error("Failed to create Zygote\n" + err);
                var resp = zMan.forceKillMyZygote();
                if (resp != null) {
                    console.error("Failed to force kill:" + resp);
                }
            } else {
                console.error("Created Zygote");
                zMan.killMyZygote();
            }
        }, "test/zygotes/spawnWorkZygote.py");

        return new Promise((resolve) => {
            setTimeout(()=> {
                console.log("Done with promise");
                resolve();
            }, 3000);
        });
    });
}

function spawnFailRefuseZygoteTest() {
    console.log("> Start spawnFailRefuseZygoteTest test");
    return new Promise((resolve) => {
        ZygoteManager.create((err, zMan)=>{
            if (err != null) {
                console.error("Failed to create Zygote\n" + err);
                var resp = zMan.forceKillMyZygote();
                if (resp != null) {
                    console.error("Failed to force kill:" + resp);
                }
            } else {
                console.error("Created Zygote");
                zMan.killMyZygote();
            }
        }, "test/zygotes/spawnFailRefuseZygote.py");

        return new Promise((resolve) => {
            setTimeout(()=> {
                console.log("Done with promise");
                resolve();
            }, 3000);
        });
    });
}

function spawnFailMessageTest() {
    console.log("> Start spawnFailMessageTest test");
    return new Promise((resolve) => {
        ZygoteManager.create((err, zMan)=>{
            if (err != null) {
                console.error("Failed to create Zygote\n" + err);
                var resp = zMan.forceKillMyZygote();
                if (resp != null) {
                    console.error("Failed to force kill:" + resp);
                }
            } else {
                console.error("Created Zygote");
                zMan.killMyZygote();
            }
        }, "test/zygotes/spawnFailMessageZygote.py");

        return new Promise((resolve) => {
            setTimeout(()=> {
                console.log("Done with promise");
                resolve();
            }, 3000);
        });
    });
}
