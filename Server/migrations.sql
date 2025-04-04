-- Create predictions table
CREATE TABLE IF NOT EXISTS public.predictions (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL,
    fight_id TEXT NOT NULL,
    selected_fighter TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Create fight_results table
CREATE TABLE IF NOT EXISTS public.fight_results (
    fight_id TEXT PRIMARY KEY,
    winner TEXT,
    is_completed BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Create prediction_results table
CREATE TABLE IF NOT EXISTS public.prediction_results (
    user_id TEXT NOT NULL,
    fight_id TEXT NOT NULL,
    predicted_correctly BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    PRIMARY KEY (user_id, fight_id)
);

-- Add is_completed column to fight_results table
ALTER TABLE fight_results ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT false; 