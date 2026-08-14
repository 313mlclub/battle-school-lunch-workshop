from datetime import date

from .errors import ApiError
from .models import MealResponse, School
from .neis import NeisClient


class LunchService:
    def __init__(self, client: NeisClient) -> None:
        self._client = client

    async def search_schools(self, query: str) -> list[School]:
        normalized = query.strip()
        if not normalized:
            raise ApiError(
                "INVALID_QUERY",
                "검색할 학교명을 입력해 주세요.",
                422,
            )
        schools = await self._client.search_schools(normalized)
        return [school.to_internal() for school in schools]

    async def get_lunches(
        self,
        education_office_code: str,
        school_code: str,
        date_from: date,
        date_to: date,
    ) -> MealResponse:
        if date_from > date_to:
            raise ApiError(
                "INVALID_DATE_RANGE",
                "시작일은 종료일보다 늦을 수 없습니다.",
                422,
            )
        rows = await self._client.get_lunches(
            education_office_code,
            school_code,
            date_from.strftime("%Y%m%d"),
            date_to.strftime("%Y%m%d"),
        )
        if rows:
            first = rows[0]
            school = School(
                education_office_code=first.education_office_code,
                education_office_name=first.education_office_name,
                school_code=first.school_code,
                name=first.school_name,
            )
        else:
            school = School(
                education_office_code=education_office_code,
                school_code=school_code,
                name="선택한 학교",
            )
        meals = sorted((row.to_internal() for row in rows), key=lambda meal: meal.date)
        return MealResponse(school=school, meals=meals)
