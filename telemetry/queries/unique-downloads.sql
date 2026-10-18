-- Resolve historical users from the Telegram update stored on the matching trace.
WITH
    arrayFlatten([$platform]) AS selected_platforms,
    $start_timestamp AS start_seconds,
    $end_timestamp AS end_seconds,
    $start_timestamp_nano AS start_nano,
    $end_timestamp_nano AS end_nano,
    greatest(toInt64(start_seconds) - 86400, 0) AS trace_start_seconds,
    __resource_filter AS
    (
        SELECT fingerprint
        FROM signoz_logs.distributed_logs_v2_resource
        WHERE simpleJSONExtractString(labels, 'service.name') = 'ultimate-media-manager'
          AND seen_at_ts_bucket_start BETWEEN greatest(toInt64(start_seconds) - 1800, 0) AND end_seconds
        GROUP BY fingerprint
    ),
    __trace_resource_filter AS
    (
        SELECT fingerprint
        FROM signoz_traces.distributed_traces_v3_resource
        WHERE simpleJSONExtractString(labels, 'service.name') = 'ultimate-media-manager'
          AND seen_at_ts_bucket_start BETWEEN greatest(trace_start_seconds - 1800, 0) AND end_seconds
        GROUP BY fingerprint
    ),
    download_logs AS
    (
        SELECT
            timestamp,
            trace_id,
            attributes_string['platform'] AS platform,
            attributes_string['url'] AS url,
            if(
                mapContains(attributes_number, 'user.id'),
                toUInt64(attributes_number['user.id']),
                toUInt64OrZero(attributes_string['user.id'])
            ) AS direct_user_id
        FROM signoz_logs.distributed_logs_v2
        WHERE resource_fingerprint GLOBAL IN (SELECT fingerprint FROM __resource_filter)
          AND timestamp BETWEEN start_nano AND end_nano
          AND ts_bucket_start BETWEEN greatest(toInt64(start_seconds) - 1800, 0) AND end_seconds
          AND scope_name = 'grammyjs-opentelemetry'
          AND mapContains(attributes_string, 'platform')
          AND mapContains(attributes_string, 'url')
          AND attributes_bool['result'] = true
          AND ('__all__' IN selected_platforms OR attributes_string['platform'] IN selected_platforms)
    ),
    trace_senders AS
    (
        SELECT
            trace_id,
            arrayFirst(
                sender -> sender > 0,
                arrayMap(
                    update_type -> JSONExtractUInt(attributes_string['update.body'], update_type, 'from', 'id'),
                    JSONExtractKeys(attributes_string['update.body'])
                )
            ) AS sender_id
        FROM signoz_traces.distributed_signoz_index_v3
        WHERE resource_fingerprint GLOBAL IN (SELECT fingerprint FROM __trace_resource_filter)
          AND timestamp BETWEEN fromUnixTimestamp64Second(trace_start_seconds)
                            AND fromUnixTimestamp64Nano(end_nano)
          AND ts_bucket_start BETWEEN greatest(trace_start_seconds - 1800, 0) AND end_seconds
          AND mapContains(attributes_string, 'update.body')
          AND trace_id GLOBAL IN (SELECT trace_id FROM download_logs WHERE trace_id != '')
    ),
    trace_users AS
    (
        -- One sender per trace prevents duplicate spans from multiplying downloads.
        -- Exclude ambiguous traces rather than guessing their sender.
        SELECT trace_id, min(sender_id) AS trace_user_id
        FROM trace_senders
        WHERE sender_id > 0
        GROUP BY trace_id
        HAVING uniqExact(sender_id) = 1
    ),
    resolved_downloads AS
    (
        SELECT
            downloads.timestamp AS timestamp,
            downloads.platform AS platform,
            downloads.url AS url,
            downloads.direct_user_id AS direct_user_id,
            if(downloads.direct_user_id > 0, downloads.direct_user_id,
                ifNull(users.trace_user_id, toUInt64(0))) AS user_id
        FROM download_logs AS downloads
        GLOBAL LEFT JOIN trace_users AS users ON downloads.trace_id = users.trace_id
    ),
    bucket_series AS
    (
        SELECT
            dateTrunc($bucket, fromUnixTimestamp64Nano(timestamp)) AS ts,
            if(grouping(platform) = 1, 'TOTAL', platform) AS series,
            toFloat64(uniqExact(user_id, url)) AS value
        FROM resolved_downloads
        WHERE user_id > 0
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
