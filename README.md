# Zyspawn project for PrairieLearn

The purpose of this library is to accelerate script execution for question generation
in [PrairieLearn](https://github.com/PrairieLearn/PrairieLearn).

## Example Use
Python Script
```python3
# simple.py
def add(a, b):
    return a + b
```
Javascript
```javascript
var zyPool = new ZygotePool(5, (err)=>{
    var zyInt = zyPool.request();
    zyInt.call("simple", "add", [1,2], {}, (err, output) => {
          // output.result == 3
          zyInt.done();
    });
});
```

## Unit Tests
```bash
npm test
```
> Note: If you find that lots of tests are failing to run, it may be usefull  
> to run tests in band mode. i.e:  
``` bash
npm test -- --runInBand
```
