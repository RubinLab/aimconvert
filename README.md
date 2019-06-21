# aimconvert

Commandline program for converting AIM files from XML to JSON and JSON to XML.

Accepts mode, input and output.
If the mode is not given, it depends on the file extension.
If the input is a directory and the mode is not given, it uses the first files extension to decide the convertion mode.

Sample modes to run are like following:
./bin/aimconvert xml2json inputDirPath outputDirPath
will convert every xml in inputDirPath to json and puts in outputDirPath. Creates outputDirPath if it doesn't exist

./bin/aimconvert json2xml inputDirPath outputDirPath
will convert every json in inputDirPath to xml and puts in outputDirPath. Creates outputDirPath if it doesn't exist

./bin/aimconvert ./test/data outputDirPath
will start processing data directory in test as it has xml files, the application will convert every xml in ./test/data to json and puts in outputDirPath. Creates outputDirPath if it doesn't exist

./bin/aimconvert ./test/data/recist_sample.xml outputFilePath
will convert recist_sample.xml file in ./test/data to json and puts in outputFilePath
