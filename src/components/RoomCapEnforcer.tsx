import React, { useState, useEffect, ReactNode } from 'react';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = 'https://oewpvlwuzuacjgihpjng.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ld3B2bHd1enVhY2pnaWhwam5nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAxODU2NjUsImV4cCI6MjA2NTc2MTY2NX0.9rKI_BjfoyIiTpZ0o4PhlwjbY6wUIUZWiEavOnfnAEw';
const supabase = createClient(supabaseUrl, supabaseKey);

interface RoomCapEnforcerProps {
  tier: string;
  children: ReactNode;
}

export const RoomCapEnforcer: React.FC<RoomCapEnforcerProps> = ({ tier, children }) => {
  const [isCheckingCap, setIsCheckingCap] = useState<boolean>(true);
  const [isCapReached, setIsCapReached] = useState<boolean>(false);
  const [activeUsers, setActiveUsers] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  
  // Get current room ID based on URL
  const getRoomId = (): string => {
    // Extract token address from URL
    const match = window.location.href.match(/dexscreener\.com\/solana\/(\w+)/);
    return match ? match[1] : 'default';
  };
  
  const roomId = getRoomId();
  const maxUsers = tier === 'basic' ? 100 : 10000;
  
  // Check if room has reached its capacity
  useEffect(() => {
    const checkRoomCapacity = async () => {
      try {
        setIsCheckingCap(true);
        
        // Get wallet address from local storage
        const walletAddress = localStorage.getItem('dexchat-wallet');
        if (!walletAddress) {
          throw new Error('Wallet not connected. Please reconnect your wallet.');
        }
        
        // Check if user is already in the room
        const { data: existingUser, error: existingError } = await supabase
          .from('active_users')
          .select('id')
          .eq('room_id', roomId)
          .eq('wallet_address', walletAddress)
          .single();
        
        if (existingError && existingError.code !== 'PGRST116') { // PGRST116 is "not found"
          throw existingError;
        }
        
        if (!existingUser) {
          // Count active users in the room
          const { data: activeUsersData, error: countError } = await supabase
            .from('active_users')
            .select('id', { count: 'exact' })
            .eq('room_id', roomId);
          
          if (countError) throw countError;
          
          const count = activeUsersData?.length || 0;
          setActiveUsers(count);
          
          // Check if room is at capacity
          if (count >= maxUsers) {
            setIsCapReached(true);
            return;
          }
          
          // Add user to the room
          const { error: insertError } = await supabase
            .from('active_users')
            .insert({
              room_id: roomId,
              wallet_address: walletAddress,
              tier: tier,
              joined_at: new Date().toISOString()
            });
          
          if (insertError) throw insertError;
          
          // Set up cleanup on component unmount
          window.addEventListener('beforeunload', removeUserFromRoom);
        }
        
        // Subscribe to active users count changes
        const subscription = supabase
          .channel(`room:${roomId}`)
          .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'active_users',
            filter: `room_id=eq.${roomId}`
          }, payload => {
            // Update active users count
            checkRoomCapacity();
          })
          .subscribe();
        
        return () => {
          subscription.unsubscribe();
          window.removeEventListener('beforeunload', removeUserFromRoom);
          removeUserFromRoom();
        };
      } catch (error) {
        console.error('Error checking room capacity:', error);
        setError('Failed to check room capacity. Please try again.');
      } finally {
        setIsCheckingCap(false);
      }
    };
    
    const removeUserFromRoom = async () => {
      try {
        const walletAddress = localStorage.getItem('dexchat-wallet');
        if (walletAddress) {
          await supabase
            .from('active_users')
            .delete()
            .eq('room_id', roomId)
            .eq('wallet_address', walletAddress);
        }
      } catch (error) {
        console.error('Error removing user from room:', error);
      }
    };
    
    checkRoomCapacity();
    
    return () => {
      window.removeEventListener('beforeunload', removeUserFromRoom);
      removeUserFromRoom();
    };
  }, [roomId, tier, maxUsers]);
  
  if (isCheckingCap) {
    return <div className="dexchat-loading">Checking room capacity...</div>;
  }
  
  if (isCapReached) {
    return (
      <div className="dexchat-cap-reached">
        <h3>Room at Capacity</h3>
        <p>This room has reached its maximum capacity of {maxUsers} users.</p>
        <p>Please try again later or upgrade to a higher tier.</p>
      </div>
    );
  }
  
  if (error) {
    return <div className="dexchat-error">{error}</div>;
  }
  
  return (
    <div className="dexchat-room">
      <div className="dexchat-room-info">
        <span className="dexchat-active-users">{activeUsers} active users</span>
        <span className="dexchat-tier-badge">{tier.charAt(0).toUpperCase() + tier.slice(1)} Tier</span>
      </div>
      {children}
    </div>
  );
};