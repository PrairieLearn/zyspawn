#TODO
# 1. Design and write necessary test cases.
# 2. SIGINT Handler required


import signal
import sys, traceback, os, json, importlib, copy, base64, io, matplotlib
matplotlib.use('PDF')

#   The actual zygote off of which process will fork of off.

#   Pipes 0-3 inclusive are set asside for the WORKER
#   0 is a pipe used as input for worker
#   1 and 2 are STDOUT and STDERR and will be captured by server and logged
#   3 is a pipe used by worker to send data back to server
#   Pipes 4-5 inclusive are set asside for the ZYGOTE
#   4 is a pipe used by Zygote to get actions from zygote-manager.js
#   5 is a pipe used by Zygote to respond to zygote-manager.js
#   6 is a pipe used by Zygote to send exit info about the worker to zygote-manager.js

childPid = -1
exitInfoPipe = open(6, 'w', encoding='utf-8')
isWorker = False
shouldKillWorker = False
#   Returns the pid of the current childPid
#   If no Child exists, returns -1
def getChildPid():
    global childPid
    return childPid

#   Stores the child's pid in the golbal variable childPid
def setChildPid(pid):
    global childPid
    childPid = pid

#   Returns if this is a worker
def getIsWorker():
    global isWorker
    return isWorker

#   Sets that this is a worker
def setIsWorker():
    global isWorker # Once your a worker, you can never go back
    isWorker = True

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


    # This indicates the successful completion of the child
    # with the natural exit with no interuptions.
    if (signum == signal.SIGCHLD):
        jsonDict["type"] = 'exit'
        jsonDict["code"] = signum
        jsonDict["signal"] = "SIGCHLD"
        if getChildPid() != -1:
            setChildPid(-1)

    # Message when the child is interupted!
    else:
        jsonDict["type"] = 'exit'
        jsonDict["code"] = signum
        jsonDict["signal"] = 'sig: ' + str(signum)
        value_place = -1
    jsonStr = json.dumps(jsonDict)
    if not shouldKillWorker:
        sys.stderr.write("My worker has died unexpectenly")
    #exitInfoPipe.write(jsonStr + '\n')
    exitInfoPipe.flush()
    # sys.stderr.write("[Zygote] child died")


# Function name is self explanitory
# This function is called from the parseInput function

def int_handler(signum, frame):
    if(getIsWorker()):
        sys.stderr.write("Worker is calling int_handler")
        sys.stderr.flush()
        sys.exit(0)
    else:
        pid = getChildPid()
        setChildPid(-1)
        os.kill(pid, signal.SIGKILL)
        sys.exit(0)

def runWorker():
    # The output file descriptor.
    setIsWorker()
    with open(3, 'w', encoding='utf-8') as outf:

        # Infinite loop
        # Wait for the input commands through pipie 0 (aka stdin)
        # Output of worker through pipe 3
        # Caller must terminate with SIGTERM

        while True:

            exitInfoPipe.write('ZY: FLAG0\n')
            # Waiting for instructions
            json_inp = sys.stdin.readline().strip()
            if(json_inp is None or json_inp == ""):
                continue
            # sys.stderr.write("::" + json_inp + "::\n")

            # Executing instructions after detected within pipe.

            # Unpack the input as JSON and assign variables
            inp = json.loads(json_inp)
            file = inp['file']
            fcn = inp['fcn']
            args = inp['args']
            cwd = inp['cwd']
            paths = inp['paths']

            exitInfoPipe.write('ZY: FLAG1\n')
            # If no args are given, make the argument list empty
            if args is None:
                args = []

            # reset and then set up the path
            sys.path = copy.copy(saved_path)
            for path in reversed(paths):
                sys.path.insert(0, path)
            sys.path.insert(0, cwd)
            #sys.path.insert(0, '/PrairieLearn/elements/')

            # change to the desired working directory
            exitInfoPipe.write('ZY: FLAG2\n')
            try:
                os.chdir(cwd)
            except Exception as e:
                # Directory is invalid
                output = {}
                output["present"] = False
                ouptut["message"] = str(e)
                output["error"] = "File path invalid"
                json_output = json.dumps(output)
                outf.write(json_output)
                outf.write("\n")
                outf.flush()
                sys.stderr.write("File path invalid")
                continue

            exitInfoPipe.write('ZY: FLAG3\n')
            try:
                exitInfoPipe.write('ZY: FLAG3 part b: ' + str(file) + ' - ' + str(sys.path) + '\n')
                mod = importlib.import_module(file)
                exitInfoPipe.write('ZY: FLAG3 part c\n')
            except Exception as e:
                # File nonexstant
                sys.stderr.write("File not present in the current directory")
                sys.stderr.flush()
                output = {}
                output["present"] = False
                output["message"] = str(e)
                output["error"] = "File not present in the current directory"
                json_output = json.dumps(output)
                outf.write(json_output)
                outf.write("\n")
                outf.flush()
                continue

            exitInfoPipe.write('ZY: FLAG4\n')
            # Check if we have the required fcn in the module
            if hasattr(mod, fcn):
                exitInfoPipe.write('ZY: FLAG5\n')
                # Call the desired function in the loaded module
                method = getattr(mod, fcn)
                val = method(*args)
                exitInfoPipe.write('ZY: FLAG6\n')

                if fcn=="file":
                    # if val is None, replace it with empty string
                    if val is None:
                        val = ''
                    # if val is a file-like object, read whatever is inside
                    if isinstance(val,io.IOBase):
                        val.seek(0)
                        val = val.read()
                    # if val is a string, treat it as utf-8
                    if isinstance(val,str):
                        val = bytes(val,'utf-8')
                    exitInfoPipe.write('ZY: FLAG7\n')
                    # if this next call does not work, it will throw an error, because
                    # the thing returned by file() does not have the correct format
                    val = base64.b64encode(val).decode()
                # Any function that is not 'file' or 'render' will modify 'data' and
                # should not be returning anything (because 'data' is mutable).
                # TODO file and render shouldn't be static things, we should
                #       make this something that the user controls. Perhaps,
                #       we should make it so that when you start up zygote, you
                #       must pass in a list of such function names?
                #if (fcn == 'file') or (fcn == 'render'):
                lastArg = None

                exitInfoPipe.write('ZY: FLAG8\n')
                if (len(args) > 0):
                    lastArg = args[-1]
                if val is None or (fcn in ['file']):
                    json_outp = json.dumps({"present": True, "val": lastArg})
                else:
                    #json_outp_passed = json.dumps({"present": True, "val": lastArg}, sort_keys=True)
                    json_outp = json.dumps({"present": True, "val": val}, sort_keys=True)
                    #if json_outp_passed != json_outp:
                    #    sys.stderr.write('WARNING: Passed and returned value of "data" differ in the function ' + str(fcn) + '() in the file ' + str(cwd) + '/' + str(file) + '.py.\n\n passed:\n  ' + str(args[-1]) + '\n\n returned:\n  ' + str(val) + '\n\nThere is no need to be returning "data" at all (it is mutable, i.e., passed by reference). In future, this code will throw a fatal error. For now, the returned value of "data" was used and the passed value was discarded.')
                #else:
                #    json_outp = json.dumps({"present": True, "val": val})
                exitInfoPipe.write('ZY: FLAG9\n')
            else:
                # the function wasn't present, so report this
                output = {}
                output["present"] = False
                output["error"] = "Function not present"
                json_outp = json.dumps(output)
            exitInfoPipe.write('ZY: FLAGA\n')
            # make sure all output streams are flushed
            sys.stderr.flush()
            sys.stdout.flush()

            # write the return value (JSON on a single line)
            outf.write(json_outp)
            outf.write("\n")
            outf.flush()
            exitInfoPipe.write('ZY: FLAGB\n')

saved_path = copy.copy(sys.path)

'''
Valid messages that could be sent to zygote
{"action":"create worker"}
{"action":"kill worker"}
{"action":"status"}
{"action":"getChildPid"}
Messages that could be sent from zygote
{
"success":true,
}
{
"success":true,
"message":"The current status of my child is <status>"
}
{
"success":False,
"message":"already contains worker"
}
{
"success":False,
"message":"no current worker"
}
{
"success":False,
"message":"unknow command: <command>"
}
{
"success":True
"message":"<pid_child>"
}
'''

# Takes in a json object for a command to execute, returns message
# Called in try
def parseInput(command_input):
    message = {}
    if getIsWorker():
        sys.stderr.write("Worker should not be parsing Input: " + str(getChildPid()) + " : " + str(os.getpid()))
        sys.exit(1);
    if ("action" not in command_input):
        message["success"] = False
        message["message"] = "No action specified in input"
        return message

    action = command_input["action"]
    if (action == "create worker"):
        if (getChildPid() != -1):
            # we already have a child
            message["success"] = False
            message["message"] = "zygote already contains worker"
            return message
        global shouldKillWorker
        shouldKillWorker = False
        setChildPid(os.fork())
        if (getChildPid() == 0):
            # We are child
            setChildPid(-1)
            try:
                runWorker()
            except Exception as e:
                exc_type, exc_value, exc_traceback = sys.exc_info()

                traceback_template = '''Traceback (most recent call last): File "%(filename)s", line %(lineno)s, in %(name)s %(type)s: %(message)s\n'''
                traceback_details = {
                         'filename': exc_traceback.tb_frame.f_code.co_filename,
                         'lineno'  : exc_traceback.tb_lineno,
                         'name'    : exc_traceback.tb_frame.f_code.co_name,
                         'type'    : exc_type.__name__,
                         'message' : str(e), # or see traceback._some_str()
                        }
                del(exc_type, exc_value, exc_traceback)
                #sys.stderr.write("run worker failed: " + str(e) + " " + str(exc_type) + " " + str(fname) + " " + str(exc_tb.tb_lineno))
                sys.stderr.write("run worker failed: \n"
                 + traceback.format_exc())
                #  + "\n" + traceback_template % traceback_details)
            sys.stderr.write("runWorker stopped running")
            sys.exit(1) # exit with error code if child exits runWorker
        else:
            # Set signal handler for when child dies
            signal.signal(signal.SIGCHLD, waitForChild)
        message["success"] = True
    elif (action == "kill worker"):
        if (getChildPid() == -1):
            message["success"] = False
            message["message"] = "no current worker"
            return message
        shouldKillWorker = True
        pid = getChildPid()
        setChildPid(-1)
        os.kill(pid, signal.SIGKILL)
        message["success"] = True
        os.waitpid(pid, 0)
    elif (action == "kill self"):
        # TODO ADD ADDITIONAL LOGIC
        sys.exit(0)
    elif (action == "status"):
        message["success"] = True
        status =  "not created" if (getChildPid()==-1) else "created"
        message["message"] = "The current status of my child is <%s>"%(status)
    elif (action == "workerPid"):
        message["success"] = True
        pid_child = getChildPid()
        message["message"] = "%d"%(pid_child)
    else:
        # DEBUG: Unkown Input
        message["success"] = False
        message["message"] = "unknown action: \"%s\""%(action)
    return message

# File input 4 is for zygote commands from the manager
# File input 5 is for messegages returned for the commands passed through file input 4
try:
    with open(4, 'r', encoding='utf-8') as inZygote, open(5, 'w', encoding='utf-8') as outZygote:
        # infinite loop for Zygote to recieve commands
        # Zygote will not exit on its own
        # Unless it recieves a SIGTERM or SIGKILL
        signal.signal(signal.SIGTERM, int_handler)
        while True:
            # wait for a single line of input from command pipe
            json_inp = inZygote.readline().strip()
            if (json_inp is None or json_inp == ""):
                continue
            # unpack the input line as JSON
            input = json.loads(json_inp)
            try:
                output = parseInput(input)
            except Exception as e:
                sys.stderr.write("Error on parse input: " + str(e))
                sys.stderr.flush()
                output = {}
                output["success"] = False
                output["message"] = str(e)
            json_output = json.dumps(output)
            # sys.stderr.write("[" + json_output + "]")
            outZygote.write(json_output + '\n')
            outZygote.flush()
        sys.stderr.write("Wierd issue found: " + str(getChildPid()) + ", " + str(getIsWorker()))
        sys.stderr.flush()
except Exception as e:
    '''
    jsonDict = {}
    jsonDict["type"] = 'exit'
    jsonDict["code"] = 1
    jsonDict["signal"] = str(e)
    jsonStr = json.dumps(jsonDict)
    exitInfoPipe.write(jsonStr + '\n')
    exitInfoPipe.flush()
    '''
    exc_type, exc_value, exc_traceback = sys.exc_info()

    traceback_template = '''Traceback (most recent call last): File "%(filename)s", line %(lineno)s, in %(name)s %(type)s: %(message)s\n'''
    traceback_details = {
             'filename': exc_traceback.tb_frame.f_code.co_filename,
             'lineno'  : exc_traceback.tb_lineno,
             'name'    : exc_traceback.tb_frame.f_code.co_name,
             'type'    : exc_type.__name__,
             'message' : str(e), # or see traceback._some_str()
            }
    del(exc_type, exc_value, exc_traceback)
    #sys.stderr.write("run worker failed: " + str(e) + " " + str(exc_type) + " " + str(fname) + " " + str(exc_tb.tb_lineno))
    sys.stderr.write("zygote failed: \n"
     + traceback.format_exc())
    sys.stderr.flush()
