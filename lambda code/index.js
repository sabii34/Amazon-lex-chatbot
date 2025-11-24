import https from "https";

export const handler = async (event) => {
  let userMessage = "Hello!";
  let aiReply = "Sorry, I couldn’t generate a reply.";

  try {
    if (event.inputTranscript) {
      userMessage = event.inputTranscript;
    } else if (event.body) {
      const parsedBody = JSON.parse(event.body);
      userMessage = parsedBody.message || userMessage;
    }
  } catch (err) {
    console.error("Error parsing event body:", err);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid JSON in request" }),
    };
  }

  // Helper function to make HTTPS POST request
  const callGroqApi = (message) => {
    const postData = JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: message }],
    });

    const options = {
      hostname: "api.groq.com",
      path: "/openai/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            resolve(json);
          } catch (parseErr) {
            reject(new Error("Failed to parse Groq API response: " + parseErr));
          }
        });
      });

      req.on("error", (e) => {
        reject(new Error("Request error: " + e.message));
      });

      req.write(postData);
      req.end();
    });
  };

  try {
    console.log("Calling Groq API with user message:", userMessage);
    const groqResponse = await callGroqApi(userMessage);
    console.log("Groq API response:", JSON.stringify(groqResponse));

    if (groqResponse.choices && groqResponse.choices[0]?.message?.content) {
      aiReply = groqResponse.choices[0].message.content;
    }
  } catch (err) {
    console.error("Groq API error:", err);
    aiReply = "Sorry, I encountered an error generating a reply.";
  }

  const intentName = event.sessionState?.intent?.name || "FallbackIntent";

  if (event.inputTranscript) {
    // Response to Lex
    const lexResponse = {
      sessionState: {
        dialogAction: { type: "Close" },
        intent: { name: intentName, state: "Fulfilled" },
      },
      messages: [
        {
          contentType: "PlainText",
          content: aiReply,
        },
      ],
    };

    console.log("Lex Response:", JSON.stringify(lexResponse, null, 2));
    return lexResponse;
  }

  // Response to API Gateway (if used)
  return {
    statusCode: 200,
    body: JSON.stringify({ reply: aiReply }),
  };
};