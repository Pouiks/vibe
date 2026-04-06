-- Migration: add muted + last_notified_at to channel_subscriptions
-- Run this in the Supabase SQL Editor

ALTER TABLE public.channel_subscriptions
  ADD COLUMN IF NOT EXISTS muted boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_notified_at timestamptz DEFAULT NULL;
