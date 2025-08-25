-- DexChat Database Schema
-- Run this in your Supabase SQL Editor

-- Enable Row Level Security
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Users table for subscription management
CREATE TABLE IF NOT EXISTS users (
    wallet_address TEXT PRIMARY KEY,
    tier TEXT CHECK (tier IN ('basic', 'premium')),
    charge_id TEXT,
    payment_status TEXT CHECK (payment_status IN ('pending', 'confirmed', 'failed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rooms table for token-based chat rooms
CREATE TABLE IF NOT EXISTS rooms (
    token_address TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_activity TIMESTAMPTZ DEFAULT NOW(),
    total_users_ever INTEGER DEFAULT 0
);

-- Active users table for real-time room capacity tracking
CREATE TABLE IF NOT EXISTS active_users (
    id BIGSERIAL PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES rooms(token_address) ON DELETE CASCADE,
    wallet_address TEXT NOT NULL,
    tier TEXT CHECK (tier IN ('basic', 'premium')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(room_id, wallet_address)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_active_users_room_id ON active_users(room_id);
CREATE INDEX IF NOT EXISTS idx_active_users_wallet ON active_users(wallet_address);
CREATE INDEX IF NOT EXISTS idx_rooms_last_activity ON rooms(last_activity DESC);

-- Enable Realtime for active_users table
ALTER PUBLICATION supabase_realtime ADD TABLE active_users;

-- Row Level Security Policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_users ENABLE ROW LEVEL SECURITY;

-- Allow anonymous users to read/write their own data
CREATE POLICY "Users can manage their own data" ON users
    FOR ALL USING (true);

CREATE POLICY "Anyone can read/write rooms" ON rooms
    FOR ALL USING (true);

CREATE POLICY "Anyone can manage active users" ON active_users
    FOR ALL USING (true);

-- Function to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for users table
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();