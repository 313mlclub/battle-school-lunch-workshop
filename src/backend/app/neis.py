import math
from collections.abc import Sequence
from typing import Any

import httpx
from pydantic import ValidationError

from .config import Settings
from .errors import ApiError
from .models import NeisHead, NeisMeal, NeisResult, NeisSchool

EMPTY_RESULT_CODES = {"INFO-200"}
AUTH_RESULT_CODES = {"ERROR-290", "ERROR-300", "ERROR-310"}
RATE_LIMIT_RESULT_CODES = {"ERROR-333", "ERROR-336", "ERROR-337"}


class NeisClient:
    def __init__(self, settings: Settings, http_client: httpx.AsyncClient) -> None:
        self._settings = settings
        self._http = http_client

    async def search_schools(self, query: str) -> list[NeisSchool]:
        rows = await self._get_all_pages(
            "schoolInfo",
            "schoolInfo",
            {"SCHUL_NM": query},
        )
        return self._validate_rows(rows, NeisSchool)

    async def get_lunches(
        self,
        education_office_code: str,
        school_code: str,
        date_from: str,
        date_to: str,
    ) -> list[NeisMeal]:
        rows = await self._get_all_pages(
            "mealServiceDietInfo",
            "mealServiceDietInfo",
            {
                "ATPT_OFCDC_SC_CODE": education_office_code,
                "SD_SCHUL_CODE": school_code,
                "MMEAL_SC_CODE": "2",
                "MLSV_FROM_YMD": date_from,
                "MLSV_TO_YMD": date_to,
            },
        )
        meals = self._validate_rows(rows, NeisMeal)
        return [meal for meal in meals if meal.meal_code == "2"]

    async def _get_all_pages(
        self,
        path: str,
        collection_name: str,
        query: dict[str, str],
    ) -> list[dict[str, Any]]:
        first_rows, total = await self._get_page(path, collection_name, query, 1)
        rows = list(first_rows)
        page_count = math.ceil(total / self._settings.neis_page_size)
        for page in range(2, page_count + 1):
            page_rows, _ = await self._get_page(path, collection_name, query, page)
            rows.extend(page_rows)
        return rows

    async def _get_page(
        self,
        path: str,
        collection_name: str,
        query: dict[str, str],
        page: int,
    ) -> tuple[list[dict[str, Any]], int]:
        params = {
            "Key": self._settings.neis_api_key,
            "Type": "json",
            "pIndex": str(page),
            "pSize": str(self._settings.neis_page_size),
            **query,
        }
        try:
            response = await self._http.get(path, params=params)
            response.raise_for_status()
            payload = response.json()
        except httpx.TimeoutException as exc:
            raise ApiError(
                "NEIS_TIMEOUT",
                "급식 정보 서비스 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.",
                503,
            ) from exc
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            if status == 429:
                raise ApiError(
                    "NEIS_RATE_LIMITED",
                    "요청이 많아 잠시 이용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
                    503,
                ) from exc
            raise ApiError(
                "NEIS_UNAVAILABLE",
                "급식 정보 서비스를 일시적으로 이용할 수 없습니다.",
                502,
            ) from exc
        except (httpx.RequestError, ValueError) as exc:
            raise ApiError(
                "NEIS_UNAVAILABLE",
                "급식 정보 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
                502,
            ) from exc

        if not isinstance(payload, dict):
            raise self._schema_error()
        top_level_result = payload.get("RESULT")
        if top_level_result is not None:
            result = self._parse_result(top_level_result)
            if result.code in EMPTY_RESULT_CODES:
                return [], 0
            self._raise_business_error(result)

        collection = payload.get(collection_name)
        if not isinstance(collection, list):
            raise self._schema_error()

        rows: list[dict[str, Any]] = []
        total = 0
        for part in collection:
            if not isinstance(part, dict):
                raise self._schema_error()
            if "head" in part:
                heads = part["head"]
                if not isinstance(heads, list):
                    raise self._schema_error()
                for raw_head in heads:
                    try:
                        head = NeisHead.model_validate(raw_head)
                    except ValidationError as exc:
                        raise self._schema_error() from exc
                    total = head.list_total_count or total
                    if head.result and head.result.code not in {"INFO-000"}:
                        if head.result.code in EMPTY_RESULT_CODES:
                            return [], 0
                        self._raise_business_error(head.result)
            if "row" in part:
                raw_rows = part["row"]
                if not isinstance(raw_rows, list) or not all(
                    isinstance(row, dict) for row in raw_rows
                ):
                    raise self._schema_error()
                rows.extend(raw_rows)
        return rows, total or len(rows)

    @staticmethod
    def _validate_rows(
        rows: Sequence[dict[str, Any]],
        model: type[NeisSchool] | type[NeisMeal],
    ) -> list[Any]:
        try:
            return [model.model_validate(row) for row in rows]
        except ValidationError as exc:
            raise NeisClient._schema_error() from exc

    @staticmethod
    def _parse_result(value: Any) -> NeisResult:
        try:
            return NeisResult.model_validate(value)
        except ValidationError as exc:
            raise NeisClient._schema_error() from exc

    @staticmethod
    def _raise_business_error(result: NeisResult) -> None:
        if result.code in AUTH_RESULT_CODES:
            raise ApiError(
                "NEIS_AUTH_FAILED",
                "급식 정보 서비스 인증에 실패했습니다. 관리자에게 문의해 주세요.",
                502,
            )
        if result.code in RATE_LIMIT_RESULT_CODES:
            raise ApiError(
                "NEIS_RATE_LIMITED",
                "요청이 많아 잠시 이용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
                503,
            )
        raise ApiError(
            "NEIS_ERROR",
            "급식 정보 서비스에서 요청을 처리하지 못했습니다.",
            502,
        )

    @staticmethod
    def _schema_error() -> ApiError:
        return ApiError(
            "NEIS_INVALID_RESPONSE",
            "급식 정보 서비스에서 올바르지 않은 응답을 받았습니다.",
            502,
        )
