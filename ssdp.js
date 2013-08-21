/* Handle all sddp related network stuff */

// NB COMPAT Bank last line is key to most devices
var SSDP_DISCOVER = [
     'M-SEARCH * HTTP/1.1 ',
     'HOST: 239.255.255.250:1900',
     'MAN: "ssdp:discover"',
     'MX:3',
     'ST: ssdp:all', 
     '\r\n'
    ].join('\r\n');

var g_ssdpSearchSocket;

// Search for SSDP devices by multicasting an M-SEARCH. 
// Each device should respond with a NOTIFY that contains a 'LOCATION' URL
// The LOCATION should provide the various XML properties
// Call the callback for each device that responds properly
function ssdpSearch(deviceFoundCallback) {
    // trigger an ssdp m-search
    var str = SSDP_DISCOVER;
    var buf = new ArrayBuffer(str.length);
    var bufView = new Uint8Array(buf);
    for (var i=0, strLen=str.length; i<strLen; i++) {
        bufView[i] = str.charCodeAt(i);
    }

    if (g_ssdpSearchSocket) {
        chrome.socket.destroy(g_ssdpSearchSocket.socketId);
        g_ssdpSearchSocket = null;
    }
    
    chrome.socket.create("udp", function (socket) {
        g_ssdpSearchSocket = socket;
        var socketId = socket.socketId;
        chrome.socket.bind(socketId, "0.0.0.0", 0, function (result) {
			// Send DISCOVER and recv results back
			chrome.socket.sendTo(socketId, buf, "239.255.255.250", 1900, function (result) {
				console.log("ssdpSearch wrote:" + result.bytesWritten);
				ssdpRecvLoop(socketId, deviceFoundCallback);
			});
			// UDP is unreliable, spec recommends repeating the multicast a few times
			var repeat = 2;			
			var timer = setInterval(function() {
				console.log('ssdpSearch('+repeat+'):...');
				chrome.socket.sendTo(socketId, buf, "239.255.255.250", 1900, function() { });
				if (--repeat <= 0) clearInterval(timer);
			}, 1000);
        });
    });
}

function ssdpRecvLoop(socketId, deviceFoundCallback) {
//    console.log("ssdpRecvLoop:...");
    chrome.socket.recvFrom(socketId, 4096, function (result) {
        if (result.resultCode >= 0) {
            console.log("ssdprl.recvFrom("+socketId+"): " + result.address + ":" + result.port);
            var dv = new DataView(result.data);
            var blob = new Blob([dv]);
            var fr = new FileReader();
            fr.onload = function (e) {
                // var st = getServiceType(e.target.result);
                var info = getSsdpDeviceNotifyInfo(e.target.result);
                var location = info["LOCATION"];
                console.log('   loc:' + location);
                console.log('   st:' + info["ST"]);
                // Keep track of devices by location
                if (location) {
                    var device = new Device(location, result.address);
                    getSsdpDeviceXmlInfo(device, deviceFoundCallback);
                }                   
            };
            fr.readAsText(blob);
            ssdpRecvLoop(socketId, deviceFoundCallback);
        } else {
            // TODO: Handle error -4?
            console.log("ssdprRecvFrom: Error: " + result.resultCode);
        }
    });   
}

function getSsdpDeviceNotifyInfo(data) {
    var lines = data.split("\r\n");
    var info = {};
    for (var i=1; i<lines.length; i++) {
        var line = lines[i];
        var delimPos = line.indexOf(":");
        if (delimPos > 0) {
            info[line.substring(0, delimPos).toUpperCase()] = line.substring(delimPos+1);
        }
    }
    return info;
}

function getSsdpDeviceXmlInfo(device, deviceFoundCallback) {
    var xhr = new XMLHttpRequest();
    xhr.device = device;
    xhr.callback = deviceFoundCallback;
    xhr.open("GET", device.location, true);
    xhr.onreadystatechange = onSsdpXMLReadyStateChange;
    xhr.send();
}

function onSsdpXMLReadyStateChange(e) {
    // NB Some devices will refuse to respond
    if (this.readyState == 4) {
        if (this.status == 200 && this.responseXML) {
            var xml = this.responseXML;
            var device = this.device;
            device.friendlyName = getXmlDataForTag(xml, "friendlyName");
            device.manufacturer = getXmlDataForTag(xml, "manufacturer");
            device.model = getXmlDataForTag(xml, "modelName");
            device.presentationUrl = getXmlDataForTag(xml, "presentationURL");
            
//            console.log('dxmlrsc: ...');
//            console.log(' loc: ' + device.location);     
//            console.log(' info: ' + device.friendlyName + " (" + device.manufacturer + " " + device.model + ") [" + device.ip + "]");
//            console.log(' purl: ' + device.presentationUrl);   
            
            this.callback(device);
        }
    }    
}