import { apiAsWebhook } from './apiClient.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') return res.status(405).end();

  const event = req.body;
  if (!event || event.type !== 'notification') {
    return res.status(400).send('bad event type');
  }

  const incomingPayment = event.object;
  if (!incomingPayment?.id) return res.status(400).send('no payment object');

  // Телу вебхука нельзя доверять напрямую — этот эндпоинт публичный, и без
  // проверки статус платежа запрашиваем у самой ЮКассы по paymentId, это
  // единственный источник, которому можно верить (рекомендация ЮКассы).
  const shopId = process.env.YUKASSA_SHOP_ID;
  const secretKey = process.env.YUKASSA_SECRET_KEY;
  let payment;
  try {
    const verifyResp = await fetch(`https://api.yookassa.ru/v3/payments/${incomingPayment.id}`, {
      headers: { 'Authorization': 'Basic ' + Buffer.from(`${shopId}:${secretKey}`).toString('base64') },
    });
    if (!verifyResp.ok) {
      console.error(`Webhook: не удалось проверить платёж ${incomingPayment.id} в ЮКассе, статус ${verifyResp.status}`);
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

  if (!orderId) {
    console.warn(`Webhook: payment ${paymentId} без orderId в metadata`);
    return res.status(200).send('ok');
  }

  const pType = ['support', 'partial', 'remaining', 'ticket_once'].includes(paymentType) ? paymentType : 'order';

  if (payment.status === 'canceled') {
    console.log(`Webhook: payment ${paymentId} status=canceled, orderId=${orderId}, type=${pType} — заявка не тронута, оплату можно повторить`);
    return res.status(200).send('ok');
  }
  if (payment.status !== 'succeeded') {
    console.log(`Webhook: payment ${paymentId} status=${payment.status} — игнорируем`);
    return res.status(200).send('ok');
  }

  // Идемпотентность и применение результата — теперь на стороне antviz API
  // (таблица payment_events застолбит paymentId атомарно; если дубль — API
  // ответит {duplicate:true} и ничего не применит повторно).
  try {
    const applyResp = await apiAsWebhook('/payments/webhook', {
      method: 'POST',
      body: JSON.stringify({
        paymentId, orderId, ticketId: ticketId || null, type: pType,
        amount: outSum, supportTariff: tariff || null,
      }),
    });
    if (!applyResp.ok) {
      const body = await applyResp.text().catch(() => '');
      console.error(`Webhook: antviz API отклонил применение платежа ${paymentId}:`, applyResp.status, body);
      return res.status(502).send('apply failed, retry');
    }
    const result = await applyResp.json();
    if (result.duplicate) {
      console.log(`Webhook: payment ${paymentId} уже обработан ранее — пропускаем дубликат`);
    } else {
      console.log(`Webhook: payment ${paymentId} (заказ ${orderId}, тип ${pType}) применён, сумма ${outSum}₽`);
    }
  } catch (err) {
    console.error(`Webhook: не удалось применить платёж ${paymentId}:`, err.message);
    return res.status(502).send('apply failed, retry');
  }

  return res.status(200).send('ok');
}
