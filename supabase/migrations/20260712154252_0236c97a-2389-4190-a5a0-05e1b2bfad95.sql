
INSERT INTO _migration_log(phase, step, status, completed_at, metadata)
VALUES ('F8.B.6', 'add_getOperationFromContext', 'completed', NOW(),
        jsonb_build_object('helper','getOperationFromContext',
                          'purpose','resolve op_id from context',
                          'gtx_fallback',true));

INSERT INTO _migration_log(phase, step, table_name, status, completed_at, metadata)
VALUES ('F8.B.6', 'canary_data_health_check', 'data-health-check',
        'completed', NOW(),
        jsonb_build_object('rollout_stage','canary_1',
                          'edge_function','data-health-check',
                          'risk_level','low',
                          'flag_state','ON_for_GTX',
                          'note','probe observability only — never blocks health check'));
