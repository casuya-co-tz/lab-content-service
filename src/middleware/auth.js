function apiKeyAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  
  next();
}

function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Lab Content Service"');
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const decoded = Buffer.from(authHeader.split(' ')[1], 'base64').toString();
  const [username, password] = decoded.split(':');
  const adminUser = process.env.ADMIN_USERNAME || 'admin';
  
  if (username !== adminUser || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  next();
}

module.exports = { apiKeyAuth, adminAuth };
