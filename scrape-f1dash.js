fetch('https://app.formula1dashboard.com')
  .then(r => r.text())
  .then(text => {
    const jsFiles = [...text.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1]);
    console.log("JS files:", jsFiles);
    
    // Fetch the first main JS file to find API endpoints
    const mainJs = jsFiles.find(f => f.includes('main') || f.includes('app') || f.includes('_app'));
    if (mainJs) {
      const fullUrl = mainJs.startsWith('http') ? mainJs : `https://app.formula1dashboard.com${mainJs.startsWith('/') ? '' : '/'}${mainJs}`;
      console.log("Fetching", fullUrl);
      return fetch(fullUrl).then(r => r.text());
    }
  })
  .then(jsText => {
    if (!jsText) return;
    const urls = [...jsText.matchAll(/https?:\/\/[a-zA-Z0-9.-]+/g)].map(m => m[0]);
    const uniqueUrls = [...new Set(urls)];
    console.log("Found URLs in JS:");
    uniqueUrls.forEach(u => console.log(u));
  });
