
// Look for PCs via NBT that have a web page
function nbtSearch(deviceFoundCallback) {
    var nbtr = createNBTRequest(NBT_WILDCARD_NAME, NBT_QUESTION_TYPE_NBSTAT, true);
    var buf = nbtr.serializeQuery();
    
    function recvLoop(socketId) {
        chrome.socket.recvFrom(socketId, MDNS_MAX_PACKET_SIZE, function (result) {
            if (result.resultCode >= 0) {
                console.log("...nbtrl.recvFrom("+socketId+"): " + result.address + ":" + result.port);            
                var nbtm = createNBTResponseMessage(result.data);
                if (nbtm.flags & NBT_MESSAGE_FLAGS_RESPONSE) {
                    // Response msg
                    console.log('..response.records: ' + nbtm.answerRecords.length);
                    var name = getNodeInfoNameByType(nbtm.answerRecords[0].nodeInfos, NBT_NAME_TYPE_WORKSTATION_SERVICE, false);
                    var workgroup = getNodeInfoNameByType(nbtm.answerRecords[0].nodeInfos, NBT_NAME_TYPE_WORKSTATION_SERVICE, true);
                    console.log('..' + name + '(' + workgroup + ')')
                    var device = new Device(result.address + ":" + result.port, result.address, null, 'SMB', workgroup, name, null);
                    // TODO - Check it's a web server
                    checkWebServer(device, deviceFoundCallback);
                }
                recvLoop(socketId, deviceFoundCallback);
            } else {
                console.log("  nbtrl: Error: " + result.resultCode);
            }
        });   
    }
    
    nbtBroadcast(buf, recvLoop);
}



