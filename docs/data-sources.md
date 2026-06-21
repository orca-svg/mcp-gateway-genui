# Public Data Sources and Attribution

This gateway currently ships deterministic fixture data for tests, demos, and local development. The fixtures are not a live government data feed and are not a guarantee that a benefit is currently available. Each fixture keeps a `sourceUrl` so users and hosts can verify final requirements on the official source.

Recommendations are candidates, not eligibility decisions, and users must verify final requirements on the official source.

## Official source coverage

| Fixture id | Benefit | Provider | Dataset / official page | License / attribution requirements | `sourceUrl` |
| --- | --- | --- | --- | --- | --- |
| `seoul-youth-rent-support` | 서울 청년 월세 지원 | 서울특별시 | 정부24 서비스 정보 `611000000119` | 공공누리/공공데이터 출처표시 대상. Attribute the provider and official service page when reusing or presenting data. | <https://www.gov.kr/portal/service/serviceInfo/611000000119> |
| `national-scholarship` | 국가장학금 | 한국장학재단 | 정부24 서비스 정보 `B55252900001`; applications are handled by 한국장학재단 | 공공누리/공공데이터 출처표시 대상. Attribute the provider, 정부24 service page, and 한국장학재단 application path when presenting data. | <https://www.gov.kr/portal/service/serviceInfo/B55252900001> |
| `job-seeker-allowance` | 국민취업지원제도 | 고용노동부 | 정부24 서비스 정보 `149200000001`; applications are handled by 국민취업지원제도 | 공공누리/공공데이터 출처표시 대상. Attribute the provider and official service page when reusing or presenting data. | <https://www.gov.kr/portal/service/serviceInfo/149200000001> |

## Adapter/source URL expectations

- Live adapters currently cover 온통청년, 복지로, and 보조금24-style public service APIs. They require runtime data.go.kr/service keys only (`YOUTH_CENTER_API_KEY`, `BOKJIRO_API_KEY`, `SUBSIDY24_API_KEY`) and fixture tests must remain CI-safe without live keys.
- Adapters may normalize only public, non-identifying fields into `BenefitRecord`s: service titles, public provider names, public descriptions, target/eligibility text, application periods/deadlines, public source/application URLs, region/age/household/category signals, and document labels. Never persist service keys, login credentials, resident numbers, certificates, or application identifiers.
- Every officially supported benefit record must populate `sourceUrl` with an official public page, not a secondary blog or generated summary.
- The consistency rule `required-source-url` treats a missing `sourceUrl` as an error.
- Hosts should display or link the `sourceUrl` whenever they present recommendation details so users can verify final eligibility, deadlines, and application steps directly with the provider.

## Human review note

Attribution wording is legal-adjacent. Before production promotion or merge of new official sources, a human maintainer should review provider names, dataset identifiers, and 공공누리/공공데이터 attribution wording against the current official pages.
