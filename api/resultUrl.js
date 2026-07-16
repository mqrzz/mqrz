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
  // источник, которому можно верить. Рекомендация самой ЮКассы
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
      // ВАЖНО: раньше здесь возвращался 200, а комментарий утверждал, что "ЮКасса
      // повторит вебхук позже" — но ЮКасса повторяет доставку только если НЕ получила
      // 200. Ответ 200 при непройденной проверке означал "успешно обработано", и
      // вебхук больше не приходил — платёж мог остаться незасчитанным навсегда при
      // временном сбое сети/ЮКассы. Возвращаем ошибку, чтобы вызвать повтор.
      return res.status(502).send('verify failed, retry');
    }
    payment = await verifyResp.json();
  } catch (err) {
    console.error(`Webhook: ошибка проверки платежа ${incomingPayment.id}:`, err.message);
    return res.status(502).send('verify failed, retry');
  }

  const { orderId, type: paymentType, tariff, ticketId } = payment.metadata || {};
  const outSum = parseFloat(payment.amount?.value) || 0;
  const paymentId = payment.id;

  // Тариф обслуживания кладётся в metadata самим createPayment.js на
  // сервере (не из тела клиентского запроса), так что доверяем ему — но
  // на случай платежей, оформленных до появления этого поля, откатываемся
  // на 'basic', а не пишем в заказ что попало.
  const SUPPORT_TARIFF_KEYS = ['basic', 'priority'];
  const supportTariffKey = SUPPORT_TARIFF_KEYS.includes(tariff) ? tariff : 'basic';

  if (!orderId) {
    console.warn(`Webhook: payment ${paymentId} без orderId в metadata`);
    return res.status(200).send('ok');
  }

  const pType = ['support', 'partial', 'remaining', 'ticket_once'].includes(paymentType)
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
    } else if (pType === 'ticket_once' && ticketId) {
      // Разовая заявка создаётся клиентом сразу в awaiting_payment/paid:false —
      // если оплата отменена/не прошла, зависший неоплаченный тикет нужно
      // убрать, иначе он остаётся в базе, никогда не станет open и просто
      // молча потеряется для клиента.
      try {
        const ticketRef = db.collection('service_tickets').doc(ticketId);
        const ticketSnap = await ticketRef.get();
        if (ticketSnap.exists && ticketSnap.data().paid !== true) {
          await ticketRef.delete();
          console.log(`Разовая заявка ${ticketId} удалена — оплата отменена/не прошла`);
        }
      } catch (err) {
        console.error(`Не удалось удалить неоплаченную заявку ${ticketId}:`, err.message);
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

  // ИДЕМПОТЕНТНОСТЬ: ЮКасса может продублировать доставку одного и того же
  // вебхука (сетевые ретраи с их стороны, таймаут ответа и т.п. — это
  // нормально и прямо предусмотрено их API). Раньше повторная доставка
  // 'partial'/'remaining' приводила бы к повторному прибавлению уже учтённой
  // суммы (paidBefore + outSum) — деньги задваивались бы в базе, хотя
  // реально оплата была одна. Продление поддержки страдало бы так же
  // (лишние +30 дней). Атомарно "застолбим" paymentId отдельным документом:
  // если он уже существует — это точно дубликат, второй раз ничего не
  // применяем.
  const claimRef = db.collection('processedPayments').doc(paymentId);
  try {
    await claimRef.create({ orderId, type: pType, outSum, processedAt: new Date() });
  } catch (err) {
    const alreadyExists = err.code === 6 || /already exists/i.test(err.message || '');
    if (alreadyExists) {
      console.log(`Webhook: payment ${paymentId} уже обработан ранее — пропускаем дубликат`);
      return res.status(200).send('ok');
    }
    console.error(`Webhook: не удалось создать метку идемпотентности для ${paymentId}:`, err.message);
    return res.status(502).send('idempotency claim failed, retry');
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
        supportStartedAt: data.supportStartedAt || now,
        supportExpiresAt: newExpiry,
        supportTariff: supportTariffKey,
        supportRequested: false,
        expiryNotifSent: false,
        yukassaPaymentId: paymentId,
      });
      console.log(`Обслуживание заказа ${orderId} продлено до ${newExpiry.toISOString()} (тариф ${supportTariffKey})`);

    } else if (pType === 'ticket_once') {
      if (!ticketId) {
        console.warn(`Webhook: payment ${paymentId} type=ticket_once без ticketId в metadata`);
      } else {
        const ticketRef = db.collection('service_tickets').doc(ticketId);
        await ticketRef.update({
          paid: true,
          status: 'open',
          paidAt: new Date(),
          yukassaPaymentId: paymentId,
        });
        console.log(`Разовая заявка ${ticketId} оплачена (${outSum}₽) и переведена в open`);
      }
      // Разовая правка — это отдельный платёж 350₽ за конкретный тикет,
      // а не часть суммы заказа: заказ (paid/paidAmount и т.п.) здесь
      // намеренно не трогаем, иначе оплата тикета задваивалась бы в
      // финансах заказа, как это было бы через ветку 'order' ниже.

    } else if (pType === 'partial') {
      const total = data.totalPrice || 0;
      const remaining = Math.max(0, total - outSum);
      await orderRef.update({
        paidAmount: outSum,
        remainingAmount: remaining,
        paidAt: new Date(),
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
        paidAt: new Date(),
        remainingPaidAt: new Date(),
        yukassaPaymentId: paymentId,
        outSum: String(outSum),
        ...(data.status === 6 ? { status: 5, doneAt: new Date() } : {}),
      };
      if (Array.isArray(data.extras) && data.extras.includes('support')) {
        const now = new Date();
        const newExpiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        updatePayload.supportActive = true;
        updatePayload.supportStartedAt = data.supportStartedAt || now;
        updatePayload.supportExpiresAt = newExpiry;
        // extras.support — это фиксированная доплата 500₽ при оформлении
        // заказа (EXTRA_PRICES.support), а не выбор тарифа из SUPPORT_TARIFFS,
        // так что это всегда 'basic', а не то, что случайно окажется в
        // supportTariffKey из metadata другого платежа.
        updatePayload.supportTariff = 'basic';
        updatePayload.supportRequested = false;
        updatePayload.expiryNotifSent = false;
      }
      await orderRef.update(updatePayload);
      console.log(`Заказ ${orderId}: доплата ${outSum}₽, итого ${totalPaid}₽`);

    } else {
      const updatePayload = {
        paid: true,
        paidAmount: (data.paidAmount || 0) + outSum,
        remainingAmount: 0,
        paidAt: new Date(),
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
        updatePayload.supportStartedAt = data.supportStartedAt || now;
        updatePayload.supportExpiresAt = newExpiry;
        updatePayload.supportTariff = 'basic'; // extras.support = фикс. 500₽, не выбор тарифа
        updatePayload.supportRequested = false;
        updatePayload.expiryNotifSent = false;
      }
      await orderRef.update(updatePayload);
      console.log(`Заказ ${orderId} (payment ${paymentId}) полностью оплачен на ${outSum}₽`);
    }
  } catch (err) {
    console.error(`Не удалось обновить заказ ${orderId}:`, err.message);
    // Раньше здесь всё равно возвращался 200 — ЮКасса считала вебхук
    // доставленным, а заказ в базе оставался необновлённым (не отмечен
    // оплаченным). Возвращаем ошибку, чтобы получить повтор вебхука.
    return res.status(502).send('order update failed, retry');
  }

  // ЮКасса ожидает статус 200
  return res.status(200).send('ok');
}
