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
    dateTrunc(
        $bucket,
        fromUnixTimestamp64Nano(timestamp)
    ) AS ts,
    attributes_string['platform'] AS platform,
    toFloat64(count()) AS value
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
GROUP BY ts, platform
ORDER BY ts ASC, platform ASC
SETTINGS log_comment = 'signoz-writing-clickhouse-queries skill | 2026-10-18';
