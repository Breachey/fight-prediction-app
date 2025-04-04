SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_name IN ('predictions', 'fight_results', 'prediction_results') ORDER BY table_name, column_name;
