import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const value = await kv.get(req.query.key);
    return res.json({ value });
  }
  if (req.method === 'POST') {
    const { key, value } = req.body;
    await kv.set(key, value);
    return res.json({ ok: true });
  }
  res.status(405).end();
}
