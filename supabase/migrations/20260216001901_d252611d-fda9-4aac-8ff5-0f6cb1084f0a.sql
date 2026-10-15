CREATE POLICY "Allow service delete traffic_data"
ON public.traffic_data
FOR DELETE
USING (true);