const express = require('express');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// 日誌中介軟體
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

app.use(express.json());

// API 路由必須放在靜態檔案之前，以確保不會被攔截
app.get('/api/generate-reviews', async (req, res) => {
    console.log("處理請求: /api/generate-reviews");
    try {
        const reviews = await generateGeminiReviews(3);
        res.json({ success: true, reviews });
    } catch (error) {
        console.error("Gemini Error:", error);
        res.status(500).json({ success: false, error: "無法生成動態評論" });
    }
});

app.get('/api/generate-single-review', async (req, res) => {
    console.log("處理請求: /api/generate-single-review");
    try {
        const reviews = await generateGeminiReviews(1);
        res.json({ success: true, review: reviews[0] });
    } catch (error) {
        console.error("Gemini Error:", error);
        res.status(500).json({ success: false, error: "無法生成新評論" });
    }
});

// 靜態檔案
app.use(express.static(path.join(__dirname, 'public')));

// 根目錄路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 初始化 Gemini API
const apiKey = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);

async function generateGeminiReviews(count) {
    if (!apiKey) {
        console.log("警告：未設定 GEMINI_API_KEY，使用預設評論。");
        return ["預設評論範本 1", "預設評論範本 2", "預設評論範本 3"].slice(0, count);
    }

    console.log(`正在請求 Gemini 生成 ${count} 則評論...`);
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const prompt = `
            你是一位剛在「德川家康按摩 (IEYASU MASSAGE)」完成服務的滿意顧客。
            這是一家專業的「運動按摩、筋膜放鬆、科學調理」專門店。
            請生成 ${count} 段完全不同風格、內容不重複的 Google Map 評論範本（每段約 50-80 字）：
            
            重點參考：
            1. 技術面：筋膜放鬆、針對酸痛點調理、科學調理。
            2. 環境面：日系風格、乾淨、放鬆、質感。
            3. 感受面：身體變輕、改善緊繃、服務細心。
            
            要求：
            - 語氣要像真實人類，可以使用一點點台灣口語（例如：真的很有感、大推、不會推銷）。
            - 每次生成的內容都要有隨機性，不要重複。
            - 請直接輸出 JSON 格式，包含一個字串陣列。
            - 不要輸出任何 Markdown 標記或解釋文字。
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        console.log("Gemini 原始回應:", text);
        const jsonString = text.replace(/```json|```/g, '').trim();
        return JSON.parse(jsonString);
    } catch (error) {
        console.error("Gemini 內部錯誤:", error);
        throw error;
    }
}

app.listen(port, () => {
    console.log(`德川家康評論助手伺服器運行中：http://localhost:${port}`);
    console.log(`API Key 是否存在: ${!!apiKey}`);
});
