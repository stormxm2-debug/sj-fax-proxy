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

  const faxInfo = {
    receiverNum: receiverNum,
    receiverName: receiverName || '',
    senderNum: SenderNum,
    title: title || '팩스 전송',
  };

  faxService.sendFax(CorpNum, faxInfo, fileLocalPath, 1, (error, receiptNum) => {
    if (error) {
      console.error('팩스 전송 실패:', error);
      // 의뢰하신 부분: data.message가 없을 때 data.error(error.message)가 가도록 폴백 처리
      return res.status(500).json({ 
        success: false,
        error: error.message || '알 수 없는 전송 에러가 발생했습니다.' 
      });
    }
    console.log('팩스 전송 성공! 접수번호:', receiptNum);
    res.json({ success: true, receiptNum: receiptNum });
  });
});

// 기본 루트 확인용
app.get('/', (req, res) => {
  res.send('Fax Proxy Server is Running!');
});

// 서버 포트 실행
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
