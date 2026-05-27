# JTM v10.6 Sub Douyin/Việt Flexible AI

## Thay đổi

1. Đổi tên tính năng:
   - `Douyin dịch Việt` -> `Sub Douyin/Việt`

2. Linh hoạt hơn cho nhận diện giọng nói/transcript:
   - Provider:
     - Auto
     - OpenAI Whisper
     - Gemini Audio
   - OpenAI transcript model:
     - whisper-1
     - gpt-4o-mini-transcribe thử nghiệm
     - gpt-4o-transcribe thử nghiệm
     - custom
   - Gemini transcript model:
     - Auto
     - gemini-2.5-flash
     - gemini-2.5-flash-lite
     - gemini-2.0-flash
     - gemini-2.0-flash-lite
     - custom

3. Web fallback:
   - Copy prompt xử lý web
   - Mở ChatGPT Web trong app
   - Mở Gemini Web trong app

## Lưu ý
Nếu API bị quota/rate-limit/503, web fallback giúp thao tác thủ công ngay trong app, không cần thoát ra ngoài trình duyệt.
