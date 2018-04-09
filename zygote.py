#TODO
# 1. Implement The decoder
# 2. Implement the signal handler
# 3. Design and write necessary test cases.

import signal
import sys, os, json, importlib, copy, base64, io, matplotlib
matplotlib.use('PDF')

#   The actual zygote off of which process will fork of off.

#   Pipes 0-3 inclusive are set asside for the WORKER
#   0 is a pipe used as input for worker
#   1 and 2 are STDOUT and STDERR and will be captured by server and logged
#   3 is a pipe used by worker to send data back to server
#   Pipes 4-5 inclusive are set asside for the ZYGOTE
#   4 is a pipe used by Zygote to get actions from Server
#   5 is a pipe used by Zygote to respond to Server

childPid = -1
exitInfoPipe = open(6, 'w', encoding='utf-8')

#   Returns the pid of the current childPid
#   If no Child exists, returns -1
def getChildPid():
    global childPid
    return childPid

#   Stores the child's pid in the golbal variable childPid
def setChildPid(pid):
    global childPid
    childPid = pid

#   This function waits for it's child to complete it's assigned task.
#   Returns zero upon successful completion by the child
#   Returns -1 otherwise

def waitForChild(signum, frame):
    global exitInfoPipe
    pid = getChildPid()
    jsonDict = {}
    # Need to discuss need for this precation
    # if(pid == -1):
    #     jsonDict["type"] = 'no child in progress'
    #     jsonDict["code"] = 'no_child_err'
    #     jsonDict["signal"] = 'Unkown'

    pid, status = os.waitpid(pid, os.WNOHANG)

    # This indicates the successful completion of the child
    # with the natural exit with no interuptions.
    if (signum == signal.SIGCHLD):
        jsonDict["type"] = 'exit'
        jsonDict["code"] = exit_code
        jsonDict["signal"] = "SIGCHLD"

    # Message when the child is interupted!
    else:
        jsonDict["type"] = 'exit'
        jsonDict["code"] = exit_code
        jsonDict["signal"] = 'sig: ' + str(signum)
        value_place = -1
    jsonStr = json.dumps(jsonDict)
    exitInfoPipe.write(jsonStr + '\n')
    exitInfoPipe.flush()
