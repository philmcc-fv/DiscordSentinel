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
    console.log(`🔄 Starting OpenAI sentiment analysis for text: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`);
    console.log(`🔑 API key is ${process.env.OPENAI_API_KEY ? 'set' : 'NOT SET!'}`);
    
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

    console.log(`✅ OpenAI API responded successfully`);

    if (!response.choices || !response.choices.length || !response.choices[0].message.content) {
      console.error(`❌ OpenAI returned invalid response structure: ${JSON.stringify(response)}`);
      throw new Error('Invalid response structure from OpenAI');
    }

    try {
      const result = JSON.parse(response.choices[0].message.content);
      
      if (!result.sentiment || typeof result.score === 'undefined' || typeof result.confidence === 'undefined') {
        console.error(`❌ OpenAI response missing required fields: ${JSON.stringify(result)}`);
        throw new Error('OpenAI response missing required sentiment fields');
      }
      
      console.log(`✅ Parsed sentiment result: ${result.sentiment} (score: ${result.score}, confidence: ${result.confidence})`);
      
      return {
        sentiment: result.sentiment,
        score: Math.max(0, Math.min(4, Math.round(result.score))),
        confidence: Math.max(0, Math.min(1, result.confidence)),
      };
    } catch (parseError) {
      console.error(`❌ Failed to parse OpenAI response: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      console.error(`Response content was: ${response.choices[0].message.content}`);
      throw new Error(`Failed to parse OpenAI response: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }
  } catch (error: any) {
    console.error(`❌ OpenAI API error: ${error.message}`);
    
    if (error.response) {
      console.error(`❌ OpenAI API status: ${error.response.status}`);
      console.error(`❌ OpenAI API data: ${JSON.stringify(error.response.data)}`);
    }
    
    // Fallback to a neutral sentiment if API call fails, but log the error clearly
    console.error(`⚠️ Using fallback neutral sentiment due to API error`);
    return {
      sentiment: 'neutral',
      score: 2,
      confidence: 0,
    };
  }
}
