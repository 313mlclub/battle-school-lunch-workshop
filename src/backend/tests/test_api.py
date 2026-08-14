from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
import pytest

from app.config import Settings
from app.main import create_app


def settings() -> Settings:
    return Settings(
        neis_api_key="test-key",
        neis_base_url="https://neis.test/hub",
    )


@pytest.mark.asyncio
async def test_school_search_and_meal_flow(monkeypatch: pytest.MonkeyPatch) -> None:
    def neis_handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/schoolInfo"):
            return httpx.Response(
                200,
                json={
                    "schoolInfo": [
                        {
                            "head": [
                                {"list_total_count": 1},
                                {"RESULT": {"CODE": "INFO-000", "MESSAGE": "정상"}},
                            ]
                        },
                        {
                            "row": [
                                {
                                    "ATPT_OFCDC_SC_CODE": "B10",
                                    "ATPT_OFCDC_SC_NM": "서울특별시교육청",
                                    "SD_SCHUL_CODE": "701",
                                    "SCHUL_NM": "테스트학교",
                                    "SCHUL_KND_SC_NM": "고등학교",
                                    "ORG_RDNMA": "서울특별시",
                                }
                            ]
                        },
                    ]
                },
            )
        return httpx.Response(
            200,
            json={
                "mealServiceDietInfo": [
                    {
                        "head": [
                            {"list_total_count": 1},
                            {"RESULT": {"CODE": "INFO-000", "MESSAGE": "정상"}},
                        ]
                    },
                    {
                        "row": [
                            {
                                "ATPT_OFCDC_SC_CODE": "B10",
                                "ATPT_OFCDC_SC_NM": "서울특별시교육청",
                                "SD_SCHUL_CODE": "701",
                                "SCHUL_NM": "테스트학교",
                                "MMEAL_SC_CODE": "2",
                                "MMEAL_SC_NM": "중식",
                                "MLSV_YMD": "20260814",
                                "DDISH_NM": "밥<br/>국",
                            }
                        ]
                    },
                ]
            },
        )

    real_client = httpx.AsyncClient

    @asynccontextmanager
    async def mocked_client(*args: object, **kwargs: object) -> AsyncIterator[httpx.AsyncClient]:
        kwargs["transport"] = httpx.MockTransport(neis_handler)
        async with real_client(*args, **kwargs) as client:
            yield client

    monkeypatch.setattr("app.main.httpx.AsyncClient", mocked_client)
    app = create_app(settings())
    async with app.router.lifespan_context(app):
        async with real_client(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            schools = await client.get("/api/schools", params={"query": "테스트"})
            meals = await client.get(
                "/api/schools/B10/701/meals",
                params={"from": "2026-08-14", "to": "2026-08-14"},
            )

    assert schools.status_code == 200
    assert schools.json()[0]["educationOfficeCode"] == "B10"
    assert meals.status_code == 200
    assert meals.json()["meals"][0]["menu"] == ["밥", "국"]


@pytest.mark.asyncio
async def test_invalid_inputs_use_common_error_model() -> None:
    app = create_app(settings())
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            empty_query = await client.get("/api/schools", params={"query": " "})
            invalid_range = await client.get(
                "/api/schools/B10/701/meals",
                params={"from": "2026-08-15", "to": "2026-08-14"},
            )

    assert empty_query.status_code == 422
    assert empty_query.json()["code"] == "INVALID_QUERY"
    assert invalid_range.status_code == 422
    assert invalid_range.json() == {
        "code": "INVALID_DATE_RANGE",
        "message": "시작일은 종료일보다 늦을 수 없습니다.",
    }
