'use strict';
const https  = require('https');
const http   = require('http');
const crypto = require('crypto');
const url    = require('url');

const LINK_ID    = process.env.POPBILL_LINK_ID    || 'FIRSTSAVEPLAN';
const SECRET_KEY = process.env.POPBILL_SECRET_KEY || 'fQtoQ6GIYvrPdmHit6O3TGEZKYYm++UwulID30FTwIc=';
const BIZ_NUM    = process.env.POPBILL_BIZ_NUM    || '4870902381';
const SENDER_NUM = process.env.POPBILL_SENDER_NUM || '05041718675';
const PORT       = process.env.PORT               || 3000;

function _isAllowedOrigin(o) {
  if (!o) return true;
  return o.includes('genspark.site') || o.includes('genspark.ai') ||
         o.includes('netlify.app')   || o.includes('onrender.com') ||
         o.startsWith('http://localhost') || o.startsWith('http://127.0.0.1');
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers['origin'] || '';
  const ao = _isAllowedOrigin(origin) ? origin : '*';
  res.setHeader('Access-Control-Allow-Origin',  ao);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const p = url.parse(req.url, true).pathname;

  if (p === '/' || p === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, service: 'SJ Fax Proxy', time: new Date().toISOString() }));
    return;
  }

  if (p === '/send-fax' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const result = await handleSendFax(JSON.parse(body || '{}'));
        res.writeHead(result.status);
        res.end(JSON.stringify(result.body));
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, message: e.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ ok: false, message: 'Not Found' }));
});

server.listen(PORT, () => console.log('✅ SJ Fax Proxy running on port ' + PORT));

async function handleSendFax(body) {
  const { receiverNum, receiverName='보험사', title='보험금 청구서', pdfBase64, senderName='SJ인베스트' } = body;
  const to = (receiverNum || '').replace(/\D/g, '');
  if (to.length < 8)  return { status:400, body:{ ok:false, message:'수신 팩스번호가 올바르지 않습니다.' } };
  if (!pdfBase64)     return { status:400, body:{ ok:false, message:'PDF 데이터가 없습니다.' } };
  try {
    const token      = await _getToken();
    const receiptNum = await _sendFax({ token, senderNum:SENDER_NUM.replace(/\D/g,''), senderName, receiverNum:to, receiverName, title, pdfBase64 });
    return { status:200, body:{ ok:true, receiptNum, message:'팩스 전송 완료 (접수번호: '+receiptNum+')' } };
  } catch(e) {
    console.error('[send-fax]', e.message);
    return { status:500, body:{ ok:false, message:e.message } };
  }
}

async function _getToken() {
  const utcTime   = new Date().toISOString().replace('T',' ').replace(/\.\d+Z$/,'');
  const nonce     = crypto.randomBytes(8).toString('hex');
  const signature = crypto.createHmac('sha1', Buffer.from(SECRET_KEY,'base64'))
                          .update(LINK_ID + utcTime + nonce, 'utf8').digest('base64');
  const auth = 'LINKHUB ' + LINK_ID + ',' + utcTime + ',' + nonce + ',' + signature;
  const text = await _get('auth.linkhub.io', '/oauth2/token?scope=190', { Authorization: auth });
  const r    = JSON.parse(text);
  if (r.code !== undefined && r.code < 0) throw new Error('링크허브 오류 ['+r.code+']: '+r.message);
  if (!r.session_token) throw new Error('session_token 없음: '+text);
  return r.session_token;
}

async function _sendFax({ token, senderNum, senderName, receiverNum, receiverName, title, pdfBase64 }) {
  const body = {
    SenderNum  : senderNum,   SenderName : senderName,
    ReceiveNum : receiverNum, ReceiveName: receiverName,
    Title      : title,       Memo       : title,
    FileNames  : ['claim.pdf'],
    FileData   : [pdfBase64],
    AdsYN      : false,       ReserveDT  : '',
  };
  console.log('[send-fax] → ReceiveNum:', receiverNum);
  const text = await _post('fax.linkhub.io', '/'+BIZ_NUM+'/FAX', { Authorization:'Bearer '+token }, body);
  console.log('[send-fax] 팝빌 응답:', text);
  const r = JSON.parse(text);
  if (r.code !== undefined && r.code !== 1) throw new Error('팝빌 오류 ['+r.code+']: '+(r.message||''));
  return r.receiptNum || r.ReceiptNum || 'OK';
}

function _get(host, path, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname:host, port:443, path, method:'GET', headers:{ Accept:'application/json', ...headers } },
      res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(d)); }
    );
    req.on('error', reject); req.end();
  });
}

function _post(host, path, headers, body) {
  return new Promise((resolve, reject) => {
    const s = JSON.stringify(body);
    const req = https.request(
      { hostname:host, port:443, path, method:'POST',
        headers:{ 'Content-Type':'application/json', 'Content-Length':Buffer.byteLength(s), ...headers } },
      res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(d)); }
    );
    req.on('error', reject); req.write(s); req.end();
  });
}
