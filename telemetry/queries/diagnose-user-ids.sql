-- Run as a Table panel using the same time range and platform selection.
-- Returns one diagnostic row even when no matching download events exist.
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
    )
SELECT
    count() AS successful_download_events,
    countIf(mapContains(attributes_number, 'user.id')) AS numeric_user_id_events,
    countIf(notEmpty(attributes_string['user.id'])) AS string_user_id_events,
    countIf(
        NOT mapContains(attributes_number, 'user.id')
        AND empty(attributes_string['user.id'])
    ) AS missing_user_id_events
FROM signoz_logs.distributed_logs_v2
WHERE resource_fingerprint GLOBAL IN (
    SELECT fingerprint FROM __resource_filter
)
  AND timestamp BETWEEN $start_timestamp_nano AND $end_timestamp_nano
  AND ts_bucket_start BETWEEN $start_timestamp - 1800 AND $end_timestamp
  AND scope_name = 'grammyjs-opentelemetry'
  AND mapContains(attributes_string, 'platform')
  AND mapContains(attributes_string, 'url')
  AND attributes_bool['result'] = true
  AND (
      '__all__' IN selected_platforms
      OR attributes_string['platform'] IN selected_platforms
  )
SETTINGS log_comment = 'signoz-writing-clickhouse-queries skill | 2026-10-18';
