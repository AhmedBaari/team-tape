import axios from 'axios';
import logger from '../utils/logger.js';

/**
 * Perplexity API Service
 * Handles communication with Perplexity API for AI-powered meeting summaries
 * Implements retry logic and error handling for API failures
 */
class PerplexityService {
  constructor() {
    this.apiKey = process.env.PERPLEXITY_API_KEY;
    this.model = process.env.PERPLEXITY_MODEL || 'llama-3.1-sonar-large-128k-online';
    this.baseURL = 'https://api.perplexity.ai';
    this.maxRetries = 3;
    this.retryDelay = 1000; // ms
  }

  /**
   * Validate API key is configured
   * @private
   */
  validateConfig() {
    if (!this.apiKey) {
      throw new Error(
        'PERPLEXITY_API_KEY not configured. Please set environment variable.'
      );
    }
  }

  /**
   * Generate meeting summary from transcript
   * Uses Perplexity API to analyze meeting discussion and extract insights
   * @param {string} transcript - Meeting transcript with speaker labels
   * @param {Object} participants - Participant information
   * @returns {Promise<Object>} Meeting summary object
   */
  async generateMeetingSummary(transcript, participants = []) {
    try {
      this.validateConfig();

      // Build participant context for the prompt
      const participantList = participants
        .map((p) => `- ${p.username || p.userId}`)
        .join('\n');

      // Craft detailed system prompt for meeting analysis
      const systemPrompt = `You are an expert meeting analyst. Analyze the provided meeting transcript and generate a comprehensive summary.

Meeting Participants:
${participantList}

Provide your analysis in the following JSON structure:
{
  "executiveSummary": "3-5 sentences summarizing the key discussion points",
  "keyPoints": ["list", "of", "important", "discussion", "points"],
  "actionItems": [{"task": "description", "assignee": "name or null"}, ...],
  "innovations": ["new idea 1", "new idea 2"],
  "sentiment": "positive|neutral|negative"
}

Be concise and focus on actionable insights.`;

      const userPrompt = `Please analyze this meeting transcript and provide a structured summary:

${transcript.substring(0, 8000)}`; // Limit transcript to avoid token overflow

      const response = await this.callPerplexityAPI(systemPrompt, userPrompt);

      // Parse the response
      const summary = this.parseSummaryResponse(response);
      logger.info('Successfully generated meeting summary via Perplexity API');

      return summary;
    } catch (error) {
      logger.error('Error generating meeting summary', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Call Perplexity API with retry logic
   * Implements exponential backoff for failed requests
   * @private
   * @param {string} systemPrompt - System context
   * @param {string} userPrompt - User query
   * @returns {Promise<string>} API response text
   */
  async callPerplexityAPI(systemPrompt, userPrompt) {
    let lastError;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await axios.post(
          `${this.baseURL}/chat/completions`,
          {
            model: this.model,
            messages: [
              {
                role: 'system',
                content: systemPrompt,
              },
              {
                role: 'user',
                content: userPrompt,
              },
            ],
            max_tokens: parseInt(process.env.PERPLEXITY_MAX_TOKENS || '1000'),
            temperature: 0.7,
          },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 60000, // 60 second timeout
          }
        );

        if (response.status === 200 && response.data.choices?.[0]?.message?.content) {
          return response.data.choices[0].message.content;
        } else {
          throw new Error('Invalid response format from Perplexity API');
        }
      } catch (error) {
        lastError = error;

        if (attempt < this.maxRetries) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1);
          logger.warn(
            `Perplexity API call failed (attempt ${attempt}/${this.maxRetries}). Retrying in ${delay}ms...`,
            {
              error: error.message,
              statusCode: error.response?.status,
            }
          );

          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(
      `Perplexity API failed after ${this.maxRetries} attempts: ${lastError.message}`
    );
  }

  /**
   * Parse and validate Perplexity API response
   * Extracts JSON from response and validates structure
   * @private
   * @param {string} responseText - Raw API response
   * @returns {Object} Parsed summary object
   */
  parseSummaryResponse(responseText) {
    try {
      // Try to extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const summary = JSON.parse(jsonMatch[0]);

      // Validate required fields
      if (!summary.executiveSummary) {
        throw new Error('Missing executiveSummary in response');
      }

      // Set defaults for optional fields
      return {
        executiveSummary: summary.executiveSummary || '',
        keyPoints: Array.isArray(summary.keyPoints) ? summary.keyPoints : [],
        actionItems: Array.isArray(summary.actionItems) ? summary.actionItems : [],
        innovations: Array.isArray(summary.innovations) ? summary.innovations : [],
        sentiment: summary.sentiment || 'neutral',
      };
    } catch (error) {
      logger.error('Error parsing Perplexity response', {
        error: error.message,
        responseLength: responseText.length,
      });

      // Return fallback summary if parsing fails
      return {
        executiveSummary: responseText.substring(0, 500),
        keyPoints: [],
        actionItems: [],
        innovations: [],
        sentiment: 'neutral',
      };
    }
  }

  /**
   * Extract action items from transcript
   * More aggressive action item extraction using secondary prompt
   * @param {string} transcript - Meeting transcript
   * @returns {Promise<Array>} Array of action items
   */
  async extractActionItems(transcript) {
    try {
      this.validateConfig();

      const systemPrompt =
        'You are an expert at identifying action items and tasks from meeting transcripts. Extract all specific tasks mentioned as assignments.';

      const userPrompt = `Extract action items from this transcript. For each item, identify the task and who it was assigned to. Return as JSON array:
[{"task": "description", "assignee": "name or null"}, ...]

Transcript:
${transcript.substring(0, 5000)}`;

      const response = await this.callPerplexityAPI(systemPrompt, userPrompt);

      try {
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        logger.warn('Error parsing action items response', {
          error: parseError.message,
        });
      }

      return [];
    } catch (error) {
      logger.error('Error extracting action items', {
        error: error.message,
      });
      return []; // Return empty array on failure
    }
  }

  /**
   * Check API availability and credentials
   * @returns {Promise<boolean>}
   */
  async validateApiKey() {
    try {
      this.validateConfig();

      const response = await axios.post(
        `${this.baseURL}/chat/completions`,
        {
          model: this.model,
          messages: [
            {
              role: 'user',
              content: 'Hi',
            },
          ],
          max_tokens: 10,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      return response.status === 200;
    } catch (error) {
      logger.error('API key validation failed', {
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Estimate API cost for a transcript
   * Rough estimation based on token count
   * @param {string} transcript - Transcript text
   * @returns {Object} Cost estimation
   */
  estimateCost(transcript) {
    // Very rough estimation: ~1 token per 4 characters
    const estimatedTokens = Math.ceil(transcript.length / 4);
    // Perplexity online model approximately $0.005 per 1k input tokens
    const estimatedCost = (estimatedTokens / 1000) * 0.005;

    return {
      estimatedTokens,
      estimatedCostUSD: estimatedCost,
      model: this.model,
    };
  }
}

const perplexityService = new PerplexityService();
export default perplexityService;
