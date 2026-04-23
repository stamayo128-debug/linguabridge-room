require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function test() {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
        console.error('No GEMINI_API_KEY found in .env');
        return;
    }
    
    console.log('Key found. Initializing...');
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const text = "Hola a todos, bienvenidos a la reunión de hoy.";
    const prompt = `Translate this speech transcript accurately and naturally.

Input: "${text}"
Languages: en: English, fr: Français, de: Deutsch
Return ONLY a valid JSON object. No markdown, no explanation. Example format: {"en": "translation", "fr": "traduction", "ja": "翻訳"}`;

    try {
        console.log('Sending prompt to Gemini...');
        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        console.log('--- Raw Response ---');
        console.log(responseText);
        console.log('--------------------');
        
        const match = responseText.match(/\{[\s\S]*\}/);
        const jsonStr = match ? match[0] : responseText.replace(/```json|```/g, '').trim();
        console.log('Extracted JSON string:', jsonStr);
        
        const parsed = JSON.parse(jsonStr);
        console.log('Parsed successfully:', parsed);
    } catch (e) {
        console.error('Error during translation:', e);
    }
}

test();
