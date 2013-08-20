
function Device(location, ip, endpointReference, manufacturer, model, friendlyName, presentationUrl) {
    this.location = location;
    this.manufacturer = manufacturer;
    this.model = model;
    this.friendlyName = friendlyName;
    this.ip = ip;
    this.presentationUrl = presentationUrl;
    this.endpointReference = endpointReference;
}

function getXmlDataForTag(xml, tagName) {
    var elements = xml.getElementsByTagName(tagName);
    if (elements && elements.length > 0) {
        var childNodes = elements[0].childNodes;
        if (childNodes && childNodes.length > 0) {
            return childNodes[0].data;
        }
    }
}

function createNewUuid() {
    var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
        return v.toString(16);
    });
    return uuid;
}

