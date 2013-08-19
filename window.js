document.addEventListener('DOMContentLoaded', function () {
    // Do something
    console.log("DOM Content Loaded");  
});

function ListController($scope) {
    $scope.list = [
        {friendlyName:'HOMESERVER: 1 : Windows Media Connect', make:'Microsoft', model:'Windows Media Connect'},
        {friendlyName:'HOMESERVER', make:'Hewlett Packard', model:'Windows Home Server'},
        {friendlyName:'Whole House', make:'Logitech', model:'Squeezebox Touch'},
        {friendlyName:'Living Room Camera (192.168.1.164)', make:'TOSHIBA', model:'Wireless Network Camera'},
        {friendlyName:'Logitech Media Server [Homeserver]', make:'Logitech', model:'Logitech Media Server 7.7.2 r33893'}
    ];
 
  $scope.refresh = function() {
      console.log("Refresh");
      $scope.list.push({friendlyName:'Friend Name', make:'Make', model:'Model'});
  };
 
}