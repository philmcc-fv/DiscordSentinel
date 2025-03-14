/**
 * Token validation utilities for ensuring secure bot tokens
 */

/**
 * Validates a Telegram bot token format
 * 
 * @param token The token to validate
 * @returns An object with validation result
 */
export function validateTelegramToken(token: string): { 
  isValid: boolean;
  cleanedToken?: string;
  message?: string;
} {
  if (!token) {
    return {
      isValid: false,
      message: "Token is required"
    };
  }

  // First, remove any whitespace that might have been copied
  const trimmedToken = token.trim();
  
  // Check if token has the basic required format (numbers, colon, then alphanumeric)
  if (!trimmedToken.includes(':')) {
    return {
      isValid: false,
      message: "Invalid token format. Token must contain a colon separating the bot ID and secret."
    };
  }

  // Standard Telegram token format: "123456789:ABCDefgh-ijKLmnoPQRst_uvwxyz"
  // Split token by colon to validate each part separately
  const parts = trimmedToken.split(':');
  
  if (parts.length !== 2) {
    return {
      isValid: false,
      message: "Invalid token format. Token must have exactly one colon separating the bot ID and secret."
    };
  }
  
  const [botId, secret] = parts;
  
  // Bot ID should contain only numbers
  if (!/^\d+$/.test(botId)) {
    return {
      isValid: false,
      message: "Invalid token format. Bot ID part (before colon) must contain only digits."
    };
  }
  
  // Secret part should contain only allowed characters
  if (!/^[A-Za-z0-9_-]+$/.test(secret)) {
    return {
      isValid: false,
      message: "Invalid token format. Secret part (after colon) must contain only letters, numbers, hyphens, and underscores."
    };
  }

  // Check minimum lengths for each part
  if (botId.length < 8) {
    return {
      isValid: false,
      message: "Invalid token format. Bot ID part appears too short (should be at least 8 digits)."
    };
  }
  
  if (secret.length < 30) {
    return {
      isValid: false,
      message: "Invalid token format. Secret part appears too short (should be at least 30 characters)."
    };
  }
  
  // This is a cleaned token with proper format
  const cleanedToken = `${botId}:${secret}`;
  
  return {
    isValid: true,
    cleanedToken
  };
}

/**
 * Validates a Discord bot token format
 * 
 * @param token The token to validate
 * @returns An object with validation result
 */
export function validateDiscordToken(token: string): {
  isValid: boolean;
  cleanedToken?: string;
  message?: string;
} {
  if (!token) {
    return {
      isValid: false,
      message: "Token is required"
    };
  }

  // Remove whitespace
  const trimmedToken = token.trim();
  
  // Discord tokens are base64 encoded, so they should only contain these characters
  const cleanedToken = trimmedToken.replace(/[^A-Za-z0-9_.-]/g, '');
  
  if (cleanedToken !== trimmedToken) {
    return {
      isValid: false,
      message: "Token contains invalid characters. Discord tokens should only contain letters, numbers, underscores, dots, and hyphens."
    };
  }
  
  // Discord tokens should typically have dots in them
  if (!cleanedToken.includes('.')) {
    return {
      isValid: false,
      message: "Invalid token format. Discord tokens typically contain dots as separators."
    };
  }
  
  // Check token length - Discord tokens are typically long
  if (cleanedToken.length < 50) {
    return {
      isValid: false,
      message: "Token appears too short to be valid."
    };
  }
  
  return {
    isValid: true,
    cleanedToken
  };
}