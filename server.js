const express = require('express');
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

const USED_REVIEWS_PATH = path.join(__dirname, 'used-reviews.json');
const EXPIRE_DAYS = 180;

// 預設評論（當 API 失靈時的備案）
const fallbackReviews = [
    "今天來德川家康體驗運動按摩，師傅技術專業，針對緊繃筋膜深層放鬆，按完後身體輕鬆很多！環境乾淨舒服，非常推薦。",
    "專業的科學調理按摩，師傅很仔細說明肌肉問題，筋膜放鬆過程很有感。德川家康的服務水準真的很高，下次一定再來。",
    "環境充滿日系放鬆感，師傅手法細膩且到位。原本肩膀很卡，按完後活動度變好很多，這是我近期按過最棒的筋膜調理！",
    "非常專業的運動按摩，師傅很有耐心講解身體結構，針對痠痛點精準調理。店內氛圍很放鬆，完全不會推銷，真的很推薦！",
    "第一次來就被圈粉了！筋膜放鬆的過程雖然有點痠，但按完後全身舒暢，原本緊繃的肌肉都鬆開了。下次一定要帶家人來。"
];

// 讀取已使用評論（自動過濾 180 天以上的）
function loadUsedReviews() {
    if (!fs.existsSync(USED_REVIEWS_PATH)) return [];
    try {
        const data = JSON.parse(fs.readFileSync(USED_REVIEWS_PATH, 'utf-8'));
        const cutoff = Date.now() - EXPIRE_DAYS * 24 * 60 * 60 * 1000;
        return data.filter(r => r.usedAt > cutoff);
    } catch {
        return [];
    }
}

// 儲存已使用評論（同時寫入並清除過期）
function saveUsedReview(text) {
    const existing = loadUsedReviews();
    // 避免重複記錄
    if (existing.some(r => r.text === text)) return;
    existing.push({ text, usedAt: Date.now() });
    fs.writeFileSync(USED_REVIEWS_PATH, JSON.stringify(existing, null, 2), 'utf-8');
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 標記評論已使用
app.post('/api/mark-used', (req, res) => {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
        return res.status(400).json({ success: false });
    }
    saveUsedReview(text.trim());
    res.json({ success: true });
});

// API 路由
app.get('/api/generate-reviews', async (req, res) => {
    try {
        const reviews = await generateGeminiReviews(3);
        res.json({ success: true, reviews });
    } catch (error) {
        console.error("Gemini Error, using fallbacks:", error);
        const used = loadUsedReviews().map(r => r.text);
        const available = fallbackReviews.filter(r => !used.includes(r));
        const pool = available.length >= 3 ? available : fallbackReviews;
        const shuffled = pool.sort(() => 0.5 - Math.random());
        res.json({ success: true, reviews: shuffled.slice(0, 3) });
    }
});

app.get('/api/generate-single-review', async (req, res) => {
    try {
        const reviews = await generateGeminiReviews(1);
        res.json({ success: true, review: reviews[0] });
    } catch (error) {
        const used = loadUsedReviews().map(r => r.text);
        const available = fallbackReviews.filter(r => !used.includes(r));
        const pool = available.length > 0 ? available : fallbackReviews;
        const random = pool[Math.floor(Math.random() * pool.length)];
        res.json({ success: true, review: random });
    }
});

// 根目錄
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function generateGeminiReviews(count) {
    const currentApiKey = (process.env.GEMINI_API_KEY || '').replace(/["\s]/g, '').split('\n')[0] || null;

    if (!currentApiKey) {
        console.warn("警告：未設定 GEMINI_API_KEY，使用預設評論。");
        const used = loadUsedReviews().map(r => r.text);
        const available = fallbackReviews.filter(r => !used.includes(r));
        const pool = available.length >= count ? available : fallbackReviews;
        return pool.sort(() => 0.5 - Math.random()).slice(0, count);
    }

    const usedReviews = loadUsedReviews().map(r => r.text);
    const avoidSection = usedReviews.length > 0
        ? `\n以下是已被使用過的評論，請勿生成相同或高度相似的內容：\n${usedReviews.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
        : '';

    const genAI = new GoogleGenerativeAI(currentApiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `
你是一位剛在「德川家康按摩（IEYASU MASSAGE）」完成服務的真實顧客。這是桃園/中壢/楊梅的專業「運動按摩・筋膜放鬆・科學調理」專門店，Google 評分 4.9 星。你的按摩體驗非常好，想自然地分享心得。

背景知識（不要直接複製，用來理解品牌調性）：
- 手法：結合經絡推拿 + 運動按摩 + 筋膜放鬆，獨創整体指壓法
- 師傅特色：每位師傅都有一定水準，「不指定師傅也不會踩雷」
- 環境：日系簡約風格、乾淨明亮
- 服務態度：會先詢問身體狀況、解釋痠痛原因、給居家保養建議

生成要求：
- 每則 50–80 字
- 每則風格、用詞、切入角度完全不同
- 不要出現「推薦」「五星」「大推」等刷評感重的詞

三大面向（每則只需涵蓋 1-2 個，不要三個都塞）：
- 技術面 — 痠痛點精準、筋膜放鬆有感、手法有深度不是亂按、會針對問題處理
- 環境面 — 日系風格舒服、空間乾淨、不像傳統按摩店那種感覺
- 體感面 — 做完身體變輕、睡眠品質變好、不會硬推銷加購、師傅會教你怎麼自己保養

關鍵字自然植入（不要硬塞，挑 1-2 個融入）：
中壢按摩 / 桃園按摩 / 楊梅按摩 / 運動按摩 / 筋膜放鬆 / 德川家康

語氣規則：
- 台灣口語，像在跟朋友聊天
- 可以有「欸」「真的」「超」「蠻」等口語詞
- 長短句交錯，不要每句都一樣結構
- 偶爾可以用「...」或「！」但不要每則都有

請生成 ${count} 則評論。
輸出格式：JSON 字串陣列，不含 Markdown，範例：["評論1", "評論2"]${avoidSection}
    `;

    try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const jsonString = text.replace(/```json|```/g, '').trim();
        return JSON.parse(jsonString);
    } catch (error) {
        console.error("Gemini API 呼叫失敗:", error);
        throw error;
    }
}

app.listen(port, () => {
    console.log(`伺服器運行中：Port ${port}`);
});
