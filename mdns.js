// Handle all mdns related network stuff

function DNSMessage() {
	this.transactionId = 0;
	this.flags = 0;
	this.questionEntries = [];
	this.answerRecords = [];
	this.authorityRecords = [];
	this.additionalRecords = [];
}

function DNSQuestionEntry() {
	this.name = '';
	this.type = 0;
	this.clss = 0;
}
	
function DNSResourceRecord() {
	this.name = '';
	this.type = 0;
	this.clss = 1;
	this.ttl = 0;
	this.data = new ArrayBuffer();
}

var DNS_QUESTION_TYPE_PTR = 12;
var DNS_QUESTION_CLASS_IN = 1;
	
function CreateDNSQueryMessage(name) {
	var dnsm = new DNSMessage();
	var dnsqe = new DNSQuestionEntry();
	dnsqe.name = name;
	dnsqe.type = DNS_QUESTION_TYPE_PTR;
	dnsqe.clss = DNS_QUESTION_CLASS_IN;
	dnsm.questionEntries.push(dnsqe);
	return dnsm;
}

// Serialize DNS query message in to an array buffer suitable for sending over the wire
// NB Hardcoded to a single query record
DNSMessage.prototype.serializeQuery = function () {
	var buf = new ArrayBuffer(512);
	var view = new Uint8Array(buf);
	var qe = this.questionEntries[0];
	var nl = qe.name.length;
    
    // header stuff
	view[2] = (this.flags >> 8) & 0xff; view[3] = this.flags & 0xff;
	view[4] = 0; view[5] = 1;

    // question entry name, removing the dots
    var offset = 12; // questionEntries start at 12
    var parts = qe.name.split('.');
    parts.forEach(function (part) {
        view[offset++] = part.length;
        for (var i = 0; i < part.length; i++) {
		  view[offset++] = part.charCodeAt(i);
        }
	});
    
    // remaining stuff
	view[offset++] = 0;
	view[offset++] = (qe.type >> 8) & 0xff; view[offset++] = qe.type & 0xff;
	view[offset++] = (qe.clss >> 8) & 0xff; view[offset++] = qe.clss & 0xff;
	// Everything else can remain zero
	return buf;
}
	
var g_mdnsSearchSocket;	
	
function mdnsRecvLoop(socketId, deviceFoundCallback) {
    chrome.socket.recvFrom(socketId, 65507, function (result) {
        if (result.resultCode >= 0) {
            console.log("...mdnsrl.recvFrom("+socketId+"): " + result.address + ":" + result.port);
            ssdpRecvLoop(socketId, deviceFoundCallback);
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
