import React from 'react';
import { VoiceChat } from './VoiceChat';
import { FloatingVoicePanel } from './FloatingVoicePanel';

export const ExtensionInjector: React.FC = () => {
  return (
    <FloatingVoicePanel title="DexChat Voice">
      <VoiceChat tier="free" />
    </FloatingVoicePanel>
  );
};