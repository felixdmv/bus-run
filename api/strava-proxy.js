export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Extract the target path from query
  const { path, ...otherParams } = req.query;
  if (!path) {
    return res.status(400).json({ error: 'Missing path parameter' });
  }

  // Construct target URL
  const queryString = new URLSearchParams(otherParams).toString();
  const targetUrl = `https://www.strava.com/${path}${queryString ? '?' + queryString : ''}`;

  // Forward the Authorization header if present
  const headers = {};
  if (req.headers.authorization) {
    headers['Authorization'] = req.headers.authorization;
  }
  if (req.headers['content-type']) {
    headers['Content-Type'] = req.headers['content-type'];
  }

  // Prepare options
  const fetchOptions = {
    method: req.method,
    headers: headers,
  };

  if (req.method === 'POST') {
    let bodyObj = {};
    if (req.body) {
      try {
        bodyObj = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      } catch (e) {
        bodyObj = req.body;
      }
    }

    // Intercept token exchange / refresh and inject server-side credentials
    if (path === 'oauth/token') {
      if (process.env.STRAVA_CLIENT_ID) {
        bodyObj.client_id = process.env.STRAVA_CLIENT_ID;
      }
      if (process.env.STRAVA_CLIENT_SECRET) {
        bodyObj.client_secret = process.env.STRAVA_CLIENT_SECRET;
      }
    }

    fetchOptions.body = typeof bodyObj === 'string' ? bodyObj : JSON.stringify(bodyObj);
  }

  try {
    const response = await fetch(targetUrl, fetchOptions);
    const contentType = response.headers.get('content-type');
    
    let responseData;
    if (contentType && contentType.includes('application/json')) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
      try {
        responseData = JSON.parse(responseData);
      } catch (e) {
        // Keep as text if not parseable
      }
    }

    return res.status(response.status).json(responseData);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
