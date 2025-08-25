// Simple background script - just calls your backend
const BACKEND_URL = 'http://localhost:3000'; // Change to your deployed URL

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CREATE_CHARGE') {
    createCharge(message.tier, message.walletAddress)
      .then(charge => sendResponse({ success: true, charge }))
      .catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        sendResponse({ success: false, error: errorMessage });
      });
    return true; // Keep message channel open for async response
  }
});

const createCharge = async (tier: string, walletAddress: string) => {
  try {
    const response = await fetch(`${BACKEND_URL}/api/create-charge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tier, walletAddress })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error creating charge:', error);
    throw error;
  }
};