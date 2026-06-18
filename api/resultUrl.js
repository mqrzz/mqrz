import crypto from 'crypto';
import { db } from './firebaseAdmin.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') return res.status(405).end();

  const { OutSum, InvId, SignatureValue, Shp_orderId, Shp_type } = req.body;

  // Робокасса присылает IsTest в теле запроса для тестовых платежей —
  // по нему понимаем, каким паролем проверять подпись.
  const isTest = req.body.IsTest === '1' || req.body.IsTest === 1;
  const pass2 = isTest ? process.env.ROBO_PASS2_TEST : process.env.ROBO_PASS2;

  // Старые платежи (созданные до появления Shp_type) могли не содержать
  // этот параметр вообще — на такой случай подставляем 'order' и пробуем
  // проверить подпись в "старом" формате тоже (без Shp_type в строке).
  const paymentType = Shp_type || 'order';

  // Формула подписи для Result URL должна содержать те же Shp_*
  // параметры, что были при создании платежа, в алфавитном порядке:
  // OutSum:InvId:Password2:Shp_orderId=...:Shp_type=...
  const signatureNew = crypto
    .createHash('md5')
    .update(`${OutSum}:${InvId}:${pass2}:Shp_orderId=${Shp_orderId}:Shp_type=${paymentType}`)
    .digest('hex')
    .toUpperCase();

  // Совместимость со старыми платежами без Shp_type в подписи
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
    if (paymentType === 'support') {
      // Оплата/продление обслуживания сайта: продлеваем от текущей даты
      // окончания (если она в будущем) или от сейчас, на 30 дней.
      const orderRef = db.collection('orders').doc(Shp_orderId);
      const snap = await orderRef.get();
      const data = snap.exists ? snap.data() : {};
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
    } else {
      // Оплата самого заказа сайта. Используем поле "paid" (boolean),
      // а не "status" — поле status в этом проекте является числовым
      // (0-5) и обозначает этап работы над заказом в админке (Новая
      // заявка → ... → Готово), и управляется только вручную оттуда.
      const orderRef = db.collection('orders').doc(Shp_orderId);
      const snap = await orderRef.get();
      const data = snap.exists ? snap.data() : {};

      const updatePayload = {
        paid: true,
        paidAt: new Date().toISOString(),
        invId: InvId,
        outSum: OutSum,
      };

      // Если при оформлении заказа клиент включил опцию "Обслуживание",
      // в extras лежит 'support', и первый месяц обслуживания уже учтён
      // в сумме этого же платежа (отдельной оплаты за support не будет).
      // Поэтому сразу активируем обслуживание на 30 дней — без второго
      // перехода на Робокассу для клиента.
      if (Array.isArray(data.extras) && data.extras.includes('support')) {
        const now = new Date();
        const currentExpiry = data.supportExpiresAt?.toDate ? data.supportExpiresAt.toDate() : null;
        const base = currentExpiry && currentExpiry > now ? currentExpiry : now;
        const newExpiry = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);

        updatePayload.supportActive = true;
        updatePayload.supportStartedAt = data.supportStartedAt || new Date().toISOString();
        updatePayload.supportExpiresAt = newExpiry;
        updatePayload.supportRequested = false;
        updatePayload.expiryNotifSent = false;
      }

      await orderRef.update(updatePayload);
      console.log(`Заказ ${Shp_orderId} (InvId ${InvId}) оплачен на сумму ${OutSum}${updatePayload.supportActive ? ', обслуживание активировано до ' + updatePayload.supportExpiresAt.toISOString() : ''}`);
    }
  } catch (err) {
    // Если заказ не нашёлся или обновление не удалось — логируем,
    // но Робокассе всё равно отвечаем OK, чтобы она не повторяла запрос
    console.error(`Не удалось обновить заказ ${Shp_orderId}:`, err.message);
  }

  // Робокасса ожидает ответ строго в формате "OK{InvId}"
  return res.status(200).send(`OK${InvId}`);
}
