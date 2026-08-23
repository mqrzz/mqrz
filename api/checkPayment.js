import { apiAsUser } from './apiClient.js';

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://antviz.ru';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'auth required' });

  const { orderId, type, ticketId } = req.body || {};
  if (!orderId) return res.status(400).json({ error: 'orderId required' });

  try {
    const resp = await apiAsUser('/payments/check', token, {
      method: 'POST',
      body: JSON.stringify({ orderId, type, ticketId }),
    });
    if (resp.status === 401) return res.status(401).json({ error: 'invalid or expired auth token' });
    if (resp.status === 403) return res.status(403).json({ error: 'not your order' });
    if (resp.status === 404) return res.status(404).json({ error: 'order not found' });
    if (!resp.ok) return res.status(502).json({ error: 'antviz api error' });

    const data = await resp.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error('checkPayment: ошибка проверки статуса:', err.message);
    return res.status(500).json({ error: 'internal error' });
  }
}
