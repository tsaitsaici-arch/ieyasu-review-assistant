const express = require('express');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// 預設評論（當 API 失靈時的備案）
const fallbackReviews = [
    "今天來德川家康體驗運動按摩，師傅技術專業，針對緊繃筋膜深層放鬆，按完後身體輕鬆很多！環境乾淨舒服，非常推薦。",
    "專業的科學調理按摩，師傅很仔細說明肌肉問題，筋膜放鬆過程很有感。德川家康的服務水準真的很高，下次一定再來。",
    "環境充滿日系放鬆感，師傅手法細膩且到位。原本肩膀很卡，按完後活動度變好很多，這是我近期按過最棒的筋膜調理！",
    "非常專業的運動按摩，師傅很有耐心講解身體結構，針對痠痛點精準調理。店內氛圍很放鬆，完全不會推銷，真的很推薦！",
    "第一次來就被圈粉了！筋膜放鬆的過程雖然有點痠，但按完後全身舒暢，原本緊繃的肌肉都鬆開了。下次一定要帶家人來。"
];

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API 路由
app.get('/api/generate-reviews', async (req, res) => {
    try {
        const reviews = await generateGeminiReviews(3);
        res.json({ success: true, reviews });
    } catch (error) {
        console.error("Gemini Error, using fallbacks:", error);
        // 即使出錯也回傳預設評論，不讓前端轉圈圈
        const shuffled = fallbackReviews.sort(() => 0.5 - Math.random());
        res.json({ success: true, reviews: shuffled.slice(0, 3) });
    }
});

app.get('/api/generate-single-review', async (req, res) => {
    try {
        const reviews = await generateGeminiReviews(1);
        res.json({ success: true, review: reviews[0] });
    } catch (error) {
        const random = fallbackReviews[Math.floor(Math.random() * fallbackReviews.length)];
        res.json({ success: true, review: random });
    }
});

// 根目錄
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function generateGeminiReviews(count) {
    // 每次請求都重新讀取 env，確保抓到 Railway 的設定
    const currentApiKey = process.env.GEMINI_API_KEY;
    
    if (!currentApiKey) {
        console.warn("警告：未設定 GEMINI_API_KEY，使用預設評論。");
        return fallbackReviews.sort(() => 0.5 - Math.random()).slice(0, count);
    }

    const genAI = new GoogleGenerativeAI(currentApiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    const prompt = `
        你是一位剛在「德川家康按摩 (IEYASU MASSAGE)」完成服務的滿意顧客。
        這是一家專業的「運動按摩、筋膜放鬆、科學調理」專門店。
        請生成 ${count} 段完全不同風格、內容不重複的 Google Map 評論範本（每段約 50-80 字）：
        重點參考：1.技術面(筋膜放鬆、酸痛點調理) 2.環境面(日系風格、質感) 3.感受面(身體變輕、不會推銷)。
        要求：語氣像真實人類，使用台灣口語，輸出 JSON 字串陣列，不要有 Markdown。
    `;

    try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const jsonString = text.replace(/```json|```/g, '').trim();
        return JSON.parse(jsonString);
    } catch (error) {
        console.error("Gemini API 呼叫失敗:", error);
        throw error; // 丟出錯誤讓上層處理
    }
}

app.listen(port, () => {
    console.log(`伺服器運行中：Port ${port}`);
});
