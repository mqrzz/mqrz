import crypto from 'crypto';

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orderId, amount } = req.body;
  if (!orderId || !amount) return res.status(400).json({ error: 'orderId and amount required' });

  const login = process.env.ROBO_LOGIN;
  const isTest = true; // поменяй на false когда активируют магазин
  const pass1 = isTest ? process.env.ROBO_PASS1_TEST : process.env.ROBO_PASS1;

  const signature = crypto
    .createHash('md5')
    .update(`${login}:${amount}:${pass1}:${orderId}`)
    .digest('hex')
    .toUpperCase();

  const params = new URLSearchParams({
    MrchLogin: login,
    OutSum: amount,
    InvId: orderId,
    SignatureValue: signature,
    IsTest: isTest ? '1' : '0',
  });

  return res.status(200).json({
    paymentUrl: `https://auth.robokassa.ru/Merchant/Index.aspx?${params}`
  });
}
