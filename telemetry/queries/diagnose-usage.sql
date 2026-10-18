-- Run as a Table panel. Always returns one row, including for an empty range.
-- Each count adds another filter from usage.sql; find the first count that is 0.
WITH
    arrayFlatten([$platform]) AS selected_platforms,
    __resource_filter AS
    (
        SELECT fingerprint
        FROM signoz_logs.distributed_logs_v2_resource
        WHERE simpleJSONExtractString(labels, 'service.name') =
              'ultimate-media-manager'
          AND seen_at_ts_bucket_start
              BETWEEN $start_timestamp - 1800 AND $end_timestamp
        GROUP BY fingerprint
    ),
    events AS
    (
        SELECT
            resource_fingerprint GLOBAL IN (
                SELECT fingerprint FROM __resource_filter
            ) AS service_matches,
            scope_name,
            scope_name = 'grammyjs-opentelemetry' AS scope_matches,
            attributes_string['platform'] AS platform,
            mapContains(attributes_string, 'platform')
                AND mapContains(attributes_string, 'url') AS has_download_fields,
            attributes_bool['result'] = true AS succeeded,
            '__all__' IN selected_platforms
                OR attributes_string['platform'] IN selected_platforms AS platform_matches,
            mapContains(attributes_number, 'user.id')
                OR notEmpty(attributes_string['user.id']) AS has_user_id
        FROM signoz_logs.distributed_logs_v2
        WHERE timestamp BETWEEN $start_timestamp_nano AND $end_timestamp_nano
          AND ts_bucket_start BETWEEN $start_timestamp - 1800 AND $end_timestamp
    )
SELECT
    toJSONString(selected_platforms) AS selected_platform_values,
    count() AS logs_in_time_range,
    countIf(service_matches) AS service_logs,
    countIf(service_matches AND scope_matches) AS scope_logs,
    countIf(service_matches AND scope_matches AND has_download_fields) AS download_logs,
    countIf(service_matches AND scope_matches AND has_download_fields AND succeeded)
        AS successful_downloads,
    countIf(service_matches AND scope_matches AND has_download_fields AND succeeded
        AND platform_matches) AS usage_events,
    countIf(service_matches AND scope_matches AND has_download_fields AND succeeded
        AND platform_matches AND has_user_id) AS events_with_direct_user_id,
    groupUniqArrayIf(scope_name, service_matches) AS observed_service_scopes,
    groupUniqArrayIf(platform, service_matches AND scope_matches AND has_download_fields)
        AS observed_platforms
FROM events
SETTINGS log_comment = 'signoz-writing-clickhouse-queries skill | 2026-10-18';
