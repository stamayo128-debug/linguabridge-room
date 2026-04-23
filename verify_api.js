const API_KEY = process.env.GEMINI_API_KEY;
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

async function test() {
    console.log("Testeando la API de Gemini directamente...");
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{ parts: [{ text: "Hola" }] }]
            })
        });
        
        const data = await response.json();
        console.log("Status de la respuesta:", response.status);
        console.log("Cuerpo de la respuesta:");
        console.dir(data, { depth: null });
    } catch (e) {
        console.error("Error de red:", e);
    }
}

test();
