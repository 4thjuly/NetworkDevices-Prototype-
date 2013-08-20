/* Handle all WS-DISCOVERY related network stuff */

// ---------------------------------------------------------------------------
var SOAP_HEADER = '<?xml version="1.0" encoding="utf-8" ?>';
var WSD_PROBE_MSG = [
    '<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:wsd="http://schemas.xmlsoap.org/ws/2005/04/discovery" xmlns:wsdp="http://schemas.xmlsoap.org/ws/2006/02/devprof">',
    '<soap:Header>',
        '<wsa:To>',
            'urn:schemas-xmlsoap-org:ws:2005:04:discovery',
        '</wsa:To>',
        '<wsa:Action>',
            'http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe',
        '</wsa:Action>',
        '<wsa:MessageID>',
            'urn:uuid:00000000-0000-0000-0000-000000000000',
        '</wsa:MessageID>',
    '</soap:Header>',
    '<soap:Body>',
        '<wsd:Probe>',
            '<wsd:Types>wsdp:Device</wsd:Types>',
        '</wsd:Probe>',
    '</soap:Body>',
    '</soap:Envelope>'
    ].join('');
// NB COMPAT Header and msg being separated by a line is important to some devices
var WSD_PROBE = SOAP_HEADER + '\r\n' + WSD_PROBE_MSG;

var WSD_TRANSFER_GET_MSG = [
    '<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing">',
      '<soap:Header>',
        '<wsa:To>uuid:11111111-1111-1111-1111-111111111111</wsa:To>',
        '<wsa:Action>',
          'http://schemas.xmlsoap.org/ws/2004/09/transfer/Get',
        '</wsa:Action>',
        '<wsa:MessageID>',
          'urn:uuid:00000000-0000-0000-0000-000000000000',
        '</wsa:MessageID>',
        '<wsa:ReplyTo>',
          '<wsa:Address>http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</wsa:Address>',
        '</wsa:ReplyTo>',
      '</soap:Header>',
      '<soap:Body/>',
    '</soap:Envelope>'  
    ].join('');
var WSD_TRANSFER_GET = SOAP_HEADER + WSD_TRANSFER_GET_MSG;


// ---------------------------------------------------------------------------
var g_wsdSearchSocket;

// Search for Web Services devices by multicasting an discovery Probe 
// Each device should respond with a ProbeMatches that contains an XAddrs URL
// Send a Transfer-Get to the XAddrs should provide the various XML properties
// Call the callback for each device that responds properly
function wsdSearch(deviceFoundCallback) {
    // trigger an ws-discover probe
    var uuid = createNewUuid();
    var str = WSD_PROBE.replace('00000000-0000-0000-0000-000000000000', uuid);
    var buf = new ArrayBuffer(str.length);
    var bufView = new Uint8Array(buf);
    for (var i=0, strLen=str.length; i<strLen; i++) {
        bufView[i] = str.charCodeAt(i);
    }

    if (g_wsdSearchSocket) {
        chrome.socket.destroy(g_wsdSearchSocket.socketId);
        g_wsdSearchSocket = null;
    }
    
    chrome.socket.create("udp", function (socket) {
        g_wsdSearchSocket = socket;
        var socketId = socket.socketId;
        chrome.socket.bind(socketId, "0.0.0.0", 0, function (result) {
            chrome.socket.sendTo(socketId, buf, "239.255.255.250", 3702, function (result){
                console.log("wsdSearch wrote:" + result);
                wsdRecvLoop(socketId, deviceFoundCallback);
            });
        });
    });
}

function wsdRecvLoop(socketId, deviceFoundCallback) {
    console.log("wsdRecvFrom:...");
    chrome.socket.recvFrom(socketId, 4096, function (result) {
        if (result.resultCode >= 0) {
            console.log("wsdRecvFrom: " + result.address);
            var dv = new DataView(result.data);
            var blob = new Blob([dv]);
            var fr = new FileReader();
            fr.onload = function (e) {
                var txt = e.target.result;
                var parser = new DOMParser();
                var xml = parser.parseFromString(txt,"text/xml");
                // TODO Debug: show types
                console.log("wsdrcl: types: " + getXmlDataForTag(xml, "Types"));
                // Location should be in XAddrs
                // TODO Some devices may only have an EndPointReference and need a resolve to get the XAddr
                var location = getXmlDataForTag(xml, "XAddrs");
                // HACK - Just grab the first address if there are multiple
                if (location) {
                    location = location.split(' ')[0];
                    console.log("wsdrcl: " + location);
                    var endpointReference = getXmlDataForTag(xml, "Address");
                    var device = new Device(location, result.address, endpointReference);
                    getWsdDeviceXmlInfo(device, deviceFoundCallback);
                }
            };
            fr.readAsText(blob);
            wsdRecvLoop(socketId, deviceFoundCallback);
        } else {
            // TODO: Handle error -4?
            console.log("wsdRecvFrom: " + result.resultCode);
        }
    });   
}

function getWsdDeviceXmlInfo(device, deviceFoundCallback) {
    var uuid = createNewUuid();
    var str = WSD_TRANSFER_GET.replace('00000000-0000-0000-0000-000000000000', uuid);
    str = str.replace('uuid:11111111-1111-1111-1111-111111111111', wsDevice.endpointReference);
    // TODO - Replace the To: with an end-point reference
    var xhr = new XMLHttpRequest();
    xhr.device = device;
    xhr.callback = deviceFoundCallback;
    xhr.open("POST", device.location, true);
    xhr.setRequestHeader('Content-Type', 'application/soap+xml');
    xhr.setRequestHeader('Cache-Control', 'no-cache');
    xhr.setRequestHeader('Pragma', 'no-cache');
    xhr.onreadystatechange = onWsdXMLReadyStateChange;
    xhr.send(str);
}

// Should get a GetResponse following a ws-transfer get request
function onWsdXMLReadyStateChange(e) {
    if (this.readyState == 4) {
        if (this.status == 200) {
            var xml = this.responseXML;
            var device = this.device;
            // console.log("wstgrsc: responseXML: " + xml);
            // TODO - get the friendly name, make, model etc from
            // NB BLOCKED on crbug/238819 : UDP being able to share the wsd port on windows (works on ChromeOS)
            device.manufacturer = getXmlDataForTag(xml, "Manufacturer");
            device.model = getXmlDataForTag(xml, "ModelName");
            device.presentationUrl = getXmlDataForTag(xml, "PresentationUrl");
            device.friendlyName = getXmlDataForTag(xml, "FriendlyName");
            
            console.log('wstgrsc: ...');
            console.log(' loc: ' + device.location);     
            console.log(' info: ' + device.friendlyName + " (" + device.manufacturer + " " + device.model + ") [" + device.ip + "]");
            console.log(' purl: ' + device.presentationUrl);  
           
            this.callback(device);
        }
    }    
}