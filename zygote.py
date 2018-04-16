#TODO
# 1. Implement The decoder
# 2. Implement the signal handler
# 3. Design and write necessary test cases.
# 4. SIGINT Handler required


import signal
import sys, os, json, importlib, copy, base64, io, matplotlib
matplotlib.use('PDF')

#   The actual zygote off of which process will fork of off.

#   Pipes 0-3 inclusive are set asside for the WORKER
#   0 is a pipe used as input for worker
#   1 and 2 are STDOUT and STDERR and will be captured by server and logged
#   3 is a pipe used by worker to send data back to server
#   Pipes 4-5 inclusive are set asside for the ZYGOTE
#   4 is a pipe used by Zygote to get actions from zygote-manager.js
#   5 is a pipe used by Zygote to respond to zygote-manager.js

childPid = -1
exitInfoPipe = open(6, 'w', encoding='utf-8')

saved_path = copy.copy(sys.path)

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


# Function name is self explanitory
# This function is called from the parseInput function

def runWorker():
    # The output file descriptor.
    with open(3, 'w', encoding='utf-8') as outf:

        # Infinite loop
        # Wait for the input commands through pipie 0 (aka stdin)
        # Output of worker through pipe 3
        # Caller must terminate with SIGTERM

        while True:

            # Waiting for instructions
            json_inp = sys.stdin.readline().strip()
            if(json_inp is None or json_inp == ""):
                continue

            # Executing instructions after detected within pipe.

            # Unpack the input as JSON and assign variables
            inp = json.loads(json_inp)
            file = inp['file']
            fcn = inp['fcn']
            args = inp['args']
            cwd = inp['cwd']
            paths = inp['paths']


            # reset and then set up the path
            sys.path = copy.copy(saved_path)
            for path in reversed(paths):
                sys.path.insert(0, path)
            sys.path.insert(0, cwd))

            # change to the desired working directory
            os.chdir(cwd)

            # load the "file" as a module
            mod = importlib.import_module(file)

            # Check if we have the required fcn in the module
            if hasattr(mod, fcn):
                # Call the desired function in the loaded module
                method = getattr(mod, fcn)
                val = method(*args)

                if fcn == "file":
                    # 
                    if val is None:
                        val = ''
