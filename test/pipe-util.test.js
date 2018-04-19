const stream = require('stream');
const { LineTransform, Port } = require('../pipe-util');
const { timeout }  = require('./test-util');

test("LineTransform test", async () => {
    let lt = new LineTransform();

    let results = [];
    let expected_results = ["Line 1", "Line 2", "Line 3", "Line 4", "Line 5"];
    lt.on('data', (line) => { results.push(line); });
    let check = new Promise((resolve) => {
        lt.on('end', () => {
            expect(results).toEqual(expected_results);
            resolve();
        });
    });

    lt.write("Line 1\n"); await timeout(10);
    lt.write("Line 2"); await timeout(10);
    lt.write("\n"); await timeout(10);
    lt.write("L"); await timeout(10);
    lt.write("ine 3\n"); await timeout(10);
    lt.write("Line 4\nLine 5"); await timeout(10);
    lt.end(); await timeout(10);

    await check;
});

// test("JSONTransform test", async () => {

// });

// test("", async () => {

// });