const ZygoteManager = require('../zygote-manager');

console.log("> Testing ZygoteManager...");
simpleTest()
.then(() => {
    console.log("> ZygoteManager test finished");
});

function simpleTest() {
    return new Promise((resolve) => {
        ZygoteManager.create((err, zMan)=>{
            if (err != null) {
                console.error("Failed to create Zygote\n" + err);
                zMan.forceKillMyZygote();
            } else {
                console.error("Created Zygote");
                zMan.killMyZygote();
            }
        }, "failZygote.py");

        return new Promise((resolve) => {
            setTimeout(()=> {
                console.log("Done with promise");
                resolve();
            }, 3000);
        });
    });
}
