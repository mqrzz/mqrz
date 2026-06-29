import { db } from './firebaseAdmin.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') return res.status(405).end();

  const event = req.body;

  if (!event || event.type !== 'notification') {
    return res.status(400).send('bad event type');
  }

  const payment = event.object;
  if (!payment) return res.status(400).send('no payment object');

  // Нас интересует только успешная оплата
  if (payment.status !== 'succeeded') {
    console.log(`Webhook: payment ${payment.id} status=${payment.status} — игнорируем`);
    return res.status(200).send('ok');
  }

  const { orderId, type: paymentType } = payment.metadata || {};
  const outSum = parseFloat(payment.amount?.value) || 0;
  const paymentId = payment.id;

  if (!orderId) {
    console.warn(`Webhook: payment ${paymentId} без orderId в metadata`);
    return res.status(200).send('ok');
  }

  const pType = ['support', 'partial', 'remaining'].includes(paymentType)
    ? paymentType
    : 'order';

  try {
    const orderRef = db.collection('orders').doc(orderId);
    const snap = await orderRef.get();
    const data = snap.exists ? snap.data() : {};

    if (pType === 'support') {
      const now = new Date();
      const currentExpiry = data.supportExpiresAt?.toDate ? data.supportExpiresAt.toDate() : null;
      const base = currentExpiry && currentExpiry > now ? currentExpiry : now;
      const newExpiry = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);
      await orderRef.update({
        supportActive: true,
        supportStartedAt: data.supportStartedAt || now.toISOString(),
        supportExpiresAt: newExpiry,
        supportRequested: false,
        expiryNotifSent: false,
      });
      console.log(`Обслуживание заказа ${orderId} продлено до ${newExpiry.toISOString()}`);

    } else if (pType === 'partial') {
      const total = data.totalPrice || 0;
      const remaining = Math.max(0, total - outSum);
      await orderRef.update({
        paidAmount: outSum,
        remainingAmount: remaining,
        paidAt: new Date().toISOString(),
        yukassaPaymentId: paymentId,
        outSum: String(outSum),
        ...(data.status === -1 ? { status: 0 } : {}),
      });
      console.log(`Заказ ${orderId}: предоплата ${outSum}₽, осталось ${remaining}₽`);

    } else if (pType === 'remaining') {
      const paidBefore = data.paidAmount || 0;
      const totalPaid = paidBefore + outSum;
      const updatePayload = {
        paid: true,
        paidAmount: totalPaid,
        remainingAmount: 0,
        paidAt: new Date().toISOString(),
        remainingPaidAt: new Date().toISOString(),
        yukassaPaymentId: paymentId,
        outSum: String(outSum),
        ...(data.status === 6 ? { status: 5, doneAt: new Date().toISOString() } : {}),
      };
      if (Array.isArray(data.extras) && data.extras.includes('support')) {
        const now = new Date();
        const newExpiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        updatePayload.supportActive = true;
        updatePayload.supportStartedAt = data.supportStartedAt || now.toISOString();
        updatePayload.supportExpiresAt = newExpiry;
        updatePayload.supportRequested = false;
        updatePayload.expiryNotifSent = false;
      }
      await orderRef.update(updatePayload);
      console.log(`Заказ ${orderId}: доплата ${outSum}₽, итого ${totalPaid}₽`);

    } else {
      const updatePayload = {
        paid: true,
        paidAmount: outSum,
        remainingAmount: 0,
        paidAt: new Date().toISOString(),
        yukassaPaymentId: paymentId,
        outSum: String(outSum),
        ...(data.status === -1 ? { status: 0 } : {}),
      };
      if (Array.isArray(data.extras) && data.extras.includes('support')) {
        const now = new Date();
        const currentExpiry = data.supportExpiresAt?.toDate ? data.supportExpiresAt.toDate() : null;
        const base = currentExpiry && currentExpiry > now ? currentExpiry : now;
        const newExpiry = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);
        updatePayload.supportActive = true;
        updatePayload.supportStartedAt = data.supportStartedAt || now.toISOString();
        updatePayload.supportExpiresAt = newExpiry;
        updatePayload.supportRequested = false;
        updatePayload.expiryNotifSent = false;
      }
      await orderRef.update(updatePayload);
      console.log(`Заказ ${orderId} (payment ${paymentId}) полностью оплачен на ${outSum}₽`);
    }
  } catch (err) {
    console.error(`Не удалось обновить заказ ${orderId}:`, err.message);
  }

  // ЮКасса ожидает статус 200
  return res.status(200).send('ok');
}
