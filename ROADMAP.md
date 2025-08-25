# DexChat Development Roadmap

## Milestone Checkpoints
- Floating Voice Panel v1 on DexScreener: draggable, collapsible, always-on-top with live connection/user/speaking indicators and core controls. Checkpoint status: phenomenal.

## Phase 1: Core Infrastructure ✅
- [x] Chrome extension setup
- [x] Backend server with Express
- [x] Coinbase Commerce API integration (fetch-based)
- [x] Supabase database setup
- [x] Environment variable management

## Phase 2: Payment System (Current Focus)
- [x] Remove Coinbase Commerce SDK dependency
- [x] Implement direct API calls with fetch
- [x] Backend charge creation endpoint
- [ ] Test payment flow end-to-end
- [ ] Webhook signature verification

## Phase 3: Voice Chat Integration
- [x] Agora SDK dependency resolution
- [x] Floating voice panel on DexScreener with live indicators and controls (draggable, collapsible, always-on-top)
- [ ] Configure Agora App ID and tokens
- [ ] Test voice chat functionality
- [ ] Room capacity enforcement

## Phase 4: Testing & Polish
- [ ] End-to-end payment testing
- [ ] Voice chat testing
- [ ] Extension packaging and deployment
- [ ] Error handling improvements

## Immediate Next Steps
1. Configure Agora App ID in environment variables
2. Test Coinbase Commerce payment flow
3. Build and test the extension