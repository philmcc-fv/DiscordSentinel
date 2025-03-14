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

  // First, perform aggressive cleaning of the token to handle database storage issues
  // Remove all whitespace, control characters and non-printable characters
  let cleanToken = token.replace(/\s+/g, '').replace(/[^\x20-\x7E]/g, '');
  
  // Check if token has the basic required format (numbers, colon, then alphanumeric)
  if (!cleanToken.includes(':')) {
    // Try to find patterns that might suggest a corrupted token
    const numericPart = cleanToken.match(/^\d+/);
    const alphaNumericPart = cleanToken.match(/[A-Za-z0-9_-]{30,}$/);
    
    if (numericPart && alphaNumericPart && numericPart[0].length >= 8) {
      // This looks like it might be a corrupted token with parts but missing colon
      // Try to reconstruct it
      const botId = numericPart[0];
      const secret = alphaNumericPart[0];
      cleanToken = `${botId}:${secret}`;
    } else {
      return {
        isValid: false,
        message: "Invalid token format. Token must contain a colon separating the bot ID and secret."
      };
    }
  }

  // Standard Telegram token format: "123456789:ABCDefgh-ijKLmnoPQRst_uvwxyz"
  // Split token by colon to validate each part separately
  const parts = cleanToken.split(':');
  
  if (parts.length !== 2) {
    // Try to reconstruct with only the first colon if multiple exist
    const firstColonIndex = cleanToken.indexOf(':');
    const botId = cleanToken.substring(0, firstColonIndex);
    const secret = cleanToken.substring(firstColonIndex + 1).replace(/:/g, '');
    
    if (botId && secret) {
      cleanToken = `${botId}:${secret}`;
      parts[0] = botId;
      parts[1] = secret;
    } else {
      return {
        isValid: false,
        message: "Invalid token format. Token must have exactly one colon separating the bot ID and secret."
      };
    }
  }
  
  const [botId, secret] = parts;
  
  // Clean the botId to ensure it only contains numbers
  const cleanedBotId = botId.replace(/\D/g, '');
  
  if (cleanedBotId.length === 0) {
    return {
      isValid: false,
      message: "Invalid token format. Bot ID part (before colon) must contain digits."
    };
  }
  
  // Clean the secret to ensure it only contains allowed characters
  const cleanedSecret = secret.replace(/[^A-Za-z0-9_-]/g, '');
  
  if (cleanedSecret.length === 0) {
    return {
      isValid: false,
      message: "Invalid token format. Secret part (after colon) is invalid."
    };
  }

  // Check minimum lengths for each part
  if (cleanedBotId.length < 8) {
    return {
      isValid: false,
      message: "Invalid token format. Bot ID part appears too short (should be at least 8 digits)."
    };
  }
  
  if (cleanedSecret.length < 30) {
    return {
      isValid: false,
      message: "Invalid token format. Secret part appears too short (should be at least 30 characters)."
    };
  }
  
  // This is a cleaned token with proper format
  const cleanedToken = `${cleanedBotId}:${cleanedSecret}`;
  
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