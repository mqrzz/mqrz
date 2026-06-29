import { db } from './firebaseAdmin.js';

const TIER_PRICES = {
  'Старт':   3900,
  'Рост':    9900,
  'Масштаб': 19900,
};
const EXTRA_PRICES = { domain: 650, support: 500, content: 2000, shop: 4900 };
const SUPPORT_RENEWAL_PRICE = 500;

async function calcOrderTotal(order) {
  const base = TIER_PRICES[order.package];
  if (base == null) throw new Error(`unknown package: ${order.package}`);

  let running = base;
  const extras = Array.isArray(order.extras) ? order.extras : [];
  for (const key of ['domain', 'support', 'content', 'shop']) {
    if (extras.includes(key)) running += EXTRA_PRICES[key];
  }
  if (extras.includes('urgent')) {
    running += Math.round(running * 0.3);
  }

  let discount = 0;
  if (order.promoCode) {
    const snap = await db.collection('promoCodes')
      .where('code', '==', order.promoCode)
      .where('active', '==', true)
      .limit(1)
      .get();
    if (!snap.empty) {
      const p = snap.docs[0].data();
      const expired = p.expiresAt?.toDate ? p.expiresAt.toDate() < new Date() : false;
      const wrongUser = p.forUid && p.forUid !== order.uid;
      if (!expired && !wrongUser) {
        discount = p.discountType === 'percent'
          ? Math.round(running * p.discountValue / 100)
          : Math.min(p.discountValue, running);
      }
    }
  }

  return Math.max(0, running - discount);
}

const PAYMENT_DESCRIPTIONS = {
  order:     'Оплата заказа',
  partial:   'Предоплата 50% за заказ',
  remaining: 'Доплата остатка по заказу',
  support:   'Продление технического обслуживания',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orderId, type } = req.body;
  if (!orderId) return res.status(400).json({ error: 'orderId required' });

  const paymentType = ['support', 'partial', 'remaining'].includes(type) ? type : 'order';

  let amount;
  try {
    const orderRef = db.collection('orders').doc(orderId);
    const snap = await orderRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'order not found' });
    const data = snap.data();

    if (paymentType === 'support') {
      amount = SUPPORT_RENEWAL_PRICE;
    } else if (paymentType === 'partial') {
      if (data.paid) return res.status(400).json({ error: 'order already paid' });
      const total = await calcOrderTotal(data);
      amount = Math.ceil(total / 2);
    } else if (paymentType === 'remaining') {
      const paidAmount = data.paidAmount || 0;
      const total = await calcOrderTotal(data);
      amount = Math.max(0, total - paidAmount);
      if (amount === 0) return res.status(400).json({ error: 'already fully paid' });
    } else {
      if (data.paid) return res.status(400).json({ error: 'order already paid' });
      amount = await calcOrderTotal(data);
    }
  } catch (err) {
    console.error('Не удалось посчитать сумму заказа:', err.message);
    return res.status(400).json({ error: 'could not calculate price' });
  }

  const shopId    = process.env.YUKASSA_SHOP_ID;
  const secretKey = process.env.YUKASSA_SECRET_KEY;
  const returnUrl = process.env.YUKASSA_RETURN_URL || 'https://mqrz.ru/profile/orders';

  const idempotencyKey = `${orderId}-${paymentType}-${Date.now()}`;
  const outSum = Number(amount).toFixed(2);

  const body = {
    amount: { value: outSum, currency: 'RUB' },
    confirmation: { type: 'redirect', return_url: returnUrl },
    capture: true,
    test: true,
    description: `${PAYMENT_DESCRIPTIONS[paymentType]} #${orderId}`,
    metadata: { orderId, type: paymentType },
  };

  try {
    const response = await fetch('https://api.yookassa.ru/v3/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotence-Key': idempotencyKey,
        'Authorization': 'Basic ' + Buffer.from(`${shopId}:${secretKey}`).toString('base64'),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('ЮКасса API error:', response.status, err);
      return res.status(502).json({ error: 'payment provider error' });
    }

    const payment = await response.json();
    const paymentUrl = payment.confirmation?.confirmation_url;

    if (!paymentUrl) {
      console.error('ЮКасса не вернула confirmation_url:', payment);
      return res.status(502).json({ error: 'no confirmation url' });
    }

    return res.status(200).json({ paymentUrl, amount, paymentId: payment.id });

  } catch (err) {
    console.error('Ошибка запроса к ЮКасса:', err.message);
    return res.status(502).json({ error: 'payment provider unavailable' });
  }
}
