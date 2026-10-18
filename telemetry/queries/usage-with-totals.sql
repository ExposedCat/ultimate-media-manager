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
    platform_counts AS
    (
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
    ),
    bucket_series AS
    (
        SELECT
            ts,
            if(grouping(platform) = 1, 'TOTAL', platform) AS series,
            toFloat64(sum(value)) AS value
        FROM platform_counts
        GROUP BY GROUPING SETS ((ts, platform), (ts))
    )
-- TOTAL is drawn halfway through its bucket so it forms a separate column.
-- Counts are still aggregated over the same original bucket.
SELECT
    if(
        series = 'TOTAL',
        addSeconds(bucket_series.ts, intDiv(dateDiff('second', bucket_series.ts,
            addDate(bucket_series.ts, toInterval(1, $bucket))), 2)),
        bucket_series.ts
    ) AS ts,
    series AS platform,
    value
FROM bucket_series
ORDER BY ts ASC, (series = 'TOTAL') DESC, series ASC
SETTINGS log_comment = 'signoz-writing-clickhouse-queries skill | 2026-10-18';
