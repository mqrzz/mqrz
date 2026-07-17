import { db, auth } from './firebaseAdmin.js';
import { SUPPORT_TARIFFS, DEFAULT_SUPPORT_TARIFF, ONE_OFF_TICKET_PRICE } from './pricing.js';

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://antviz.ru';

// Платёж считаем "тем самым, за которым пользователь вернулся с оплаты",
// только если он попал в базу недавно. Без этого окна data.paid === true
// был бы true вообще всегда для любого раз оплаченного заказа — и страница
// payment-success показывала бы "оплачено" даже тому, кто просто открыл
// её напрямую по старой ссылке или угадал orderId.
const RECENT_WINDOW_MS = 15 * 60 * 1000; // 15 минут

function toDate(v) {
  return v?.toDate ? v.toDate() : (v instanceof Date ? v : null);
}
function isRecent(date) {
  return !!date && (Date.now() - date.getTime()) < RECENT_WINDOW_MS;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) return res.status(401).json({ error: 'auth required' });

  let callerUid;
  try {
    const decoded = await auth.verifyIdToken(idToken);
    callerUid = decoded.uid;
  } catch (err) {
    return res.status(401).json({ error: 'invalid or expired auth token' });
  }

  const { orderId, type, ticketId } = req.body || {};
  if (!orderId) return res.status(400).json({ error: 'orderId required' });
  const paymentType = ['support', 'partial', 'remaining', 'ticket_once'].includes(type) ? type : 'order';

  try {
    const orderRef = db.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) return res.status(404).json({ error: 'order not found' });
    const data = orderSnap.data();
    if (data.uid !== callerUid) return res.status(403).json({ error: 'not your order' });

    if (paymentType === 'ticket_once') {
      if (!ticketId) return res.status(400).json({ error: 'ticketId required' });
      const ticketSnap = await db.collection('service_tickets').doc(ticketId).get();
      if (!ticketSnap.exists) return res.status(404).json({ error: 'ticket not found' });
      const ticket = ticketSnap.data();
      if (ticket.uid !== callerUid || ticket.orderId !== orderId) {
        return res.status(403).json({ error: 'not your ticket' });
      }
      return res.status(200).json({
        paid: !!ticket.paid,
        paymentId: ticket.yukassaPaymentId || null,
        amount: ONE_OFF_TICKET_PRICE,
        paidAt: toDate(ticket.paidAt)?.toISOString() || null,
      });
    }

    if (paymentType === 'support') {
      const lastPaymentAt = toDate(data.lastPaymentAt);
      const paid = !!data.supportActive && isRecent(lastPaymentAt);
      const tariffKey = SUPPORT_TARIFFS[data.supportTariff] ? data.supportTariff : DEFAULT_SUPPORT_TARIFF;
      return res.status(200).json({
        paid,
        paymentId: paid ? (data.yukassaPaymentId || null) : null,
        amount: SUPPORT_TARIFFS[tariffKey].price,
        paidAt: lastPaymentAt?.toISOString() || null,
      });
    }

    // order / partial / remaining — все три пишут lastPaymentAt в orderRef
    const lastPaymentAt = toDate(data.lastPaymentAt);
    const paid = isRecent(lastPaymentAt) && (
      paymentType === 'partial' ? (data.paidAmount || 0) > 0 : !!data.paid
    );
    return res.status(200).json({
      paid,
      paymentId: paid ? (data.yukassaPaymentId || null) : null,
      amount: paid ? Number(data.outSum) || data.paidAmount || null : null,
      paidAt: lastPaymentAt?.toISOString() || null,
    });

  } catch (err) {
    console.error('checkPayment: ошибка проверки статуса:', err.message);
    return res.status(500).json({ error: 'internal error' });
  }
}
