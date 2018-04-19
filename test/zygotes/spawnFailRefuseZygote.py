import sys, os, json, importlib, copy, base64, io, matplotlib
'''
Refuses to respond to request
'''
inZy = 4
outZy = 5
outFile = open("out.t", 'w', encoding='utf-8')
outFile.write("OPENED\n")
outFile.flush()
try:
    with open(inZy, 'r', encoding='utf-8') as inZygote, open(outZy, 'w', encoding='utf-8') as outZygote:
        # infinite loop for Zygote to recieve commands
        # Zygote will not exit on its own
        # Unless it recieves a SIGTERM or SIGKILL
        while True:
            # wait for a single line of input from command pipe
            json_inp = inZygote.readline().strip()

            if (json_inp is None or json_inp == ""):
                continue

            outFile.write(json_inp + '\n')
            outFile.flush()
except Exception as e:
    jsonDict = {}
    jsonDict["type"] = 'exit'
    jsonDict["code"] = 1
    jsonDict["signal"] = str(e)
    jsonStr = json.dumps(jsonDict)
    sys.stderr.write(str(e))
    exc_type, exc_obj, exc_tb = sys.exc_info()
    fname = os.path.split(exc_tb.tb_frame.f_code.co_filename)[1]
    outFile.write("<<Error>>" + str(exc_type) +  " " + str(fname) +  " " + str(exc_tb.tb_lineno) +  " " + str(e))
    outFile.flush()
    #exitInfoPipe.write(jsonStr + '\n')
    #exitInfoPipe.flush()
