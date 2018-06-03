import time

def sort_selection(y):
    x = y[:]
    for i in range(len(x)):
        minimum = x[i]
        index = i
        for j in range(i, len(x)):
            if(x[j] < minimum):
                minimum = x[j]
                index = j
        x[index] = x[i]
        x[i] = minimum
    return x

def merge_sort(x):
    length = len(x)
    mid = length // 2
    # print(mid)
    if(mid == 0):
        return x

    output = x[:]

    lower = merge_sort(x[0:mid])
    high = merge_sort(x[mid: ])

    l = 0
    h = 0
    for i in range(length):
        if(l >= len(lower)):
            output[i] = high[h]
            h += 1
        elif (h >= len(high)):
            output[i] = lower[l]
            l += 1
        elif (lower[l] < high[h]):
            output[i] = lower[l]
            l += 1
        else:
            output[i] = high[h]
            h +=1

    return output

def fib(x):
    if(x <= 2):
        return 1

    return fib(x - 1) + fib(x - 2)

def nonesense(x):
    if(x < 1):
        return
    time.sleep(x)
    nonesense(x - 1)

def why():
    return why()

# def main():
#     x = [7,2,8,1,6,3]
#     print(sort_selection(x))
#     x = [7,2,8,8,6,3,1, 19, 2, 86, 5, 10000, 15, 85, 17]
#     print(merge_sort(x))
#
#     print(fib(10))
#     nonesense(10)
#
# if __name__ == '__main__':
#     main()
