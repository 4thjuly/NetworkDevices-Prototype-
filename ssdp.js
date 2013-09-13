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
var g_ssdpMulticastSocket;
var g_ssdpLocations = { };

// Search for SSDP devices by multicasting an M-SEARCH. 
// Each device should respond with a NOTIFY that contains a 'LOCATION' URL
// The LOCATION should provide the various XML properties
// Call the callback for each device that responds properly
function ssdpSearch(deviceFoundCallback) {
    var str = SSDP_DISCOVER;
	g_ssdpLocations = { }; 
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
			handleSsdpMulticastMessages(deviceFoundCallback);
			// Send DISCOVER and recv (unicast) results back
			chrome.socket.sendTo(socketId, new ArryBuffer(), "239.255.255.250", 1900, function (result) {
				console.log("ssdpSearch wrote:" + result.bytesWritten);
				ssdpRecvLoop(socketId, deviceFoundCallback);
			});
			// UDP is unreliable so repeat the multicast a few times
			var repeat = 3;			
			var timer = setInterval(function() {
				console.log('ssdpSearch('+repeat+'):...');
				chrome.socket.sendTo(socketId, buf, "239.255.255.250", 1900, function() { });
				if (--repeat <= 0) clearInterval(timer);
			}, 1000 + (Math.random() * 1000));
        });
    });
}

// NOTIFY messages can sometimes be multicast
function handleSsdpMulticastMessages(deviceFoundCallback) {
    if (g_ssdpMulticastSocket) {
        chrome.socket.destroy(g_ssdpMulticastSocket.socketId);
        g_ssdpMulticastSocket = null;
    }
    createMulticastSocket("239.255.255.250", 1900, 4, function(socket) {
        g_ssdpMulticastSocket = socket;
        ssdpRecvLoop(socket.socketId, deviceFoundCallback);
    });
}

function ssdpRecvLoop(socketId, deviceFoundCallback) {
//    console.log("ssdprl("+socketId+"):...");
    chrome.socket.recvFrom(socketId, 65507, function (result) {
        if (result.resultCode >= 0) {
//            console.log("...ssdprl.recvFrom("+socketId+"): " + result.address + ":" + result.port);
            var dv = new DataView(result.data);
            var blob = new Blob([dv]);
            var fr = new FileReader();
            fr.onload = function (e) {
                // var st = getServiceType(e.target.result);
                var info = getSsdpDeviceNotifyInfo(e.target.result);
                var location = info["LOCATION"];
				
				// TODO - Validate location is absolute
				
//                console.log('   loc:' + location);
//                console.log('   st:' + info["ST"]);
				
                // Got a location, get the xml properties (unless it's a dup)
                if (location && !g_ssdpLocations[location]) {
					g_ssdpLocations[location] = true; 
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
    var qualifiedLocation = new Uri(device.location);
    if (!qualifiedLocation.protocol()) qualifiedLocation.protocol('http');
    xhr.device = device;
    xhr.callback = deviceFoundCallback;
    xhr.open("GET", qualifiedLocation.toString(), true);
    xhr.onreadystatechange = onSsdpXMLReadyStateChange;
    xhr.send();
}

function onSsdpXMLReadyStateChange(e) {
    // NB Some devices will refuse to respond
    if (this.readyState == 4) {
        if (this.status == 200 && this.responseXML) {
            var xml = this.responseXML;
            var device = this.device;
            device.friendlyName = getXmlDataForTag(xml, "friendlyName") || getXmlDataForTag(xml, "ModelDescription") || 'Unknown Name';
            device.manufacturer = getXmlDataForTag(xml, "manufacturer") || getXmlDataForTag(xml, "VendorName") || 'Unknown Manufacturer';
            device.model = getXmlDataForTag(xml, "modelName") || getXmlDataForTag(xml, "ModelName") || 'Unknown Model';
            device.presentationUrl = getXmlDataForTag(xml, "presentationURL") || getXmlDataForTag(xml, "PresentationURL");
            if (device.presentationUrl) {
                device.presentationUrl = fullyQualifyUrl(device.location, device.presentationUrl) || "";
            } else {
                device.presentationUrl = "";
            }
            
            console.log('dxmlrsc: ...');
//            console.log(' loc: ' + device.location);     
            console.log(' info: ' + device.friendlyName + " (" + device.manufacturer + " " + device.model + ") [" + device.ip + "]");
//            console.log(' purl: ' + device.presentationUrl);   
            
            this.callback(device);
        }
    }    
}

