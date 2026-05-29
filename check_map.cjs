const fs = require('fs');
fetch('https://api.multiviewer.app/api/v1/circuits/61/2023')
  .then(res => res.json())
  .then(data => {
    const minX = Math.min(...data.x);
    const maxX = Math.max(...data.x);
    const minY = Math.min(...data.y);
    const maxY = Math.max(...data.y);
    console.log("MultiViewer SVG Bounds:", { minX, maxX, minY, maxY });
    console.log("MultiViewer Rotation:", data.rotation);
  });
