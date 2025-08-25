# DexChat - Chrome Extension for DexScreener

## Project Goal
A Chrome extension that adds voice and text chat functionality to DexScreener pages, with tiered access controlled by Coinbase Commerce payments.

## Core Features
1. **Voice Chat** - Real-time voice communication using Agora SDK
2. **Tiered Access** - Basic (150 USDC, 100 users) vs Premium (500 USDC, 10k users)
3. **Wallet Authentication** - Web3 wallet connection for user identity
4. **Payment Processing** - Coinbase Commerce integration for tier upgrades
5. **Room Management** - Automatic room creation based on DexScreener token pages

## Architecture
- **Frontend**: Chrome Extension (React + TypeScript)
- **Backend**: Express.js server for payments and webhooks
- **Database**: Supabase for user data and payment tracking
- **Payment**: Coinbase Commerce API (direct fetch calls, no SDK)
- **Voice**: Agora RTC SDK for real-time audio

## Current Status
✅ Basic extension structure
✅ Backend server with Coinbase Commerce integration
✅ Supabase integration
✅ Wallet authentication
⚠️ Agora integration (needs App ID configuration)
⚠️ Payment flow testing needed