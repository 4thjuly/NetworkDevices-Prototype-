// Handle all NBT related network stuff
// TODO - De-dup with msdns stuff

// ---------------------------------------------------------------------------
var DNS_RESOURCE_RECORD_TYPE_A = 1;
var DNS_RESOURCE_RECORD_TYPE_PTR = 12;
var DNS_RESOURCE_RECORD_TYPE_TXT = 16;
var DNS_RESOURCE_RECORD_TYPE_SRV = 33;
var DNS_RESOURCE_RECORD_CLASS_IN = 1;
var DNS_HEADER_FLAGS_OFFSET = 2;
var DNS_HEADER_QUESTION_RESOURCE_RECORD_COUNT_OFFSET = 4;
var DNS_HEADER_ANSWER_RESOURCE_RECORD_COUNT_OFFSET = 6;
var DNS_HEADER_AUTHORITY_RESOURCE_RECORD_COUNT_OFFSET = 8;
var DNS_HEADER_ADDITIONAL_RESOURCE_RECORD_COUNT_OFFSET = 10;
var DNS_QUESTION_RESOURCE_OFFSET = 12;
var MDNS_MAX_PACKET_SIZE = 9000;
var NBT_HEADER_REQUEST_QUERY_BROADCAST_RECURSION_ALLOWED = 0x0110;
var NBT_WILDCARD_NAME = 'CKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
var NBT_QUESTION_TYPE_NB = 0x20;
		
// ---------------------------------------------------------------------------
function DNSMessage() {
    this.flags = 0;
	this.questionEntries = [];
	this.answerRecords = [];
	this.authorityRecords = [];
	this.additionalRecords = [];
}

function DNSQuestionEntry() {
	this.name = '';
	this.type = DNS_RESOURCE_RECORD_TYPE_PTR;
	this.clss = DNS_RESOURCE_RECORD_CLASS_IN;
}
	
function DNSResourceRecord() {
	this.name = undefined;
	this.type = 0;
	this.data = undefined;
	this.dataText = undefined;
	this.txtValues = { };
	this.ip = undefined;
	this.port = undefined;
}

function DNSStream(array, initialOffset) {
	this.array = array;
	this.pos = initialOffset || 0;
}

// ---------------------------------------------------------------------------
DNSStream.prototype.labelsToName = function (len) {
  	return this.getLabels(len).join('.');
}

// Parse out labels (byte counted strings with compression)
DNSStream.prototype.getLabels = function (len) {
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
			var tempDS = new DNSStream(array, ptr);
			label = tempDS.labelsToName();
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
  	return labels;
};

DNSStream.prototype.txtRecordToValues = function (len) {
	var values = { };
	var labels = this.getLabels(len);
	labels.forEach(function(label) {
		var nameValue = label.split('=');
		if (nameValue.length == 2) values[nameValue[0]] = nameValue[1];			
	});
  	return values;
};

DNSStream.prototype.getDNSQuestionEntries = function (count) {
	var questionEntries = [];	
	for (var i = 0; i < count; i++) {
		var dnsqe = new DNSQuestionEntry();
		var name = this.labelsToName();
		dnsqe.name = name;
		this.pos += 4; // skip the type and class
		questionEntries.push(dnsqe);
//		console.log('  gdnsqe: ' + name);
	}
	return questionEntries;
}

DNSStream.prototype.bytesToIPv4 = function () {
	var arr = this.array;
	var pos = this.pos;
	var ip = arr[pos] + '.' + arr[pos+1] + '.' + arr[pos+2] + '.' + arr[pos+3];
	this.pos += 4;
	return ip;
}

DNSStream.prototype.getDNSResourceRecords = function (count) {
	var resourceRecords = [];	
	for (var i = 0; i < count; i++) {
		var dnsrr = new DNSResourceRecord();
		dnsrr.name = this.labelsToName();
//		console.log('  gdnsrr.name('+i+'): ' + dnsrr.name);
		dnsrr.type = arrayToUint16(this.array, this.pos);
		// skip the type, class & ttl	
		this.pos += 8;	
		// get the data			
		var dataLen = arrayToUint16(this.array, this.pos);
		this.pos += 2;
		var dataPos = this.pos; 
		// NB Can't just create a temp arraystream since compression ptrs can point anywhere, not just in the data
		dnsrr.data = this.array.subarray(this.pos, this.pos + dataLen);
		// var dataAS = new ArrayStream(dnsrr.data);
		if (dnsrr.type == DNS_RESOURCE_RECORD_TYPE_PTR) {
		    dnsrr.dataText = this.labelsToName(dataLen);
//			console.log('  gdnsrr.data: ' + dnsrr.dataText);
		} else if (dnsrr.type == DNS_RESOURCE_RECORD_TYPE_SRV) {
			this.pos += 4; // skip priority, weight
			dnsrr.port = arrayToUint16(this.array, this.pos); 
			this.pos += 2; // port
		    dnsrr.dataText = this.labelsToName(dataLen);
//			console.log('  gdnsrr.srv: ' + dnsrr.dataText);
		} else if (dnsrr.type == DNS_RESOURCE_RECORD_TYPE_A) {
			dnsrr.ip = this.bytesToIPv4(); 
//			console.log('  gdnsrr.ip: ' + dnsrr.ip);
		} else if (dnsrr.type == DNS_RESOURCE_RECORD_TYPE_TXT) {
			dnsrr.txtValues = this.txtRecordToValues(dataLen);
//			console.log('  gdnsrr.txtValue: ' + Object.keys(dnsrr.txtValues).length);
		} else {
			// Just skip the data for any other record types else
			// TODO: IPv6
			console.log('gdnsrr: Skipped record type: ' + dnsrr.type);
		}
		resourceRecords.push(dnsrr);
		this.pos = dataPos + dataLen;
	}
	return resourceRecords;
}
	
// Parse given arrayBuffer in to a DNS message
function createDNSMessage(arrayBuffer) {
    var dnsm = new DNSMessage();
	if (arrayBuffer) {
		var view = new Uint8Array(arrayBuffer);
		var ds = new DNSStream(view, DNS_QUESTION_RESOURCE_OFFSET);
		dnsm.questionEntries = ds.getDNSQuestionEntries(arrayToUint16(view, DNS_HEADER_QUESTION_RESOURCE_RECORD_COUNT_OFFSET));
		dnsm.answerRecords = ds.getDNSResourceRecords(arrayToUint16(view, DNS_HEADER_ANSWER_RESOURCE_RECORD_COUNT_OFFSET));
		dnsm.authorityRecords = ds.getDNSResourceRecords(arrayToUint16(view, DNS_HEADER_AUTHORITY_RESOURCE_RECORD_COUNT_OFFSET));
		dnsm.additionalRecords = ds.getDNSResourceRecords(arrayToUint16(view, DNS_HEADER_ADDITIONAL_RESOURCE_RECORD_COUNT_OFFSET));
	}
	
	return dnsm;
}

function uint16ToArray(array, offset, val) {
	array[offset] = (val >> 8) & 0xff;
	array[offset+1] = val & 0xff;
}

function arrayToUint16(array, offset) {
	return (array[offset] << 8) + array[offset+1];
}
		
// Serialize DNS query message in to an array buffer suitable for sending over the wire
// NB Hardcoded to a single query record
DNSMessage.prototype.serializeQuery = function () {
	var buf = new ArrayBuffer(512);
	var view = new Uint8Array(buf);
	var qe = this.questionEntries[0];
    
    // Header stuff
	uint16ToArray(view, DNS_HEADER_FLAGS_OFFSET, this.flags);
    uint16ToArray(view, DNS_HEADER_QUESTION_RESOURCE_RECORD_COUNT_OFFSET, 1);
				  
    // Question entry name, removing the dots
    var offset = DNS_QUESTION_RESOURCE_OFFSET;
    var labels = qe.name.split('.');
    labels.forEach(function (label) {
        view[offset++] = label.length;
        for (var i = 0; i < label.length; i++) {
		  	view[offset++] = label.charCodeAt(i);
        }
	});
    
    // Remaining stuff
	uint16ToArray(view, offset+1, qe.type);
	uint16ToArray(view, offset+3, qe.clss);
	
	// trim
    buf = buf.slice(0, offset+4); 
                    
	return buf;
}

DNSMessage.prototype.friendlyName = function() {
	// Search the records looking for name, return the first part
	for (var i = 0; i < this.answerRecords.length; i++) {
		var record = this.answerRecords[i];
		if (record.dataText) { 
			var dotpos = record.dataText.indexOf('.');
			if (dotpos > 0) { 
				return record.dataText.slice(0, dotpos); 
			} else {
				return record.dataText;
			}
		}
	}
	return 'Unknown'; // Better then nothing
}

DNSMessage.prototype.ip = function() {
	// IP should be in an A record
	for (var i = 0; i < this.additionalRecords.length; i++) {
		var record = this.additionalRecords[i];
		if (record.ip) { return record.ip; };
	}
}

DNSMessage.prototype.port = function() {
	// Port should be in an SRV record
	for (var i = 0; i < this.additionalRecords.length; i++) {
		var record = this.additionalRecords[i];
		if (record.port) { return record.port; };
	}
}

DNSMessage.prototype.path = function() {
	// Path should be in a text value
	for (var i = 0; i < this.additionalRecords.length; i++) {
		var record = this.additionalRecords[i];
		if (record.txtValues['path']) { return record.txtValues['path']; };
	}
}

// Construct a presentation url: http:// + ip + port + path
DNSMessage.prototype.presentationUrl = function() {
	var ip = this.ip();
	var port = this.port();
	var path = this.path();
	var url = 'http://';
	
	if (ip) {
		url += ip;
		if (port) { url += ':' + port; }
		if (path) { 
			url += path; 
		} else {
			url += '/';
		}
//		console.log('dnsm.purl: ' + url);
		return url;
	}
}

// ---------------------------------------------------------------------------
var g_nbtSearchSocket;	
	
function createNBTQueryRequest(name) {
	var dnsm = new DNSMessage();
	var dnsqe = new DNSQuestionEntry();
    dnsm.flags = NBT_HEADER_REQUEST_QUERY_BROADCAST_RECURSION_ALLOWED;
	dnsqe.name = name;
    dnsqe.type = NBT_QUESTION_TYPE_NB;
	dnsm.questionEntries.push(dnsqe);
	return dnsm;
}

function nbtRecvLoop(socketId, deviceFoundCallback) {
    chrome.socket.recvFrom(socketId, MDNS_MAX_PACKET_SIZE, function (result) {
        if (result.resultCode >= 0) {
            console.log("...nbtrl.recvFrom("+socketId+"): " + result.address + ":" + result.port);            
			var dnsm = createDNSMessage(result.data);
			var friendlyName = dnsm.friendlyName();
			console.log('nbtrl:' + friendlyName); 
            nbtRecvLoop(socketId, deviceFoundCallback);
        } else {
            console.log("  nbtrl: Error: " + result.resultCode);
        }
    });   
}
	
// Look for PCs
function nbtSearch(deviceFoundCallback) {
    var nbtFlags = NBT_HEADER_REQUEST_QUERY_BROADCAST_RECURSION_ALLOWED; 
	var dnsq = createNBTQueryRequest(NBT_WILDCARD_NAME);
	var buf = dnsq.serializeQuery();
		
    if (g_nbtSearchSocket) {
        chrome.socket.destroy(g_nbtSearchSocket.socketId);
        g_nbtSearchSocket = null;
    }
    
    chrome.socket.create("udp", function (socket) {
        g_nbtSearchSocket = socket;
        var socketId = socket.socketId;
        chrome.socket.bind(socketId, "0.0.0.0", 0, function (result) {
            // TODO - Fix, get errorcode -10 on broadcast address
          
/*          
            chrome.socket.getNetworkList( function (network) {
              console.log('network: ' + network.name + ', ' + network.address);
            });
*/          
			chrome.socket.sendTo(socketId, buf, "192.168.0.255", 137, function (result) {
                if (result.bytesWritten >= 0) console.log("nbtSearch wrote:" + result.bytesWritten);
                else if (result.bytesWritten < 0) console.log("nbtSearch error:" + result.bytesWritten);                
				nbtRecvLoop(socketId, deviceFoundCallback);
			});

/*
			var repeat = 3;			
			var timer = setInterval(function() {
				console.log('mdnsSearch('+repeat+'):...');
				chrome.socket.sendTo(socketId, buf, "224.0.0.251", 5353, function() { });
				if (--repeat <= 0) clearInterval(timer);
			}, 1000 + (Math.random() * 1000));
*/
        });
    });
}
