// Enhanced popup script with Discord-like UX and comprehensive error tracking
document.addEventListener('DOMContentLoaded', async () => {
    // DOM elements
    const statusDiv = document.getElementById('status');
    const statusText = document.getElementById('statusText');
    const errorDisplay = document.getElementById('errorDisplay');
    const errorText = document.getElementById('errorText');
    const voiceStatus = document.getElementById('voiceStatus');
    const roomInfo = document.getElementById('roomInfo');
    
    // Buttons and inputs
    const openDexScreenerBtn = document.getElementById('openDexScreener');
    const checkSubscriptionBtn = document.getElementById('checkSubscription');
    const upgradeAccountBtn = document.getElementById('upgradeAccount');
    const tokenInput = document.getElementById('tokenInput');
    const createRoomBtn = document.getElementById('createRoom');
    const joinRoomBtn = document.getElementById('joinRoom');
    
    // Voice controls
    const voiceIndicator = document.getElementById('voiceIndicator');
    const channelName = document.getElementById('channelName');
    const userCount = document.getElementById('userCount');
    const muteBtn = document.getElementById('muteBtn');
    const deafenBtn = document.getElementById('deafenBtn');
    const leaveVoiceBtn = document.getElementById('leaveVoiceBtn');
    
    // Room info
    const roomTitle = document.getElementById('roomTitle');
    const roomUsers = document.getElementById('roomUsers');
    const roomTier = document.getElementById('roomTier');

    // Backend URL
    const BACKEND_URL = 'https://YOUR_BACKEND_HOST';

    // State
    let currentToken = null;
    let voiceConnected = false;
    let updateInterval = null;
    let errorCount = 0;

    // Comprehensive error tracking
    const ErrorTracker = {
        log: (error, context = 'Unknown', data = {}) => {
            errorCount++;
            const errorInfo = {
                timestamp: new Date().toISOString(),
                context,
                message: error.message || error,
                stack: error.stack,
                data,
                errorCount,
                userAgent: navigator.userAgent,
                url: window.location.href
            };
            
            console.group(`🔴 DexChat Error #${errorCount} - ${context}`);
            console.error('Error:', error);
            console.table(data);
            console.trace('Stack trace');
            console.groupEnd();
            
            // Store error for potential reporting
            try {
                const errors = JSON.parse(localStorage.getItem('dexchat-errors') || '[]');
                errors.push(errorInfo);
                // Keep only last 50 errors
                if (errors.length > 50) errors.shift();
                localStorage.setItem('dexchat-errors', JSON.stringify(errors));
            } catch (e) {
                console.error('Failed to store error:', e);
            }
            
            return errorInfo;
        },
        
        display: (message, isError = true) => {
            errorText.textContent = message;
            errorDisplay.className = `error-display ${isError ? 'visible' : ''}`;
            if (isError) {
                setTimeout(() => {
                    errorDisplay.className = 'error-display';
                }, 5000);
            }
        },
        
        clear: () => {
            errorDisplay.className = 'error-display';
        }
    };

    // Safe async wrapper with error tracking
    const safeAsync = async (fn, context, ...args) => {
        try {
            return await fn(...args);
        } catch (error) {
            ErrorTracker.log(error, context, { args });
            ErrorTracker.display(`${context}: ${error.message}`);
            throw error;
        }
    };

    // Set button loading state
    const setButtonLoading = (button, loading, originalText = null) => {
        if (loading) {
            button.dataset.originalText = button.textContent;
            button.textContent = originalText || 'Loading...';
            button.classList.add('loading');
            button.disabled = true;
        } else {
            button.textContent = button.dataset.originalText || originalText || button.textContent.replace('Loading...', '').trim();
            button.classList.remove('loading');
            button.disabled = false;
        }
    };

    // Get active tab
    async function getActiveTab() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return tab;
    }

    // Extract token from URL
    function extractSolanaTokenFromUrl(url) {
        const match = url?.match(/dexscreener\.com\/solana\/([\w]+)/i);
        return match ? match[1] : null;
    }

    // Send message to content script with retry logic
    async function sendMessageToContentScript(tabId, message, maxRetries = 3, retryDelay = 1000) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                console.log(`[DexChat][Popup] Sending message attempt ${i + 1}:`, message.type);
                const response = await chrome.tabs.sendMessage(tabId, message);
                console.log(`[DexChat][Popup] Response:`, response);
                return response;
            } catch (error) {
                console.log(`[DexChat][Popup] Attempt ${i + 1} failed:`, error.message);
                
                if (i === maxRetries - 1) {
                    // On final attempt, check if content script is initializing
                    try {
                        const initResponse = await chrome.tabs.sendMessage(tabId, { type: 'CHECK_INITIALIZATION' });
                        if (initResponse?.initializing) {
                            ErrorTracker.display('Voice chat is starting up, please wait a moment...', false);
                            throw new Error('Voice chat is still initializing. Please wait a moment and try again.');
                        }
                    } catch (e) {
                        // Content script not responding at all
                    }
                    throw error;
                }
                
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, retryDelay * (i + 1)));
            }
        }
    }

    // Update voice status display
    function updateVoiceStatus(connected, token, muted = false, deafened = false, users = 0) {
        voiceConnected = connected;
        
        if (connected) {
            voiceStatus.classList.add('connected');
            channelName.textContent = `${token?.slice(0, 8)}... Chat`;
            userCount.textContent = `${users} user${users !== 1 ? 's' : ''}`;
            voiceIndicator.className = `voice-indicator ${muted ? 'muted' : ''}`;
            
            muteBtn.textContent = muted ? '🔇 Muted' : '🎤 Unmuted';
            muteBtn.className = `voice-btn ${muted ? 'active' : ''}`;
            
            deafenBtn.textContent = deafened ? '🔇 Deafened' : '🔊 Listening';
            deafenBtn.className = `voice-btn ${deafened ? 'active' : ''}`;
        } else {
            voiceStatus.classList.remove('connected');
        }
    }

    // Update room info
    function updateRoomInfo(visible, token, activeUsers = 0, tier = 'free') {
        if (visible) {
            roomInfo.classList.add('visible');
            roomTitle.textContent = `Room: ${token?.slice(0, 12)}...`;
            roomUsers.textContent = `${activeUsers} active user${activeUsers !== 1 ? 's' : ''}`;
            roomTier.textContent = `${tier} tier`;
        } else {
            roomInfo.classList.remove('visible');
        }
    }

    // Check current tab and voice status
    async function checkCurrentTab() {
        return safeAsync(async () => {
            const tab = await getActiveTab();
            const token = extractSolanaTokenFromUrl(tab?.url);
            currentToken = token;
            
            if (tab?.url && tab.url.includes('dexscreener.com/solana/') && token) {
                statusDiv.className = 'status active';
                statusText.textContent = `Active on ${token.slice(0, 8)}...`;
                
                if (tokenInput) {
                    tokenInput.value = token;
                }
                
                // Check if voice is connected by querying the content script with retry
                try {
                    const response = await sendMessageToContentScript(tab.id, { type: 'GET_VOICE_STATUS' });
                    if (response?.ok) {
                        updateVoiceStatus(response.connected, token, response.muted, response.deafened, response.userCount);
                        updateRoomInfo(true, token, response.userCount, response.tier || 'free');
                    } else {
                        updateVoiceStatus(false, token);
                        updateRoomInfo(false, token);
                    }
                } catch (e) {
                    console.log('[DexChat][Popup] Voice status check failed:', e.message);
                    // Content script might not be ready yet or voice not connected
                    updateVoiceStatus(false, token);
                    updateRoomInfo(false, token);
                }
                
                return { onDex: true, token };
            } else {
                statusDiv.className = 'status inactive';
                statusText.textContent = 'Not on DexScreener';
                updateVoiceStatus(false, null);
                updateRoomInfo(false, null);
                return { onDex: false, token: null };
            }
        }, 'checkCurrentTab');
    }

    // Start real-time updates
    function startRealTimeUpdates() {
        if (updateInterval) clearInterval(updateInterval);
        
        updateInterval = setInterval(async () => {
            try {
                await checkCurrentTab();
                
                // Get room stats if we have a token
                if (currentToken) {
                    const response = await fetch(`${BACKEND_URL}/api/rooms/${currentToken}`);
                    if (response.ok) {
                        const data = await response.json();
                        updateRoomInfo(true, currentToken, data.activeCount, 'free'); // TODO: Get actual user tier
                    }
                }
            } catch (error) {
                ErrorTracker.log(error, 'realTimeUpdate');
            }
        }, 10000); // Update every 10 seconds (was 3000)
    }

    // Navigate to token page with Discord-like feedback
    function navigateToToken(token, action = 'join') {
        return safeAsync(async () => {
            if (!token || token.length < 3) {
                throw new Error('Please enter a valid Solana token address.');
            }
            
            const url = `https://dexscreener.com/solana/${token}`;
            
            // Create tab and wait a moment for injection
            const tab = await chrome.tabs.create({ url });
            
            // Update UI immediately to show we're joining
            statusDiv.className = 'status active';
            statusText.textContent = `${action === 'create' ? 'Creating' : 'Joining'} ${token.slice(0, 8)}...`;
            
            // Don't close popup - let user see the status
            ErrorTracker.display(`${action === 'create' ? 'Creating' : 'Joining'} room for ${token.slice(0, 8)}...`, false);
            
            // Start monitoring for voice connection
            setTimeout(() => {
                checkCurrentTab();
            }, 2000);
            
        }, 'navigateToToken', token, action);
    }

    // Check subscription with detailed feedback
    async function checkUserSubscription() {
        setButtonLoading(checkSubscriptionBtn, true);
        
        return safeAsync(async () => {
            const walletAddress = localStorage.getItem('dexchat-wallet');
            if (!walletAddress) {
                throw new Error('Please connect your wallet first by visiting a DexScreener token page.');
            }

            const response = await fetch(`${BACKEND_URL}/api/user/${walletAddress}/subscription`);
            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.hasSubscription) {
                ErrorTracker.display(`✅ ${data.tier} tier active (${data.paymentStatus})`, false);
            } else {
                ErrorTracker.display('❌ No subscription found. Upgrade to access premium features!', false);
            }
        }, 'checkUserSubscription');
    }

    // New: CTA upgrade button
    const upgradeCtaBtn = document.getElementById('upgradeCtaBtn');

    // Voice control handlers with retry logic
    muteBtn.addEventListener('click', async () => {
        try {
            const tab = await getActiveTab();
            if (tab?.id) {
                await sendMessageToContentScript(tab.id, { type: 'TOGGLE_MUTE' });
                setTimeout(() => checkCurrentTab(), 500); // Refresh status after a short delay
            }
        } catch (error) {
            ErrorTracker.log(error, 'toggleMute');
            ErrorTracker.display('Failed to toggle mute. Make sure you\'re in a voice chat.');
        }
    });

    deafenBtn.addEventListener('click', async () => {
        try {
            const tab = await getActiveTab();
            if (tab?.id) {
                await sendMessageToContentScript(tab.id, { type: 'TOGGLE_DEAFEN' });
                setTimeout(() => checkCurrentTab(), 500); // Refresh status after a short delay
            }
        } catch (error) {
            ErrorTracker.log(error, 'toggleDeafen');
            ErrorTracker.display('Failed to toggle deafen. Make sure you\'re in a voice chat.');
        }
    });

    leaveVoiceBtn.addEventListener('click', async () => {
        try {
            const tab = await getActiveTab();
            if (tab?.id) {
                await sendMessageToContentScript(tab.id, { type: 'LEAVE_VOICE' });
                updateVoiceStatus(false, null);
                updateRoomInfo(false, null);
            }
        } catch (error) {
            ErrorTracker.log(error, 'leaveVoice');
            ErrorTracker.display('Failed to leave voice chat.');
        }
    });

    // Button event listeners
    openDexScreenerBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://dexscreener.com/solana' });
        // Don't close popup
    });

    checkSubscriptionBtn.addEventListener('click', async () => {
        try {
            await checkUserSubscription();
        } finally {
            setButtonLoading(checkSubscriptionBtn, false);
        }
    });

    upgradeAccountBtn.addEventListener('click', () => upgradeAccount(upgradeAccountBtn));
    if (upgradeCtaBtn) {
        upgradeCtaBtn.addEventListener('click', () => upgradeAccount(upgradeCtaBtn));
    }

    createRoomBtn.addEventListener('click', async () => {
        setButtonLoading(createRoomBtn, true, 'Creating...');
        try {
            const { onDex, token } = await checkCurrentTab();
            if (onDex && token) {
                ErrorTracker.display(`✅ Room active for ${token.slice(0, 8)}... Anyone on this page can join!`, false);
            } else {
                const input = tokenInput?.value?.trim();
                if (!input) {
                    throw new Error('Enter a Solana token address to create a room.');
                }
                await navigateToToken(input, 'create');
            }
        } finally {
            setButtonLoading(createRoomBtn, false);
        }
    });

    joinRoomBtn.addEventListener('click', async () => {
        setButtonLoading(joinRoomBtn, true, 'Joining...');
        try {
            const { onDex, token } = await checkCurrentTab();
            if (onDex && token) {
                ErrorTracker.display(`🔊 Joining voice chat for ${token.slice(0, 8)}...`, false);
                // Trigger voice join in content script
                const tab = await getActiveTab();
                if (tab?.id) {
                    await sendMessageToContentScript(tab.id, { type: 'JOIN_VOICE' });
                    setTimeout(() => checkCurrentTab(), 1000); // Refresh status after join
                }
            } else {
                const input = tokenInput?.value?.trim();
                if (!input) {
                    throw new Error('Enter a Solana token address to join its room.');
                }
                await navigateToToken(input, 'join');
            }
        } finally {
            setButtonLoading(joinRoomBtn, false);
        }
    });

    // Initialize
    ErrorTracker.clear();
    await checkCurrentTab();
    startRealTimeUpdates();

    // Log successful popup initialization
    console.log('[DexChat][Popup] Popup initialized successfully');
});

window.addEventListener('error', (event) => {
    console.error('🔴 DexChat popup error:', event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('🔴 Unhandled promise rejection in popup:', event.reason);
});


// Upgrade account with progress feedback
async function upgradeAccount(button = upgradeAccountBtn) {
    setButtonLoading(button, true);
    
    return safeAsync(async () => {
        const walletAddress = localStorage.getItem('dexchat-wallet');
        if (!walletAddress) {
            throw new Error('Please connect your wallet first by visiting a DexScreener token page.');
        }
    
        // Use tier from selected radio; default to basic
        const selectedTier = /** @type {HTMLInputElement|null} */(document.querySelector('input[name="tier"]:checked'));
        const tier = selectedTier?.value || 'basic';
    
        chrome.runtime.sendMessage(
            { type: 'CREATE_CHARGE', tier, walletAddress },
            (response) => {
                setButtonLoading(button, false);
    
                if (response?.success) {
                    chrome.tabs.create({ url: response.charge.hostedUrl });
                    ErrorTracker.display(`✅ Payment page opened! Complete your ${tier} tier purchase.`, false);
                } else {
                    throw new Error(response?.error || 'Failed to create charge');
                }
            }
        );
    }, 'upgradeAccount');
}