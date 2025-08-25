require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { RtcTokenBuilder, RtcRole } = require('agora-access-token');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

// API keys
const COINBASE_API_KEY = process.env.COINBASE_API_KEY;
const AGORA_APP_ID = process.env.AGORA_APP_ID;
const AGORA_APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE;

// Generate Agora token endpoint
app.post('/api/agora-token', async (req, res) => {
  try {
    const { channelName, uid, role = 'publisher' } = req.body;
    
    if (!channelName || !uid) {
      return res.status(400).json({ error: 'Channel name and UID are required' });
    }
    
    if (!AGORA_APP_ID || !AGORA_APP_CERTIFICATE) {
      return res.status(500).json({ error: 'Agora credentials not configured' });
    }
    
    // Token expires in 24 hours
    const expirationTimeInSeconds = Math.floor(Date.now() / 1000) + 86400;
    const agoraRole = role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
    
    const token = RtcTokenBuilder.buildTokenWithUid(
      AGORA_APP_ID,
      AGORA_APP_CERTIFICATE,
      channelName,
      uid,
      agoraRole,
      expirationTimeInSeconds
    );
    
    res.json({
      token,
      appId: AGORA_APP_ID,
      channelName,
      uid,
      expirationTime: expirationTimeInSeconds
    });
  } catch (error) {
    console.error('Error generating Agora token:', error);
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

// Room Management Endpoints
// Get room info and stats
app.get('/api/rooms/:tokenAddress', async (req, res) => {
  try {
    const { tokenAddress } = req.params;
    
    // Get active users count for this room
    const { data: activeUsers, error: activeError } = await supabase
      .from('active_users')
      .select('wallet_address, tier, joined_at')
      .eq('room_id', tokenAddress);
    
    if (activeError) throw activeError;
    
    // Get or create room record
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('token_address', tokenAddress)
      .single();
    
    if (roomError && roomError.code !== 'PGRST116') {
      throw roomError;
    }
    
    // If room doesn't exist, create it
    if (!room) {
      const { data: newRoom, error: createError } = await supabase
        .from('rooms')
        .insert({
          token_address: tokenAddress,
          created_at: new Date().toISOString(),
          last_activity: new Date().toISOString(),
          total_users_ever: activeUsers?.length || 0
        })
        .select()
        .single();
      
      if (createError) throw createError;
      
      res.json({
        room: newRoom,
        activeUsers: activeUsers || [],
        activeCount: activeUsers?.length || 0
      });
    } else {
      // Update last activity
      await supabase
        .from('rooms')
        .update({ last_activity: new Date().toISOString() })
        .eq('token_address', tokenAddress);
      
      res.json({
        room,
        activeUsers: activeUsers || [],
        activeCount: activeUsers?.length || 0
      });
    }
  } catch (error) {
    console.error('Error getting room info:', error);
    res.status(500).json({ error: 'Failed to get room info' });
  }
});

// Get list of active rooms
app.get('/api/rooms', async (req, res) => {
  try {
    const { data: rooms, error } = await supabase
      .from('rooms')
      .select(`
        token_address,
        created_at,
        last_activity,
        total_users_ever,
        active_users!inner(count)
      `)
      .order('last_activity', { ascending: false })
      .limit(50);
    
    if (error) throw error;
    
    res.json({ rooms: rooms || [] });
  } catch (error) {
    console.error('Error getting rooms list:', error);
    res.status(500).json({ error: 'Failed to get rooms list' });
  }
});

// Check user subscription status
app.get('/api/user/:walletAddress/subscription', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    
    const { data: user, error } = await supabase
      .from('users')
      .select('tier, payment_status, charge_id, updated_at')
      .eq('wallet_address', walletAddress)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      throw error;
    }
    
    res.json({
      hasSubscription: !!user,
      tier: user?.tier || null,
      paymentStatus: user?.payment_status || null,
      lastUpdated: user?.updated_at || null
    });
  } catch (error) {
    console.error('Error checking subscription:', error);
    res.status(500).json({ error: 'Failed to check subscription' });
  }
});

// Create charge endpoint
app.post('/api/create-charge', async (req, res) => {
  try {
    const { tier, walletAddress } = req.body;
    const price = tier === 'basic' ? '150.00' : '500.00';
    
    const chargeData = {
      name: `DexChat ${tier.charAt(0).toUpperCase() + tier.slice(1)} Tier`,
      description: `Access to DexChat with ${tier === 'basic' ? '100' : '10,000'} users per room`,
      pricing_type: 'fixed_price',
      local_price: {
        amount: price,
        currency: 'USD'
      },
      metadata: {
        walletAddress,
        tier
      }
    };
    
    const response = await fetch('https://api.commerce.coinbase.com/charges/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CC-Api-Key': COINBASE_API_KEY
      },
      body: JSON.stringify(chargeData)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    
    res.json({
      hostedUrl: result.data.hosted_url,
      chargeId: result.data.id
    });
  } catch (error) {
    console.error('Error creating charge:', error);
    res.status(500).json({ error: 'Failed to create charge' });
  }
});

// Simple webhook endpoint (you can add signature verification later if needed)
app.post('/api/webhooks/coinbase', async (req, res) => {
  try {
    const event = req.body;
    
    if (event.type === 'charge:confirmed') {
      const { metadata, id: chargeId } = event.data;
      const { walletAddress, tier } = metadata;
      
      // Update user tier in Supabase
      const { data, error } = await supabase
        .from('users')
        .upsert({
          wallet_address: walletAddress,
          tier: tier,
          charge_id: chargeId,
          payment_status: 'confirmed',
          updated_at: new Date().toISOString()
        });
      
      if (error) throw error;
      
      console.log(`Payment confirmed for user ${walletAddress}, tier: ${tier}`);
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).send('Error');
  }
});

// Simple request logger (visibility in console)
app.use((req, res, next) => {
  console.log(`[DexChat Backend] ${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Basic error handler to surface errors in console and JSON
app.use((err, req, res, next) => {
  console.error('🔴 DexChat backend error:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: err?.message || 'Internal Server Error' });
});

// Public config endpoint (safe to expose anon key)
app.get('/api/public-config', (req, res) => {
  try {
    res.json({
      supabaseUrl: supabaseUrl || null,
      supabaseAnonKey: supabaseAnonKey || null,
    });
  } catch (e) {
    console.error('Error serving public config:', e);
    res.status(500).json({ error: 'Failed to load public config' });
  }
});