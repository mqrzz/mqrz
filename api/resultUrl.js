import crypto from 'crypto';

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') return res.status(405).end();

  const { OutSum, InvId, SignatureValue } = req.body;
  const pass2 = process.env.ROBO_PASS2;

  const signature = crypto
    .createHash('md5')
    .update(`${OutSum}:${InvId}:${pass2}`)
    .digest('hex')
    .toUpperCase();

  if (signature !== SignatureValue.toUpperCase()) {
    return res.status(400).send('bad sign');
  }

  // Здесь потом добавим обновление статуса заказа в Firestore
  console.log(`Оплачен заказ #${InvId} на сумму ${OutSum}`);

  return res.status(200).send('OK');
}
