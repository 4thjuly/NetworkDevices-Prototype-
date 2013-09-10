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
//	this.type = 0;
//	this.clss = 0;
}
	
function DNSResourceRecord() {
	this.name = '';
//	this.type = 0;
//	this.clss = 1;
//	this.ttl = 0;
	this.data = new ArrayBuffer();
}

var DNS_QUESTION_TYPE_PTR = 12;
var DNS_QUESTION_CLASS_IN = 1;
var DNS_HEADER_FLAGS_OFFSET = 2;
var DNS_HEADER_QUESTION_RESOURCE_RECORD_COUNT_OFFSET = 4;
var DNS_QUESTION_RESOURCE_OFFSET = 12;
		
function CreateDNSQueryMessage(name) {
	var dnsm = new DNSMessage();
	var dnsqe = new DNSQuestionEntry();
	dnsqe.name = name;
	dnsqe.type = DNS_QUESTION_TYPE_PTR;
	dnsqe.clss = DNS_QUESTION_CLASS_IN;
	dnsm.questionEntries.push(dnsqe);
	return dnsm;
}

function labelsToName(array, offset) {
  var labels = [];
  var len;
	
  while (true) {
	len = array[offset];
	if (!len) {
		break;
	} else if (len == 0xc0) {
		// TODO: Handle Commpression
		var ptr = array[offset+1];
		console.log("ltn: ignoring message compression");
		break;
	}

    var label = '';
	for (var i = 0; i < len; i++) {
      	label += String.fromCharCode(array[offset + 1 + i]);
    }
    labels.push(label);
  }
  return labels.join('.');
};

// Parse given arrayBuffer in to a DNS message
function CreateDNSMessage(arrayBuffer) {
    var dnsm = new DNSMessage();
	if (arrayBuffer) {
    	var view = new Uint8Array(arrayBuffer);
		var questionCount = arrayToInt(view, DNS_HEADER_QUESTION_RESOURCE_RECORD_COUNT_OFFSET);
		for (var i = 0; i < questionCount; i++) {
			var dnsqe = new DNSQuestionEntry();
			var name = labelsToName(view, DNS_QUESTION_RESOURCE_OFFSET);
			dnsqe.name = name;
			dnsm.questionEntries.push(dnsqe);
		}
		// TODO: Handle answer, authority and addition records too
	}
	
	return dnsm;
}

function uint16ToArray(array, offset, val) {
	array[offset] = (val >> 8) & 0xff;
	array[offset+1] = val & 0xff;
}

function arrayToInt(array, offset) {
	return (array[offset] << 8) + array[offset+1];
}
		
// Serialize DNS query message in to an array buffer suitable for sending over the wire
// NB Hardcoded to a single query record
DNSMessage.prototype.serializeQuery = function () {
	var buf = new ArrayBuffer(512);
	var view = new Uint8Array(buf);
	var qe = this.questionEntries[0];
	var nl = qe.name.length;
    
    // header stuff
//	view[2] = (this.flags >> 8) & 0xff; view[3] = this.flags & 0xff;	
//	view[4] = 0; view[5] = 1;
	//uint16ToArray(view, DNS_HEADER_FLAGS_OFFSET, this.flags);
	uint16ToArray(view, DNS_HEADER_QUESTION_RESOURCE_RECORD_COUNT_OFFSET, 1);
				  
    // question entry name, removing the dots
    var offset = DNS_QUESTION_RESOURCE_OFFSET;
    var labels = qe.name.split('.');
    labels.forEach(function (label) {
        view[offset++] = label.length;
        for (var i = 0; i < label.length; i++) {
		  	view[offset++] = label.charCodeAt(i);
        }
	});
    
    // remaining stuff
	//view[offset] = 0;
//	view[offset++] = (qe.type >> 8) & 0xff; view[offset++] = qe.type & 0xff;
//	view[offset++] = (qe.clss >> 8) & 0xff; view[offset++] = qe.clss & 0xff;
	//uint16ToArray(view, offset+1, qe.type);
	//uint16ToArray(view, offset+3, qe.clss);
	
	// Everything else can remain zero
	return buf;
}
	
var g_mdnsSearchSocket;	
	
function mdnsRecvLoop(socketId, deviceFoundCallback) {
    chrome.socket.recvFrom(socketId, 65507, function (result) {
        if (result.resultCode >= 0) {
            console.log("...mdnsrl.recvFrom("+socketId+"): " + result.address + ":" + result.port);            
			var dnsm = CreateDNSMessage(result.data);
            mdnsRecvLoop(socketId, deviceFoundCallback);
        } else {
            // TODO: Handle error -4?
            console.log("mdnsrl: Error: " + result.resultCode);
        }
    });   
}
	
function mdnsSearch(deviceFoundCallback) {
	var dnsq = CreateDNSQueryMessage('_services._dns-sd._udp.local');
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
