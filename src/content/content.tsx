import React from 'react';
import ReactDOM from 'react-dom';
import { ExtensionInjector } from '../components/ExtensionInjector';

// Function to detect if we're on a Solana token page on DexScreener
const isSolanaTokenPage = (): boolean => {
  return window.location.href.includes('dexscreener.com/solana/');
};

// Function to inject our UI into the page
const injectUI = (): void => {
  if (!isSolanaTokenPage()) return;
  
  // Create container for our UI
  const container = document.createElement('div');
  container.id = 'dexchat-container';
  // Style the container as a portal root
  container.style.position = 'fixed';
  container.style.zIndex = '2147483647'; // on top
  container.style.inset = '0px'; // just acts as a root; children are positioned by FloatingVoicePanel

  // Mount to body so it floats above the page layout
  document.body.appendChild(container);
  
  // Render our React component
  ReactDOM.render(
    <React.StrictMode>
      <ExtensionInjector />
    </React.StrictMode>,
    container
  );
};

// Wait for page to be fully loaded
window.addEventListener('load', () => {
  // Small delay to ensure DexScreener's dynamic content is loaded
  setTimeout(injectUI, 1000);
});

// Also listen for URL changes (SPA navigation)
let lastUrl = window.location.href;
const observer = new MutationObserver(() => {
  if (lastUrl !== window.location.href) {
    lastUrl = window.location.href;
    // Remove existing UI if any
    const container = document.getElementById('dexchat-container');
    if (container) container.remove();
    // Re-inject UI if on a Solana token page
    setTimeout(injectUI, 1000);
  }
});

observer.observe(document, { subtree: true, childList: true });

// Message bridge for popup controls
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (!isSolanaTokenPage()) {
      sendResponse?.({ ok: false, error: 'Not on a Solana token page' });
      return;
    }
    // @ts-ignore
    const api = window.dexchatVoice;
    if (!api) {
      sendResponse?.({ ok: false, error: 'Voice API not ready yet. Try again shortly.' });
      return;
    }
    (async () => {
      switch (message.type) {
        case 'GET_VOICE_STATUS': {
          sendResponse?.({ ok: true, ...api.getStatus() });
          break;
        }
        case 'JOIN_VOICE': {
          await api.join();
          sendResponse?.({ ok: true });
          break;
        }
        case 'TOGGLE_MUTE': {
          await api.toggleMute();
          sendResponse?.({ ok: true });
          break;
        }
        case 'TOGGLE_DEAFEN': {
          await api.toggleDeafen();
          sendResponse?.({ ok: true });
          break;
        }
        case 'LEAVE_VOICE': {
          await api.leave();
          sendResponse?.({ ok: true });
          break;
        }
        default:
          sendResponse?.({ ok: false, error: 'Unknown message type' });
      }
    })().catch((err: unknown) => {
      console.error('DexChat message handling error:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      sendResponse?.({ ok: false, error: errorMessage });
    });
    return true; // keep channel open for async
  } catch (e: unknown) {
    console.error('DexChat message bridge error:', e);
    const errorMessage = e instanceof Error ? e.message : String(e);
    sendResponse?.({ ok: false, error: errorMessage });
  }
});

// Global error tracking in content script
window.addEventListener('error', (event) => {
  console.error('🔴 DexChat content error:', event.error || event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  console.error('🔴 DexChat content unhandled rejection:', event.reason);
});