const express = require('express');
const cors = require('cors');
const { FaxService } = require('popbill');

const app = express();
app.use(cors());
app.use(express.json());

// Render 환경변수에서 설정값 로드
const LinkID = process.env.POPBILL_LINK_ID;
const SecretKey = process.env.POPBILL_SECRET_KEY;
const CorpNum = process.env.POPBILL_BIZ_NUM;
const SenderNum = process.env.POPBILL_SENDER_NUM;

// 팝빌 서비스 초기화
const faxService = FaxService({
  LinkID: LinkID,
  SecretKey: SecretKey,
  IsTest: false, // 실운영 모드
  IPRestrictOnOff: false,
});

// 팩스 전송 API 엔드포인트
app.post('/send-fax', (req, res) => {
  const { receiverNum, receiverName, fileLocalPath, title } = req.body;

  if (!receiverNum || !fileLocalPath) {
    return res.status(400).json({ error: '수신 번호와 파일 경로는 필수입니다.' });
  }

  // 팩스 전송 정보 설정
  const maxRows = 1;
  const faxInfo = {
    receiverNum: receiverNum,
    receiverName: receiverName || '',
    senderNum: SenderNum,
    title: title || '팩스 전송',
  };

  // 팩스 전송 실행
  faxService.sendFax(CorpNum, faxInfo, fileLocalPath, maxRows, (error, receiptNum) => {
    if (error) {
      console.error('팩스 전송 실패:', error);
      return res.status(500).json({ error: error.message });
    }
    console.log('팩스 전송 성공! 접수번호:', receiptNum);
    res.json({ success: true, receiptNum: receiptNum });
  });
});

// 기본 루트 확인용
app.get('/', (req, res) => {
  res.send('Fax Proxy Server is Running!');
});

// 서버 포트 실행 (Render 환경에 맞춤)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
