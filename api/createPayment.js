import { randomUUID } from 'crypto';
import { apiAsUser } from './apiClient.js';
import { SUPPORT_TARIFFS, DEFAULT_SUPPORT_TARIFF, ONE_OFF_TICKET_PRICE, calcOrderTotal } from './pricing.js';

const PAYMENT_DESCRIPTIONS = {
  order:      'Оплата заказа',
  partial:    'Предоплата 50% за заказ',
  remaining:  'Доплата остатка по заказу',
  support:    'Продление технического обслуживания',
  ticket_once:'Оплата разовой заявки на доработку',
};

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://antviz.ru';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Раньше здесь проверялся Firebase ID token. Теперь браузер присылает
  // короткоживущий (5 мин) сервисный токен antviz, который получил через
  // POST /api/auth/service-token непосредственно перед вызовом оплаты —
  // мы просто передаём его дальше в наш бэкенд, который сам его проверит.
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'auth required' });

  const { orderId, type, tariff, ticketId } = req.body;
  if (!orderId) return res.status(400).json({ error: 'orderId required' });

  const paymentType = ['support', 'partial', 'remaining', 'ticket_once'].includes(type) ? type : 'order';

  let amount;
  let paymentMeta = {};
  try {
    const orderResp = await apiAsUser(`/orders/${orderId}`, token);
    if (orderResp.status === 401) return res.status(401).json({ error: 'invalid or expired auth token' });
    if (orderResp.status === 403) return res.status(403).json({ error: 'not your order' });
    if (orderResp.status === 404) return res.status(404).json({ error: 'order not found' });
    if (!orderResp.ok) return res.status(502).json({ error: 'antviz api error' });
    const order = await orderResp.json();

    if (paymentType === 'support') {
      const tariffKey = Object.prototype.hasOwnProperty.call(SUPPORT_TARIFFS, tariff) ? tariff : DEFAULT_SUPPORT_TARIFF;
      amount = SUPPORT_TARIFFS[tariffKey].price;
      paymentMeta.tariff = tariffKey;

    } else if (paymentType === 'ticket_once') {
      if (!ticketId) return res.status(400).json({ error: 'ticketId required' });
      const ticketResp = await apiAsUser(`/service-tickets/${ticketId}`, token);
      if (ticketResp.status === 403) return res.status(403).json({ error: 'not your ticket' });
      if (ticketResp.status === 404) return res.status(404).json({ error: 'ticket not found' });
      if (!ticketResp.ok) return res.status(502).json({ error: 'antviz api error' });
      const ticket = await ticketResp.json();
      if (ticket.orderId !== orderId) return res.status(400).json({ error: 'ticket/order mismatch' });
      if (ticket.paid) return res.status(400).json({ error: 'ticket already paid' });
      amount = ONE_OFF_TICKET_PRICE;
      paymentMeta.ticketId = ticketId;

    } else if (paymentType === 'partial') {
      if (order.paid) return res.status(400).json({ error: 'order already paid' });
      if (order.paidAmount > 0) return res.status(400).json({ error: 'partial payment already made, use type=remaining' });
      const total = await calcOrderTotal(order, { apiAsUser, token });
      amount = Math.ceil(total / 2);

    } else if (paymentType === 'remaining') {
      const paidAmount = order.paidAmount || 0;
      const total = await calcOrderTotal(order, { apiAsUser, token });
      amount = Math.max(0, total - paidAmount);
      if (amount === 0) return res.status(400).json({ error: 'already fully paid' });

    } else {
      if (order.paid) return res.status(400).json({ error: 'order already paid' });
      const total = await calcOrderTotal(order, { apiAsUser, token });
      const paidAmount = order.paidAmount || 0;
      amount = Math.max(0, total - paidAmount);
      if (amount === 0) return res.status(400).json({ error: 'already fully paid' });
    }
  } catch (err) {
    console.error('Не удалось посчитать сумму заказа:', err.message);
    return res.status(400).json({ error: 'could not calculate price' });
  }

  const shopId = process.env.YUKASSA_SHOP_ID;
  const secretKey = process.env.YUKASSA_SECRET_KEY;
  const baseReturnUrl = process.env.YUKASSA_RETURN_URL || 'https://antviz.ru/profile/orders';

  const returnParams = new URLSearchParams({ orderId, type: paymentType });
  if (ticketId) returnParams.set('ticketId', ticketId);
  const returnUrl = `${baseReturnUrl}${baseReturnUrl.includes('?') ? '&' : '?'}${returnParams.toString()}`;

  const idempotencyKey = randomUUID();
  const outSum = Number(amount).toFixed(2);

  const body = {
    amount: { value: outSum, currency: 'RUB' },
    confirmation: { type: 'redirect', return_url: returnUrl },
    capture: true,
    description: `${PAYMENT_DESCRIPTIONS[paymentType]} #${orderId}`,
    metadata: { orderId, type: paymentType, ...paymentMeta },
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
