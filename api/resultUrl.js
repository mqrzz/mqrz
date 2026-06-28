import crypto from 'crypto';
import { db } from './firebaseAdmin.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') return res.status(405).end();

  const { OutSum, InvId, SignatureValue, Shp_orderId, Shp_type } = req.body;

  const isTest = req.body.IsTest === '1' || req.body.IsTest === 1;
  const pass2 = isTest ? process.env.ROBO_PASS2_TEST : process.env.ROBO_PASS2;

  const paymentType = Shp_type || 'order';

  // Проверка подписи (Shp_* в алфавитном порядке)
  const signatureNew = crypto
    .createHash('md5')
    .update(`${OutSum}:${InvId}:${pass2}:Shp_orderId=${Shp_orderId}:Shp_type=${paymentType}`)
    .digest('hex')
    .toUpperCase();

  // Совместимость со старыми платежами без Shp_type
  const signatureLegacy = crypto
    .createHash('md5')
    .update(`${OutSum}:${InvId}:${pass2}:Shp_orderId=${Shp_orderId}`)
    .digest('hex')
    .toUpperCase();

  const incoming = (SignatureValue || '').toUpperCase();
  if (incoming !== signatureNew && incoming !== signatureLegacy) {
    return res.status(400).send('bad sign');
  }

  if (!Shp_orderId) {
    console.warn(`Оплачен InvId ${InvId}, но Shp_orderId не пришёл`);
    return res.status(200).send(`OK${InvId}`);
  }

  try {
    const orderRef = db.collection('orders').doc(Shp_orderId);
    const snap = await orderRef.get();
    const data = snap.exists ? snap.data() : {};

    if (paymentType === 'support') {
      // Продление обслуживания — логика не менялась
      const now = new Date();
      const currentExpiry = data.supportExpiresAt?.toDate ? data.supportExpiresAt.toDate() : null;
      const base = currentExpiry && currentExpiry > now ? currentExpiry : now;
      const newExpiry = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);

      await orderRef.update({
        supportActive: true,
        supportStartedAt: data.supportStartedAt || new Date().toISOString(),
        supportExpiresAt: newExpiry,
        supportRequested: false,
        expiryNotifSent: false,
      });
      console.log(`Обслуживание заказа ${Shp_orderId} продлено до ${newExpiry.toISOString()}`);

    } else if (paymentType === 'partial') {
      // Первая оплата 50% — фиксируем сумму, paid остаётся false
      const paidNow = parseFloat(OutSum) || 0;
      const total = data.totalPrice || 0;
      const remaining = Math.max(0, total - paidNow);

      const updatePayload = {
        paidAmount: paidNow,
        remainingAmount: remaining,
        paidAt: new Date().toISOString(),
        invId: InvId,
        outSum: OutSum,
        // paid остаётся false — заказ не считается полностью оплаченным
      };

      await orderRef.update(updatePayload);
      console.log(`Заказ ${Shp_orderId}: предоплата ${paidNow}₽, осталось ${remaining}₽`);

    } else if (paymentType === 'remaining') {
      // Доплата — теперь заказ полностью оплачен
      const paidBefore = data.paidAmount || 0;
      const paidNow = parseFloat(OutSum) || 0;
      const totalPaid = paidBefore + paidNow;

      const updatePayload = {
        paid: true,
        paidAmount: totalPaid,
        remainingAmount: 0,
        paidAt: new Date().toISOString(),
        remainingPaidAt: new Date().toISOString(),
        invId: InvId,
        outSum: OutSum,
        // Если статус был 6 (Ожидает доплаты) — переводим в 5 (Готово)
        ...(data.status === 6 ? { status: 5, doneAt: new Date().toISOString() } : {}),
      };

      // Активируем обслуживание если было в extras
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
      console.log(`Заказ ${Shp_orderId}: доплата ${paidNow}₽, итого ${totalPaid}₽, статус → ${data.status === 6 ? 5 : data.status}`);

    } else {
      // Полная оплата ('order') — старое поведение
      const updatePayload = {
        paid: true,
        paidAmount: parseFloat(OutSum) || 0,
        remainingAmount: 0,
        paidAt: new Date().toISOString(),
        invId: InvId,
        outSum: OutSum,
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
      console.log(`Заказ ${Shp_orderId} (InvId ${InvId}) полностью оплачен на сумму ${OutSum}`);
    }
  } catch (err) {
    console.error(`Не удалось обновить заказ ${Shp_orderId}:`, err.message);
  }

  // Робокасса ожидает строго "OK{InvId}"
  return res.status(200).send(`OK${InvId}`);
}
