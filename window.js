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
      
    function onDeviceFound(foundDevice) {
        var deviceList = $scope.deviceList;
        for (var i = 0; i < deviceList.length; i++) {
            var device = deviceList[i];
            if (foundDevice.location == device.location) {
                // Already in the list, ignore it
                return;
            }
        }
        // Not in the list, add it
        deviceList.push(foundDevice);
        $scope.apply();
    }  
 
}
