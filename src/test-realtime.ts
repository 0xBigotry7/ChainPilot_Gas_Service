import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

console.log('Starting Supabase realtime test...');
console.log(`Supabase URL: ${process.env.SUPABASE_URL}`);
console.log(`Supabase key available: ${!!process.env.SUPABASE_KEY}`);

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_KEY || '',
  {
    auth: { persistSession: false },
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    }
  }
);

// Subscribe to ALL changes on the users table
console.log('Setting up subscription to users table...');

const usersChannel = supabase
  .channel('users-all-changes')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'users'
    },
    (payload) => {
      console.log('Received event:', payload.eventType);
      console.log('Payload:', JSON.stringify(payload, null, 2));
    }
  )
  .subscribe((status) => {
    console.log(`Subscription status: ${status}`);
  });

console.log('Test script running. Now try updating a username in Supabase...');
console.log('Press Ctrl+C to exit');

// Keep the script running
process.stdin.resume(); 