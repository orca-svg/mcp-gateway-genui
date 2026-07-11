# Public Data Sources and Attribution

The gateway supports explicit `fixture`, `live`, and `mixed` modes. Fixture data
is deterministic research/demo material, not a live government feed or a
guarantee that a benefit is currently available. Every successful public
response carries `dataStatus`; benefit candidates and details also carry
field-level provenance, freshness, and structured links so hosts can direct
users to current official requirements. Checklist and application-guide
responses retain provenance and links but do not duplicate candidate freshness.

Recommendations are discovery candidates, not eligibility decisions. Ranking is
relative relevance, not probability or legal qualification.

## Live source contracts

| Source ID | Official API | Request contract | Response contract | Key |
| --- | --- | --- | --- | --- |
| `youth-center` | 온통청년 `https://www.youthcenter.go.kr/go/ythip/getPlcy` (data.go.kr dataset 15143273) | `apiKeyNm`, `pageNum`, `pageSize`, `pageType=1`, `rtnType=json` | JSON `result.pagging` + `result.youthPolicyList` | `YOUTH_CENTER_API_KEY` only |
| `bokjiro` | 복지로 `https://apis.data.go.kr/B554287/NationalWelfareInformationsV001/NationalWelfarelistV001` | `serviceKey`, `callTp=L`, `pageNo`, `numOfRows`, `srchKeyCode=003` | XML `<wantedList>` with `totalCount`, success `resultCode`, and `servList` | `BOKJIRO_API_KEY` or `DATA_GO_KR_API_KEY` |
| `subsidy24` (legacy runtime ID) | 기획예산처 `https://apis.data.go.kr/1051000/MoefOpenAPI2025/T_OPD_ASBS_PBNS_UNITY` (data.go.kr dataset 15156853) | `serviceKey`, `pageNo`, `numOfRows`, `resultType=json`, current KST `bsnsyear` | JSON `response.header` + `response.body.totalCount` + `response.body.items.item` | `SUBSIDY24_API_KEY` or `DATA_GO_KR_API_KEY` |

`subsidy24` is retained as a runtime source ID and environment-variable prefix
for compatibility. The source is the 기획예산처 national-subsidy open-call
dataset, which can include organization or business applicants; it is not the
행정안전부 보조금24 individual-benefit catalog.

Default requests are restricted to exact HTTPS origins: 온통청년 uses
`https://www.youthcenter.go.kr`; 복지로 and 국고보조금 use
`https://apis.data.go.kr`. Runtime endpoint overrides must retain the source's
exact origin and may not contain credentials, a query, or a fragment.
The corresponding override variables are `YOUTH_CENTER_API_ENDPOINT`,
`BOKJIRO_API_ENDPOINT`, and `SUBSIDY24_API_ENDPOINT`.

Source observation statuses are exactly `ok`, `partial`, `timeout`,
`unavailable`, and `invalid_payload`. A composed live/mixed result sets
`dataStatus.partial=true` whenever any configured source is not `ok`; when no
source succeeds, source-dependent read tools return the stable
`all_sources_failed` MCP error.

Current live adapters intentionally request one bounded first page. When the
declared `totalCount` exceeds the returned item count, the adapter reports
`status=partial` with `errorCode=page_truncated`; it never labels that page as
complete source coverage.

## Attribution and license notes

- 온통청년 records use attribution `온통청년·한국고용정보원`.
- Bokjiro records use attribution `복지로·한국사회보장정보원`.
- National-subsidy open-call records use attribution
  `기획예산처 국고보조금 공모사업 상세`.
- These three API dataset pages currently state `이용허락범위 제한 없음`.
  Fixture records instead identify themselves as deterministic project fixture
  data and must not be presented as a live government feed.

## Fixture source links

| Fixture ID | Benefit | Provider | Official source |
| --- | --- | --- | --- |
| `seoul-youth-rent-support` | 서울 청년 월세 지원 | 서울특별시 | <https://www.gov.kr/portal/service/serviceInfo/611000000119> |
| `national-scholarship` | 국가장학금 | 한국장학재단 | <https://www.gov.kr/portal/service/serviceInfo/B55252900001> |
| `job-seeker-allowance` | 국민취업지원제도 | 고용노동부 | <https://www.gov.kr/portal/service/serviceInfo/149200000001> |

Fixture and live records use `links[]`, not free-form `sourceUrl` or
`applicationUrl` fields. Every link has a relation, official flag, and health;
adapters add verification time/method metadata when available. The default `required-source-link`
consistency rule rejects records without a source relation. Hosts should render
only structured links and should prefer official HTTPS links.

## Data and evidence policy

- Normalize only public, non-identifying fields: titles, providers,
  descriptions, target/qualification prose, periods/deadlines, document labels,
  coarse structured constraints, and public links.
- Never persist service keys, credentials, resident numbers, certificates,
  exact addresses, contact identifiers, private documents, or application IDs.
- Record field-level JSON Pointer provenance, source record/revision, authority,
  observation time, content hash, attribution, and license where available.
- Only explicitly mapped structured fields are `authoritative_structured`.
  Keyword/text inference is `derived_text` and can influence relative ranking
  but never produce a hard conflict.
- A bounded page is reported as `partial`; upstream errors and malformed success
  envelopes are not represented as successful empty results.
- A complete successful ingestion sync may delete missing records for that
  source. Partial/failed syncs never delete previously stored records.

## Canary and human review

The daily canary calls the same production adapter classes with small bounded
pages. It therefore exercises transport safeguards, official envelope parsing,
record mapping, provenance/link construction, and final schema validation—not a
separate top-level-envelope approximation. Missing secrets are neutral; mapping
drift or live failures file a deduplicated issue and fail the canary job.

Before enabling a new source in production, a maintainer should review provider
names, dataset identifiers, source revision, official link origins, and
공공누리/공공데이터 attribution wording against the current official page.
