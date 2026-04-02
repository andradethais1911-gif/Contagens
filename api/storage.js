import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const value = await redis.get(req.query.key);
    return res.json({ value });
  }
  if (req.method === 'POST') {
    const { key, value } = req.body;
    await redis.set(key, value);
    return res.json({ ok: true });
  }
  res.status(405).end();
}
