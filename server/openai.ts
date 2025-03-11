import OpenAI from "openai";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type SentimentAnalysisResult = {
  sentiment: 'very_positive' | 'positive' | 'neutral' | 'negative' | 'very_negative';
  score: number;
  confidence: number;
};

export async function analyzeSentiment(text: string): Promise<SentimentAnalysisResult> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are a sentiment analysis expert. Analyze the sentiment of the text and classify it exactly into one of these categories: 'very_positive', 'positive', 'neutral', 'negative', 'very_negative'. Also provide a numerical score from 0 to 4 (0 = very negative, 1 = negative, 2 = neutral, 3 = positive, 4 = very positive) and a confidence level between 0 and 1. Respond with JSON in this format: { 'sentiment': string, 'score': number, 'confidence': number }",
        },
        {
          role: "user",
          content: text,
        },
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content);

    return {
      sentiment: result.sentiment,
      score: Math.max(0, Math.min(4, Math.round(result.score))),
      confidence: Math.max(0, Math.min(1, result.confidence)),
    };
  } catch (error: any) {
    console.error("OpenAI API error:", error.message);
    // Fallback to a neutral sentiment if API call fails
    return {
      sentiment: 'neutral',
      score: 2,
      confidence: 0,
    };
  }
}
