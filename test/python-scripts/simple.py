import time

def add(x, y):
    return x + y

def bad():
    return 1/0;

def timeout():
    while True:
        pass

def sleep(seconds):
    time.sleep(seconds)
    return seconds
