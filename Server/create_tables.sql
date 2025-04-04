-- Create fight_results table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.fight_results (
    fight_id TEXT PRIMARY KEY,
    winner TEXT,
    is_completed BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Create prediction_results table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.prediction_results (
    user_id TEXT NOT NULL,
    fight_id TEXT NOT NULL,
    predicted_correctly BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    PRIMARY KEY (user_id, fight_id)
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_fight_results_fight_id ON fight_results(fight_id);
CREATE INDEX IF NOT EXISTS idx_prediction_results_fight_id ON prediction_results(fight_id);
CREATE INDEX IF NOT EXISTS idx_prediction_results_user_id ON prediction_results(user_id); 