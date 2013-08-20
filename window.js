document.addEventListener('DOMContentLoaded', function () {
    // Do something
    console.log("DOM Content Loaded");  
});

var g_deviceList = [ ];

function ListController($scope) {
    $scope.deviceList = g_deviceList;
 
  $scope.refresh = function() {
      console.log("Refresh");
      ssdpSearch(onDeviceFound);
  };
 
}

function onDeviceFound(foundDevice) {
    for (var i = 0; i < g_deviceList.length; i++) {
        var device = g_deviceList[i];
        if (foundDevice.location == device.location) {
            // Already in the list, ignore it
            return;
        }
    }
    // Not in the list, add it
    $scope.deviceList.push(foundDevice);
}