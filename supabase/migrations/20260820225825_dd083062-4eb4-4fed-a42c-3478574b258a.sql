DELETE FROM traffic_data WHERE operation_id='8707b3f8-ab41-4a63-902c-9ab97fe50c8a' AND date >= '2026-08-14' AND date <= '2026-08-19';

INSERT INTO traffic_data (
    operation_id, account_id, campaign_name, adset_name, ad_name, status, 
    spend, impressions, clicks, cpc, cpm, ctr, 
    video_3s_views, video_25_percent, video_50_percent, video_75_percent, video_100_percent, thruplays, 
    date, inline_link_clicks, initiate_checkout, landing_page_views, fb_pixel_initiate_checkout, purchase_count, updated_at
) VALUES
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1246531708323610','[TOTAL]','[TOTAL]','[TOTAL]','ACTIVE', 
75.0, 2723, 269, 0, 0, 0, 
0, 0, 0, 0, 0, 0, 
'2026-08-14', 241, 0, 0, 3, 1, NOW());