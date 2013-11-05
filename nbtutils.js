// Handle all NBT related network stuff
// Separated out just to make it easier to share with other apps
// TODO - De-dup with msdns stuff

// ---------------------------------------------------------------------------
var NBT_RESOURCE_RECORD_TYPE_A = 1;
var NBT_RESOURCE_RECORD_TYPE_PTR = 12;
var NBT_RESOURCE_RECORD_TYPE_TXT = 16;
var NBT_RESOURCE_RECORD_TYPE_SRV = 33;
var NBT_RESOURCE_RECORD_CLASS_IN = 1;
var NBT_HEADER_FLAGS_OFFSET = 2;
var NBT_HEADER_QUESTION_RESOURCE_RECORD_COUNT_OFFSET = 4;
var NBT_HEADER_ANSWER_RESOURCE_RECORD_COUNT_OFFSET = 6;
var NBT_HEADER_AUTHORITY_RESOURCE_RECORD_COUNT_OFFSET = 8;
var NBT_HEADER_ADDITIONAL_RESOURCE_RECORD_COUNT_OFFSET = 10;
var NBT_QUESTION_RESOURCE_OFFSET = 12;
var NBT_HEADER_REQUEST_QUERY_BROADCAST_RECURSION_ALLOWED = 0x0110;
var NBT_HEADER_REQUEST_QUERY_UNICAST_RECURSION_ALLOWED = 0x0100;
var NBT_WILDCARD_NAME = 'CKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
var NBT_MSBROWSE_NAME = 'ABACFPFPENFDECFCEPFHFDEFFPFPACAB';
var NBT_QUESTION_TYPE_NB = 0x20;
var NBT_QUESTION_TYPE_NBSTAT = 0x21;
var NBT_NAME_TYPE_WORKSTATION_SERVICE = 0x00;
var NBT_NAME_TYPE_MESSENGER_SERVICE = 0x03;
var NBT_NAME_TYPE_FILE_SERVER_SERVICE = 0x20;
var NBT_NAME_TYPE_DOMAIN_MASTER_BROWSER = 0x1B;
var NBT_NODE_NAME_FLAGS_GROUP = 0x8000;
var NBT_MESSAGE_FLAGS_RESPONSE = 0x8000;
var NBT_MAX_RESPONSE_PACKET_SIZE = 9000;

        
// ---------------------------------------------------------------------------
function NBTMessage() {
    this.flags = 0;
    this.questionRecords = [];
    this.answerRecords = [];
}

function NBTQuestionRecord() {
    this.name = '';
    this.type = NBT_RESOURCE_RECORD_TYPE_PTR;
    this.clss = NBT_RESOURCE_RECORD_CLASS_IN;
}
    
function NBTNodeInfo() {
    this.name = '';
    this.type = 0;
    this.flags = 0;
}    

function NBTAnswerRecord() {
    this.name = undefined;
    this.type = 0;
    this.class = 0;
    this.data = undefined;
    this.nodeInfos = [];
}

function NBTStream(array, initialOffset) {
    this.array = array;
    this.pos = initialOffset || 0;
}

// ---------------------------------------------------------------------------
NBTStream.prototype.bytesToIPv4 = function () {
    var arr = this.array;
    var pos = this.pos;
    var ip = arr[pos] + '.' + arr[pos+1] + '.' + arr[pos+2] + '.' + arr[pos+3];
    this.pos += 4;
    return ip;
};

NBTStream.prototype.labelsToName = function (len) {
      return this.getLabels(len).join('.');
};

// Parse out labels (byte counted strings with compression)
NBTStream.prototype.getLabels = function (len) {
    var array = this.array;
    var offset = this.pos;
    var labels = [];
    var labelLen;
    var dataEnd = len ? offset + len : array.length;
    var label;
    
     while (offset < dataEnd) {
        labelLen = array[offset++];
        if (!labelLen) {
            break;
        } else if (labelLen >= 0xc0) {
            // Handle label compression, follow the ptr then stop
            var ptr = ((labelLen & 0x3f) << 8) + array[offset++];
            var tempNS = new NBTStream(array, ptr);
            label = tempNS.labelsToName();
            labels.push(label);
            break;
        } else {
            label = '';
            for (var i = 0; i < labelLen; i++) {
                  label += String.fromCharCode(array[offset++]);
            }
            labels.push(label);
        }
      }
    this.pos = offset;
    // TODO - Decode NetBIOS name part (labels[0])
      return labels;
};

NBTStream.prototype.getNBTQuestionRecords = function (count) {
    var questionRecords = [];    
    for (var i = 0; i < count; i++) {
        var nbtqr = new NBTQuestionRecord();
        var name = this.labelsToName();
        nbtqr.name = name;
        this.pos += 4; // skip the type and class
        questionRecords.push(nbtqr);
    }
    return questionRecords;
};

NBTStream.prototype.getNBTAnswerRecords = function (count) {
    var answerRecords = [];    
    for (var i = 0; i < count; i++) {
        var nbtar = new NBTAnswerRecord();
        nbtar.name = this.labelsToName();
        nbtar.type = arrayToUint16(this.array, this.pos);
        // skip the type, class & ttl    
        this.pos += 8;    
        // get the data            
        var dataLen = arrayToUint16(this.array, this.pos);
        this.pos += 2;
        var dataPos = this.pos; 
        nbtar.data = this.array.subarray(this.pos, this.pos + dataLen);
        if (nbtar.type == NBT_QUESTION_TYPE_NBSTAT) {
            var nameCount = this.array[this.pos++] & 0xff;
            for (var j = 0; j < nameCount; j++) {
                var nodeInfo = new NBTNodeInfo();
                for (var k = 0; k < 15; k++) {
                      nodeInfo.name += String.fromCharCode(this.array[this.pos++]);
                }
                nodeInfo.type = this.array[this.pos++] & 0xff;
                nodeInfo.flags = arrayToUint16(this.array, this.pos);
                this.pos += 2;
                nbtar.nodeInfos.push(nodeInfo);
            }
        } else {
            // Just skip the data for any other record types else
            // TODO: IPv6
            console.log('gnbtar: Skipped record type: ' + nbtar.type);
        }
        answerRecords.push(nbtar);
        this.pos = dataPos + dataLen;
    }
    return answerRecords;
};
    
// Parse given arrayBuffer in to a NBT message
function createNBTResponseMessage(arrayBuffer) {
    var nbtm = new NBTMessage();
    if (arrayBuffer) {
        var view = new Uint8Array(arrayBuffer);
        var ns = new NBTStream(view);
        nbtm.flags = arrayToUint16(view, NBT_HEADER_FLAGS_OFFSET);
        var queCount = arrayToUint16(view, NBT_HEADER_QUESTION_RESOURCE_RECORD_COUNT_OFFSET);
        var ansCount = arrayToUint16(view, NBT_HEADER_ANSWER_RESOURCE_RECORD_COUNT_OFFSET);
        ns.pos = NBT_QUESTION_RESOURCE_OFFSET;
        nbtm.questionRecords = ns.getNBTQuestionRecords(queCount);
        nbtm.answerRecords = ns.getNBTAnswerRecords(ansCount);
    }
    
    return nbtm;
}
        
// Serialize NBT query message in to an array buffer suitable for sending over the wire
// NB Hardcoded to a single query record
NBTMessage.prototype.serializeQuery = function () {
    var buf = new ArrayBuffer(512);
    var view = new Uint8Array(buf);
    var qr = this.questionRecords[0];
    
    // Header stuff
    uint16ToArray(view, NBT_HEADER_FLAGS_OFFSET, this.flags);
    uint16ToArray(view, NBT_HEADER_QUESTION_RESOURCE_RECORD_COUNT_OFFSET, 1);
                  
    // Question entry name, removing the dots
    var offset = NBT_QUESTION_RESOURCE_OFFSET;
    var labels = qr.name.split('.');
    labels.forEach(function (label) {
        view[offset++] = label.length;
        for (var i = 0; i < label.length; i++) {
              view[offset++] = label.charCodeAt(i);
        }
    });
    
    // Remaining stuff
    uint16ToArray(view, offset+1, qr.type);
    uint16ToArray(view, offset+3, qr.clss);
    
    // trim
    buf = buf.slice(0, offset+5); 
                    
    return buf;
};

// Return the NBT encoded name
function nameToNBTName(name, nameType) {
    var nbtName = '';
    var len = Math.min(name.length, 15);
    var aCode = 'A'.charCodeAt(0);
    // Convert the name
    for (var i=0; i<len; i++) {
        var charCode = name[i].charCodeAt(0);
        nbtName += String.fromCharCode(aCode + ((charCode & 0xf0) >>> 4));
        nbtName += String.fromCharCode(aCode + (charCode & 0x0f));
    }
    // Leave the rest padded with space 
    for (var j=i; j<15; j++) {
        nbtName += 'CA';
    }
    // End with type byte
    nbtName += String.fromCharCode(aCode + ((nameType & 0xf0) >>> 4));
    nbtName += String.fromCharCode(aCode + (nameType & 0x0f));
    
    return nbtName;
}

// ---------------------------------------------------------------------------
var g_nbtSearchSocket;    

function createNBTRequest(name, type, broadcast) {
    var nbtm = new NBTMessage();
    var nbtqr = new NBTQuestionRecord();
    nbtm.flags = broadcast ? NBT_HEADER_REQUEST_QUERY_BROADCAST_RECURSION_ALLOWED : NBT_HEADER_REQUEST_QUERY_UNICAST_RECURSION_ALLOWED;
    nbtqr.name = name;
    nbtqr.type = type;
    nbtm.questionRecords.push(nbtqr);
    return nbtm;
}

// De-pads an NBT name
function NBTNameToNormal(nbtName) {
    var name = '';
    for (var i = 0; i < nbtName.length; i++) {
        if (nbtName[i] > ' ') name += nbtName[i];
        else break;
    }
    return name;
}

// Return first name that matches the given criteria
function getNodeInfoNameByType(nodeInfos, type, group) {
    for (var i = 0; i < nodeInfos.length; i++) {
        if (nodeInfos[i].type == type) {
            if (!group == !(nodeInfos[i].flags & NBT_NODE_NAME_FLAGS_GROUP)) {
                return NBTNameToNormal(nodeInfos[i].name);
            }
        }
    }
}

function checkWebServer(device, deviceFoundCallback) {
    var xhr = new XMLHttpRequest();
    xhr.device = device;
    xhr.callback = deviceFoundCallback;
    xhr.open('GET', 'http://' + device.ip, true);
    xhr.setRequestHeader('Cache-Control', 'no-cache');
    xhr.setRequestHeader('Pragma', 'no-cache');
    xhr.onreadystatechange = onCheckWebServerReadyStateChange;
    xhr.send();
}

function onCheckWebServerReadyStateChange() {
    if (this.readyState == 4) {
        if (this.status == 200) {
            console.log('ocwsrsc: response');
            this.device.presentationUrl = 'http://' + this.device.ip
            this.callback(this.device);
        }
    }
}

function ipToNum(ip) {
    var parts = ip.split('.');
    if (parts.length == 4) return (parts[0] * 0x1000000) + (parts[1] * 0x10000) + (parts[2] * 0x100) + (parts[3]|0);
    else return -1;
}

function numToIP(num) {
    var part1 = num & 0xff;
    var part2 = ((num >>> 8) & 0xff);
    var part3 = ((num >>> 16) & 0xff);
    var part4 = ((num >>> 24) & 0xff);

    return part4 + "." + part3 + "." + part2 + "." + part1;
}

function getBroadcastIP(ip, prefixLen) {
    var ipNum = ipToNum(ip);
    if (ipNum != -1) {
        var notMask = 0xffffffff;
        if (prefixLen > 0) notMask = (1 << (32 - prefixLen)) - 1;
        broadcast = ipNum | notMask;
        return numToIP(broadcast);
    } else {
        return -1;
    }
}

// Look for PCs via NBT that have a web page
function nbtBroadcast(buf, sendToCallback) {
    // var nbtr = createNBTRequest(NBT_WILDCARD_NAME, NBT_QUESTION_TYPE_NBSTAT, true);
    // var buf = nbtr.serializeQuery();
        
    if (g_nbtSearchSocket) {
        chrome.socket.destroy(g_nbtSearchSocket.socketId);
        g_nbtSearchSocket = null;
    }
    
    chrome.socket.create("udp", function (socket) {
        g_nbtSearchSocket = socket;
        var socketId = socket.socketId;
        // NB Do Broadcasts need to come from port 137? Will this create port reuse issues?
        chrome.socket.bind(socketId, "0.0.0.0", 0, function (result) {
            // Broadcast on each network (IPv4 only)
            chrome.socket.getNetworkList(function (adapters) {
                for (var i = 0; i < adapters.length; i++) {
                    var ip = adapters[i].address;
                    var prefixLen = adapters[i].prefixLength;
                    var broadcastIP = getBroadcastIP(ip, prefixLen); 
                    if (broadcastIP != -1) {
                        var cBroadcastIP = broadcastIP;
                        chrome.socket.sendTo(socketId, buf, cBroadcastIP, 137, function (result) {
                            if (result.bytesWritten < 0) {
                                console.log("nbtSearch error:" + result.bytesWritten);      
                            } else {
                                console.log("nbtSearch wrote:" + result.bytesWritten);
                                
                                // Do it again in a bit since udp is unreliable
                                setTimeout(function() {
                                    chrome.socket.sendTo(socketId, buf, cBroadcastIP, 137, function (result) {});
                                }, 1000 + (Math.random() * 1000));
                                
                                //nbtWildcardSearchRecvLoop(socketId, deviceFoundCallback);
                                sendToCallback(socketId);
                            }
                        });
                    }
                }
            });
        });
    });
}

// Return the IP for the requested name via the callback
// NB Nbt names are often case sensitive. Windows generally uppercases things
function nbtNameSearchForIP(name, callback) {
    var lastIP;
    var nbtr = createNBTRequest(nameToNBTName(name), NBT_QUESTION_TYPE_NB, true);
    var buf = nbtr.serializeQuery();
    
    // NB This can be called more than once for each broadcast
    function recvLoop(socketId) {
        chrome.socket.recvFrom(socketId, NBT_MAX_RESPONSE_PACKET_SIZE, function (result) {
            if (result.resultCode >= 0) {
                console.log("...nbtrl.recvFrom("+socketId+"): " + result.address + ":" + result.port);            
                var nbtm = createNBTResponseMessage(result.data);
                if (nbtm.flags & NBT_MESSAGE_FLAGS_RESPONSE) {
                    console.log('..response.records: ' + nbtm.answerRecords.length);
                    if (lastIP != result.address) {
                        lastIP = result.address;
                        callback(result.address);
                    }
                }
                recvLoop(socketId);
            } else {
                console.log("  nbtrl: Error: " + result.resultCode);
            }
        });   
    }
    
    nbtBroadcast(buf, recvLoop);   
}
