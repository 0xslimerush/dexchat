// Solana wallet interface
interface SolanaWallet {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  publicKey: {
    toString: () => string;
  };
}

declare global {
  interface Window {
    solana?: SolanaWallet;
    dexchatVoice?: {
      getStatus: () => {
        connected: boolean;
        muted: boolean;
        deafened: boolean;
        userCount: number;
        tier?: string;
      };
      join: () => Promise<void>;
      toggleMute: () => Promise<void>;
      toggleDeafen: () => Promise<void>;
      leave: () => Promise<void>;
    };
  }
}

export {};