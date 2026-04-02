const { kv } = require('@vercel/kv');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'GET') {
    try {
      const value = await kv.get(req.query.key);
      return res.status(200).json({ value: value ?? null });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }
  if (req.method === 'POST') {
    try {
      const { key, value } = req.body;
      await kv.set(key, value);
      return res.status(200).json({ ok: true });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }
  res.status(405).end();
};
