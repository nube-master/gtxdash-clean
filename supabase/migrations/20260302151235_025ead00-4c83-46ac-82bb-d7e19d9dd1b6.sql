
-- Reagendar Pulse 1H para minuto 10, garantindo que o sync horário (minuto 5) já completou
SELECT cron.alter_job(22, schedule := '10 * * * *');
