import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  const { key } = req.query;

  if (req.method === 'GET') {
    const value = await kv.get(key);
    return res.status(200).json({ value });
  }

  if (req.method === 'POST') {
    const { key, value } = req.body;
    await kv.set(key, value);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Método não permitido' });
}
