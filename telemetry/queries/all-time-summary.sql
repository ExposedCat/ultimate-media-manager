-- Resolve historical users from the Telegram update stored on the matching trace.
WITH
    arrayFlatten([$platform]) AS selected_platforms,
    now64(9) AS history_end,
    toUnixTimestamp(history_end) AS end_seconds,
    toUnixTimestamp64Nano(history_end) AS end_nano,
    toInt64(0) AS start_seconds,
    toInt64(0) AS start_nano,
    toInt64(0) AS trace_start_seconds,
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
    bucket_counts AS
    (
        SELECT
            dateTrunc($bucket, fromUnixTimestamp64Nano(timestamp)) AS ts,
            if(grouping(platform) = 1, 'TOTAL', platform) AS platform_group,
            toFloat64(uniqExact(user_id)) AS unique_users,
            toFloat64(uniqExact(user_id, url)) AS unique_downloads
        FROM resolved_downloads
        WHERE user_id > 0
        GROUP BY GROUPING SETS ((ts, platform), (ts))
    )
SELECT
    platform_group AS platform,
    quantileExactInclusive(0.5)(unique_users) AS median_unique_users,
    avg(unique_users) AS average_unique_users,
    quantileExactInclusive(0.5)(unique_downloads) AS median_unique_downloads,
    avg(unique_downloads) AS average_unique_downloads
FROM bucket_counts
GROUP BY platform_group
ORDER BY (platform_group = 'TOTAL') DESC, platform_group ASC
SETTINGS log_comment = 'signoz-writing-clickhouse-queries skill | 2026-10-18';
