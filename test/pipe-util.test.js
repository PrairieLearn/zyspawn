const stream = require('stream');
const { LineTransform, Port } = require('../pipe-util');
const { TimeoutError } = require('../error.js')
const { timeout }  = require('./test-util');

test("LineTransform test", async () => {
    let input = new stream.PassThrough();
    let output = input.pipe(new LineTransform());

    let results = [];
    let expected_results = ["Line 1", "Line 2", "Line 3", "Line 4", "Line 5"];
    output.on('data', (line) => { results.push(line); });
    let check = new Promise((resolve) => {
        output.on('end', () => {
            expect(results).toEqual(expected_results);
            resolve();
        });
    });

    input.write("Line 1\n"); await timeout(10);
    input.write("Line 2"); await timeout(10);
    input.write("\n"); await timeout(10);
    input.write("L"); await timeout(10);
    input.write("ine 3\n"); await timeout(10);
    input.write("Line 4\nLine 5"); await timeout(10);
    input.end(); await timeout(10);

    await check;
});

test("Port basic test", async () => {
    let echo = new stream.PassThrough();
    let port = new Port(echo, echo);
    let msg = [{}, {'foo': 'bar'}, ['A', 'B', 'C'], "hello"];
    let jobs = [];
    
    for (let i = 0; i < msg.length; i++) {
        jobs.push(new Promise((resolve) => {
            port.send(msg[i], 10, (err, response) => {
                expect(response).toEqual(msg[i]);
                resolve();
            });
        }));
    }

    await Promise.all(jobs);
});

test("Port stress test", async () => {
    let echo = new stream.PassThrough();
    let port = new Port(echo, echo);
    
    for (let i = 0; i < 10; i++) {
        let jobs = [];
        for (let i = 0; i < 1000; i++) {
            jobs.push(new Promise((resolve) => {
                var n = Math.random();
                port.send(n, 10, (err, response) => {
                    expect(response).toEqual(n);
                    resolve();
                });
            }));
        }
        await Promise.all(jobs);
    }
});

test("Port timeout test", async () => {
    let port = new Port(stream.PassThrough(), stream.PassThrough());

    await new Promise((resolve) => {
        port.send('hello', 10, (err, response) => {
            expect(err).toBeInstanceOf(TimeoutError);
            resolve();
        });
    });
});