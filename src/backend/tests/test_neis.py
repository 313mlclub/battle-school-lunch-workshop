from datetime import date

import httpx
import pytest

from app.config import Settings
from app.errors import ApiError
from app.neis import NeisClient


def make_settings(page_size: int = 100) -> Settings:
    return Settings(
        neis_api_key="test-key",
        neis_base_url="https://example.test/hub",
        neis_page_size=page_size,
    )


@pytest.mark.asyncio
async def test_search_schools_merges_pages_and_builds_params() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        page = request.url.params["pIndex"]
        row = {
            "ATPT_OFCDC_SC_CODE": "B10",
            "ATPT_OFCDC_SC_NM": "서울특별시교육청",
            "SD_SCHUL_CODE": f"70{page}",
            "SCHUL_NM": f"테스트학교 {page}",
            "SCHUL_KND_SC_NM": "고등학교",
            "ORG_RDNMA": "서울특별시",
        }
        return httpx.Response(
            200,
            json={
                "schoolInfo": [
                    {
                        "head": [
                            {"list_total_count": 2},
                            {"RESULT": {"CODE": "INFO-000", "MESSAGE": "정상"}},
                        ]
                    },
                    {"row": [row]},
                ]
            },
        )

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
        base_url="https://example.test/hub/",
    ) as http:
        schools = await NeisClient(make_settings(page_size=1), http).search_schools(
            "테스트"
        )

    assert [school.school_code for school in schools] == ["701", "702"]
    assert requests[0].url.params["Key"] == "test-key"
    assert requests[0].url.params["SCHUL_NM"] == "테스트"


@pytest.mark.asyncio
async def test_lunches_normalize_menu_filter_and_date() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "mealServiceDietInfo": [
                    {
                        "head": [
                            {"list_total_count": 2},
                            {"RESULT": {"CODE": "INFO-000", "MESSAGE": "정상"}},
                        ]
                    },
                    {
                        "row": [
                            {
                                "ATPT_OFCDC_SC_CODE": "B10",
                                "SD_SCHUL_CODE": "701",
                                "SCHUL_NM": "테스트학교",
                                "MMEAL_SC_CODE": "2",
                                "MMEAL_SC_NM": "중식",
                                "MLSV_YMD": "20260814",
                                "DDISH_NM": "밥<br/>국\n 김치 ",
                                "MLSV_FGR": 120,
                            },
                            {
                                "ATPT_OFCDC_SC_CODE": "B10",
                                "SD_SCHUL_CODE": "701",
                                "SCHUL_NM": "테스트학교",
                                "MMEAL_SC_CODE": "1",
                                "MMEAL_SC_NM": "조식",
                                "MLSV_YMD": "20260814",
                                "DDISH_NM": "빵",
                            },
                        ]
                    },
                ]
            },
        )

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
        base_url="https://example.test/hub/",
    ) as http:
        meals = await NeisClient(make_settings(), http).get_lunches(
            "B10", "701", "20260814", "20260814"
        )

    assert len(meals) == 1
    assert meals[0].service_date == date(2026, 8, 14)
    assert meals[0].to_internal().menu == ["밥", "국", "김치"]


@pytest.mark.asyncio
async def test_info_200_is_empty_and_rate_limit_is_mapped() -> None:
    responses = iter(
        [
            httpx.Response(
                200,
                json={"RESULT": {"CODE": "INFO-200", "MESSAGE": "데이터 없음"}},
            ),
            httpx.Response(
                200,
                json={"RESULT": {"CODE": "ERROR-333", "MESSAGE": "요청 제한"}},
            ),
        ]
    )

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda _request: next(responses)),
        base_url="https://example.test/hub/",
    ) as http:
        client = NeisClient(make_settings(), http)
        assert await client.search_schools("없는학교") == []
        with pytest.raises(ApiError) as caught:
            await client.search_schools("테스트")

    assert caught.value.code == "NEIS_RATE_LIMITED"
    assert caught.value.status_code == 503
