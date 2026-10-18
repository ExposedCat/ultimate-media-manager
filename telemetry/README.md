# Telemetry queries

Copy these ClickHouse SQL files into SigNoz dashboard panels. They query
`signoz_logs.distributed_logs_v2` for successful downloads from
`ultimate-media-manager`, using the `grammyjs-opentelemetry` scope.

The queries are installed on the
[Ultimate Media Manager dashboard](http://server.local:8082/dashboard/01a04a16-1386-7c1d-8778-8a891644d2b9).
The three charts, combined All-time Usage Details table, and Historical User
Coverage diagnostic use the SQL saved here. Each chart has paired columns: a
platform breakdown on the left and a true TOTAL on the right. The summary table
displays two decimal places and puts its recomputed TOTAL row first.

| Query | Panel | Result |
| --- | --- | --- |
| [Usage with totals](queries/usage-with-totals.sql) | Timeseries | Successful download events per bucket, shown as platform breakdown plus a separate total column. |
| [Unique users](queries/unique-users.sql) | Timeseries | Distinct requesting Telegram users per bucket and platform, plus a deduplicated total. |
| [Unique downloads](queries/unique-downloads.sql) | Timeseries | Distinct `(user.id, url)` pairs per bucket and platform, plus a deduplicated total. |
| [All-time summary](queries/all-time-summary.sql) | Table | Median and average bucket counts for unique users and downloads, per platform and TOTAL. |

The original supplied [Usage query](queries/usage.sql) is retained separately.
[Users by platform](queries/unique-users-by-platform.sql) and
[downloads by platform](queries/unique-downloads-by-platform.sql) provide the
breakdowns without a total or plotting offset.

## Paired columns

Set each chart to **Bar Chart**, enable **Stack Series**, and set the query's
legend format to `{{platform}}`. Platform rows retain the bucket-start timestamp;
TOTAL rows are drawn halfway through that bucket. These different plotting
positions produce two columns instead of adding TOTAL into the platform stack.
For a daily bucket, the total is plotted at noon, but it covers the same whole
calendar day as the platform column. This timestamp is a display offset, not the
time a download occurred. A current partial bucket's total may be positioned
later than the current time; the numbers still count only events up to the
selected range end. Use a range that shows the whole current bucket when needed.
The SQL also supports the dashboard's minute, hour, week, month, and year buckets.

The left-hand user stack is **not** a count of distinct people across platforms:
one user may appear in several segments. Read the right-hand TOTAL for the true
deduplicated user count. Download totals similarly deduplicate `(user, URL)` pairs
across the selected platforms; event totals simply count every success.

## Dashboard variables

- `$platform`: multi-select platform values, with `__all__` selecting every platform.
- `$bucket`: a quoted `dateTrunc` unit, such as `'hour'`, `'day'`, `'week'`, or
  `'month'`. The same bucket controls the timeseries and all-time statistics. Use `'day'`
  for daily medians and averages.
- `$start_timestamp`, `$end_timestamp`: SigNoz time-picker boundaries in seconds.
- `$start_timestamp_nano`, `$end_timestamp_nano`: the same boundaries in nanoseconds.

The three timeseries queries respect the time picker and return `(ts, platform,
value)`. The all-time summary ignores both time-picker boundaries and scans all
retained history up to query execution time. It still respects `$platform` and
`$bucket`. Expired telemetry cannot contribute to all-time statistics.

## Counting rules

Unique users count the requesting Telegram sender. Unique downloads count distinct
`(sender ID, exact emitted URL)` pairs. Repeated successful downloads of one URL by
one user count once within a bucket; two users downloading that URL count twice.
Different URL strings count separately. The same user or pair can count again in
a later bucket or another platform.

The unique queries and combined all-time query resolve the sender in two ways:

1. Use `user.id` directly if it is present in a download log, accepting either a
   numeric or string attribute.
2. Otherwise join that log's `trace_id` to a retained span in
   `signoz_traces.distributed_signoz_index_v3`. The telemetry library records the
   Telegram update in `attributes_string['update.body']`; the query extracts
   `from.id` from its top-level update payload (for example, `message` or
   `inline_query`).

**Historical queries do not require an app change or a new deployment.** Missing
`user.id` in a log does not mean its sender cannot be recovered from its trace.
Both the log and a matching trace with the update body must still be retained.
Events whose sender cannot be resolved are excluded from unique counts. Multiple
spans for one trace are reduced to one sender; traces with conflicting sender IDs
are excluded from the fallback rather than assigned an arbitrary user.

Timeseries queries look for traces starting up to one day before the selected
range, so downloads completing after the range starts can still match their
updates. An update that started earlier than that lookback will not match. The
all-time query scans all retained history without this lookback limit. Trace
lookup is restricted to the selected download trace IDs; the resulting sender
lookup is broadcast with `GLOBAL LEFT JOIN` for cross-shard matches. Large
all-time queries can therefore scan more data and use more memory than Usage.

The summary computes unique counts for each `(bucket, platform)` and also for
each bucket across all selected platforms, then takes their mean and median. The
TOTAL row is recomputed from underlying events, not obtained by adding platform
medians, averages, or distinct counts. Like the original Usage query,
only buckets containing eligible events contribute: gaps are not filled with
zeros. The first retained bucket and the current bucket may be partial. These
statistics are bucket counts, not lifetime distinct totals. Median uses
[`quantileExactInclusive(0.5)`](https://clickhouse.com/docs/reference/functions/aggregate-functions/quantileExactInclusive),
which averages the two middle counts when the number of buckets is even.

For example, `median_unique_downloads = 44` for Instagram with `bucket = day`
means the median **active day** had 44 distinct `(user, URL)` pairs across all
users combined. It does not mean 44 per user, 44 different Instagram posts, or
44 video files: URLs can represent other media, and two users requesting one
URL count as two pairs. Usage can look similar to unique downloads when repeat
requests by the same user for the same URL are uncommon.

## Troubleshooting no data

Run [diagnose-usage.sql](queries/diagnose-usage.sql) in a **Table** panel with the
same time range and `$platform` selection. It returns one row even when no logs
match. Find the first count that drops to zero:

- `logs_in_time_range`: no logs match the timestamp and storage-bucket bounds.
- `service_logs`: no matching service fingerprints in the resource lookup.
- `scope_logs`: the logs do not use the expected instrumentation scope; compare
  `observed_service_scopes`.
- `download_logs`: the platform or URL attributes are absent.
- `successful_downloads`: no matching events have boolean `result = true`.
- `usage_events`: the platform selection excludes the events; compare
  `selected_platform_values` and `observed_platforms`.
- `events_with_direct_user_id`: direct user IDs in the matching logs. Zero here
  does not rule out historical sender recovery from traces.

If `usage_events` is positive but Usage shows no data, check the panel setup:
Usage needs a Timeseries panel with `ts` as time, `platform` as the series label,
and `value` as the numeric value. The combined all-time details query needs a
Table panel; its four numeric columns are not a single `value` timeseries.

[diagnose-user-ids.sql](queries/diagnose-user-ids.sql) provides a narrower breakdown
of eligible download events with numeric, string, or missing user IDs.

For historical coverage, run
[diagnose-historical-users.sql](queries/diagnose-historical-users.sql) as a Table
panel with the same range and platform selection. `events_resolved_from_traces`
counts download logs whose sender was recovered from traces, `unique_eligible_events`
counts all usable events, and `unresolved_events` counts events missing an identity
after both methods. This is the relevant diagnostic when direct user IDs are absent.
If every event is unresolved, check trace retention and whether matching spans
contain `update.body`; the original Usage count remains independent of trace coverage.

## Live verification

Verified on 2026-10-18 against the deployed ClickHouse 25.12.5 instance, then run
and saved through SigNoz's panel editor. The all-history coverage check matched
all 1,709 retained successful events (2026-10-03 through 2026-10-18) to users via
traces, with zero unresolved events and no direct log user IDs. Both unique
charts and the ten-platform summary returned data in SigNoz. No bot deployment
or telemetry changes were needed.

The paired-column revision was also validated against the live server and in
SigNoz. Cross-platform user totals are smaller than sums of platform counts
where users overlap (for example, 22 people versus 25 platform memberships on
2026-10-03). The daily all-time TOTAL row returned a median of 26.5 users and 110
unique `(user, URL)` pairs at validation time; values can change as events arrive.
