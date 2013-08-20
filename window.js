document.addEventListener('DOMContentLoaded', function () {
    // Do something
    console.log("DOM Content Loaded");  
});

function ListController($scope) {
    $scope.deviceList = [ ];
 
  $scope.refresh = function() {
      console.log("Refresh");
      ssdpSearch(onDeviceFound);
  };
 
}

function onDeviceFound(foundDevice) {
    for (var i = 0; i < $scope.deviceList.length; i++) {
        var device = $scope.deviceList[i];
        if (foundDevice.location == device.location) {
            // Already in the list, ignore it
            return;
        }
    }
    // Not in the list, add it
    $scope.deviceList.push(foundDevice);
}