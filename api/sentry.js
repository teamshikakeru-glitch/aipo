const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const token = req.query.token;
  if (!token) return res.status(400).json({ error: 'no token' });

  const options = {
    hostname: 'sentry.io',
    path: '/api/0/projects/shikakeru/javascript/issues/',
    headers: { 'Authorization': `Bearer ${token}` }
  };

  https.get(options, (r) => {
    let data = '';
    r.on('data', chunk => data += chunk);
    r.on('end', () => {
      try { res.json(JSON.parse(data)); }
      catch(e) { res.status(500).json({ error: data.slice(0,200) }); }
    });
  }).on('error', e => res.status(500).json({ error: e.message }));
};
