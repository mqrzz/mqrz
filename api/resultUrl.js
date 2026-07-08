import { db } from './firebaseAdmin.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') return res.status(405).end();

  const event = req.body;

  if (!event || event.type !== 'notification') {
    return res.status(400).send('bad event type');
  }

  const incomingPayment = event.object;
  if (!incomingPayment?.id) return res.status(400).send('no payment object');

  // ВАЖНО: телу вебхука нельзя доверять напрямую — этот эндпоинт публичный,
  // и без проверки подписи/источника кто угодно, зная orderId (виден в
  // ссылках/логах), мог бы прислать поддельный "succeeded" и получить заказ
  // бесплатно. Поэтому статус платежа не берём из event.object.status, а
  // запрашиваем его у самой ЮКассы по paymentId — это единственный
  // источник, которому можно верить. Рекомендация самой ЮКассы.
  const shopId    = process.env.YUKASSA_SHOP_ID;
  const secretKey = process.env.YUKASSA_SECRET_KEY;
  let payment;
  try {
    const verifyResp = await fetch(`https://api.yookassa.ru/v3/payments/${incomingPayment.id}`, {
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${shopId}:${secretKey}`).toString('base64'),
      },
    });
    if (!verifyResp.ok) {
      console.error(`Webhook: не удалось проверить платёж ${incomingPayment.id} в ЮКассе, статус ${verifyResp.status}`);
      return res.status(200).send('ok'); // ЮКасса повторит вебхук позже
    }
    payment = await verifyResp.json();
  } catch (err) {
    console.error(`Webhook: ошибка проверки платежа ${incomingPayment.id}:`, err.message);
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

  // Оплата отменена/не прошла — удаляем зависшую заявку, если по ней ещё
  // не было ни одного успешного платежа (иначе можно случайно снести живой
  // заказ, у которого просто не удалась доплата остатка).
  if (payment.status === 'canceled') {
    console.log(`Webhook: payment ${paymentId} status=canceled, orderId=${orderId}, type=${pType}`);
    if (pType === 'order' || pType === 'partial') {
      try {
        const orderRef = db.collection('orders').doc(orderId);
        const snap = await orderRef.get();
        if (snap.exists) {
          const data = snap.data();
          const neverPaid = data.status === -1 && !(data.paidAmount > 0);
          if (neverPaid) {
            await orderRef.delete();
            console.log(`Заказ ${orderId} удалён — оплата отменена/не прошла, заявка не была подтверждена`);
          }
        }
      } catch (err) {
        console.error(`Не удалось удалить неоплаченный заказ ${orderId}:`, err.message);
      }
    }
    // 'remaining' и 'support' — заказ уже существует и оплачен частично/ранее,
    // при отмене доплаты его удалять нельзя, просто ничего не делаем.
    return res.status(200).send('ok');
  }

  // Нас интересует только успешная оплата, всё остальное (pending,
  // waiting_for_capture и т.п.) — промежуточные статусы, ждём следующий вебхук
  if (payment.status !== 'succeeded') {
    console.log(`Webhook: payment ${paymentId} status=${payment.status} — игнорируем`);
    return res.status(200).send('ok');
  }

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
