// Handle all mdns related network stuff

function DNSMessage() {
//	this.transactionId = 0;
//	this.flags = 0;
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
	this.name = '';
	this.type = 0;
//	this.clss = 1;
//	this.ttl = 0;
	this.data = new ArrayBuffer();
	this.dataText = '';
	this.IP = '';
}

function ArrayStream(array, initialOffset) {
	this.array = array;
	this.pos = initialOffset || 0;
}

var DNS_RESOURCE_RECORD_TYPE_A = 1;
var DNS_RESOURCE_RECORD_TYPE_PTR = 12;
var DNS_RESOURCE_RECORD_TYPE_TXT = 33;
var DNS_RESOURCE_RECORD_TYPE_SRV = 33;
var DNS_RESOURCE_RECORD_CLASS_IN = 1;
var DNS_HEADER_FLAGS_OFFSET = 2;
var DNS_HEADER_QUESTION_RESOURCE_RECORD_COUNT_OFFSET = 4;
var DNS_HEADER_ANSWER_RESOURCE_RECORD_COUNT_OFFSET = 6;
var DNS_HEADER_AUTHORITY_RESOURCE_RECORD_COUNT_OFFSET = 8;
var DNS_HEADER_ADDITIONAL_RESOURCE_RECORD_COUNT_OFFSET = 10;
var DNS_QUESTION_RESOURCE_OFFSET = 12;
		
function createDNSQueryMessage(name) {
	var dnsm = new DNSMessage();
	var dnsqe = new DNSQuestionEntry();
	dnsqe.name = name;
//	dnsqe.type = DNS_QUESTION_TYPE_PTR;
//	dnsqe.clss = DNS_QUESTION_CLASS_IN;
	dnsm.questionEntries.push(dnsqe);
	return dnsm;
}


function labelsToName(arrayStream) {
	var array = arrayStream.array;
	var offset = arrayStream.pos;
	var labels = [];
	var len;
	
 	while (true) {
		len = array[offset++];
		if (!len) {
			break;
		} else if (len >= 0xc0) {
			var ptr = ((len & 0x3f) << 8) + array[offset++];
			var ptrAS = new ArrayStream(arrayStream, ptr);
			var label = labelsToName(ptrAS);
//			console.log('ltn: message compression (' + ptr + ')');
//			len = array[ptr++];
//			var label = '';
//			for (var i = 0; i < len; i++) {
//      			label += String.fromCharCode(array[ptr + i]);
//    		}
    		labels.push(label);
			break;
		} else {
    		var label = '';
			for (var i = 0; i < len; i++) {
      			label += String.fromCharCode(array[offset++]);
    		}
    		labels.push(label);
		}
  	}
	arrayStream.pos = offset;
  	return labels.join('.');
};

function getDNSQuestionEntries(arrayStream, count) {
	var questionEntries = [];	
	for (var i = 0; i < count; i++) {
		var dnsqe = new DNSQuestionEntry();
		var name = labelsToName(arrayStream);
		dnsqe.name = name;
		arrayStream.pos += 4; // skip the type and class
		questionEntries.push(dnsqe);
		console.log('  gdnsqe: ' + name);
	}
	return questionEntries;
}

function bytesToIPv4(arrayStream) {
	var arr = arrayStream.array;
	var pos = arrayStream.pos;
	var ip = arr[pos] + '.' + arr[pos+1] + '.' + arr[pos+2] + '.' + arr[pos+3];
	arrayStream.pos += 4;
	return ip;
}

function getDNSResourceRecords(arrayStream, count) {
	var resourceRecords = [];	
	for (var i = 0; i < count; i++) {
		var dnsrr = new DNSResourceRecord();
		dnsrr.name = labelsToName(arrayStream);
		console.log('  gdnsrr.name: ' + dnsrr.name);
		dnsrr.type = arrayToUint16(arrayStream.array, arrayStream.pos);
		// skip the type, class & ttl	
		arrayStream.pos += 8;	
		// get the data			
		var dataLen = arrayToUint16(arrayStream.array, arrayStream.pos);
		arrayStream.pos += 2;
		dnsrr.data = arrayStream.array.subarray(arrayStream.pos, arrayStream.pos + dataLen);
		if (dnsrr.type == DNS_RESOURCE_RECORD_TYPE_PTR || dnsrr.type == DNS_RESOURCE_RECORD_TYPE_TXT) {
		    dnsrr.dataText = labelsToName(arrayStream);
			console.log('  gdnsrr.data: ' + dnsrr.dataText);
		} else if (dnsrr.type == DNS_RESOURCE_RECORD_TYPE_SRV) {
			// skip priority, weight and port			
			arrayStream.pos += 6;
		    dnsrr.dataText = labelsToName(arrayStream);
		} else if (dnsrr.type == DNS_RESOURCE_RECORD_TYPE_A) {
			dnsrr.IP = bytesToIPv4(arrayStream); 
			console.log('  gdnsrr.ip: ' + dnsrr.IP);
		} else {
			// Just skip the data for any other record types else
			// TODO: IPv6
			arrayStream.pos += dataLen;
		}
		resourceRecords.push(dnsrr);
	}
	return resourceRecords;
}
	
// Parse given arrayBuffer in to a DNS message
function createDNSMessage(arrayBuffer) {
    var dnsm = new DNSMessage();
	if (arrayBuffer) {
		var view = new Uint8Array(arrayBuffer);
		var as = new ArrayStream(view, DNS_QUESTION_RESOURCE_OFFSET);
		dnsm.questionEntries = getDNSQuestionEntries(as, arrayToUint16(view, DNS_HEADER_QUESTION_RESOURCE_RECORD_COUNT_OFFSET));
		dnsm.answerRecords = getDNSResourceRecords(as, arrayToUint16(view, DNS_HEADER_ANSWER_RESOURCE_RECORD_COUNT_OFFSET));
		dnsm.authorityRecords = getDNSResourceRecords(as, arrayToUint16(view, DNS_HEADER_AUTHORITY_RESOURCE_RECORD_COUNT_OFFSET));
		dnsm.additionalRecords = getDNSResourceRecords(as, arrayToUint16(view, DNS_HEADER_ADDITIONAL_RESOURCE_RECORD_COUNT_OFFSET));
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
//	var nl = qe.name.length;
    
    // Header stuff (skipping flags)
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
	
	// Everything else can remain zero
	
	return buf;
}
	
var g_mdnsSearchSocket;	
	
function mdnsRecvLoop(socketId, deviceFoundCallback) {
    chrome.socket.recvFrom(socketId, 65507, function (result) {
        if (result.resultCode >= 0) {
            console.log("...mdnsrl.recvFrom("+socketId+"): " + result.address + ":" + result.port);            
			var dnsm = createDNSMessage(result.data);
            mdnsRecvLoop(socketId, deviceFoundCallback);
        } else {
            // TODO: Handle error -4?
            console.log("mdnsrl: Error: " + result.resultCode);
        }
    });   
}
	
function mdnsSearch(deviceFoundCallback) {
//	var dnsq = createDNSQueryMessage('_services._dns-sd._udp.local');
	var dnsq = createDNSQueryMessage('_http._tcp.local');
	var buf = dnsq.serializeQuery();
		
    if (g_mdnsSearchSocket) {
        chrome.socket.destroy(g_mdnsSearchSocket.socketId);
        g_mdnsSearchSocket = null;
    }
    
    chrome.socket.create("udp", function (socket) {
        g_mdnsSearchSocket = socket;
        var socketId = socket.socketId;
        chrome.socket.bind(socketId, "0.0.0.0", 0, function (result) {
			chrome.socket.sendTo(socketId, buf, "224.0.0.251", 5353, function (result) {
				console.log("mdnsSearch wrote:" + result.bytesWritten);
				mdnsRecvLoop(socketId, deviceFoundCallback);
			});
        });
    });
}
