from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator


class ErrorResponse(BaseModel):
    code: str
    message: str


class School(BaseModel):
    education_office_code: str = Field(serialization_alias="educationOfficeCode")
    school_code: str = Field(serialization_alias="schoolCode")
    name: str
    education_office_name: str | None = Field(
        default=None, serialization_alias="educationOfficeName"
    )
    location: str | None = None
    school_type: str | None = Field(default=None, serialization_alias="schoolType")

    model_config = ConfigDict(serialize_by_alias=True)


class Meal(BaseModel):
    date: date
    meal_type: str = Field(serialization_alias="mealType")
    menu: list[str]
    calories: str | None = None
    nutrition: str | None = None
    origin: str | None = None
    headcount: int | None = None

    model_config = ConfigDict(serialize_by_alias=True)


class MealResponse(BaseModel):
    school: School
    meals: list[Meal]


class NeisResult(BaseModel):
    model_config = ConfigDict(extra="ignore")

    code: str = Field(alias="CODE")
    message: str = Field(alias="MESSAGE")


class NeisHead(BaseModel):
    model_config = ConfigDict(extra="ignore")

    list_total_count: int | None = None
    result: NeisResult | None = Field(default=None, alias="RESULT")


class NeisSchool(BaseModel):
    model_config = ConfigDict(extra="ignore")

    education_office_code: str = Field(alias="ATPT_OFCDC_SC_CODE")
    education_office_name: str | None = Field(
        default=None, alias="ATPT_OFCDC_SC_NM"
    )
    school_code: str = Field(alias="SD_SCHUL_CODE")
    name: str = Field(alias="SCHUL_NM")
    school_type: str | None = Field(default=None, alias="SCHUL_KND_SC_NM")
    location: str | None = Field(default=None, alias="ORG_RDNMA")

    def to_internal(self) -> School:
        return School(
            education_office_code=self.education_office_code,
            school_code=self.school_code,
            name=self.name,
            education_office_name=self.education_office_name,
            location=self.location,
            school_type=self.school_type,
        )


class NeisMeal(BaseModel):
    model_config = ConfigDict(extra="ignore")

    education_office_code: str = Field(alias="ATPT_OFCDC_SC_CODE")
    education_office_name: str | None = Field(
        default=None, alias="ATPT_OFCDC_SC_NM"
    )
    school_code: str = Field(alias="SD_SCHUL_CODE")
    school_name: str = Field(alias="SCHUL_NM")
    meal_code: str = Field(alias="MMEAL_SC_CODE")
    meal_type: str = Field(alias="MMEAL_SC_NM")
    service_date: date = Field(alias="MLSV_YMD")
    menu_text: str = Field(alias="DDISH_NM")
    calories: str | None = Field(default=None, alias="CAL_INFO")
    nutrition: str | None = Field(default=None, alias="NTR_INFO")
    origin: str | None = Field(default=None, alias="ORPLC_INFO")
    headcount: int | None = Field(default=None, alias="MLSV_FGR")

    @field_validator("service_date", mode="before")
    @classmethod
    def parse_service_date(cls, value: Any) -> date:
        if not isinstance(value, str):
            raise ValueError("MLSV_YMD must be a string")
        return datetime.strptime(value, "%Y%m%d").date()

    def to_internal(self) -> Meal:
        normalized = self.menu_text.replace("<br/>", "\n").replace("<br>", "\n")
        menu = [item.strip() for item in normalized.splitlines() if item.strip()]
        return Meal(
            date=self.service_date,
            meal_type=self.meal_type,
            menu=menu,
            calories=self.calories,
            nutrition=self.nutrition,
            origin=self.origin,
            headcount=self.headcount,
        )


def validate_rows(rows: list[dict[str, Any]], model: type[BaseModel]) -> list[BaseModel]:
    try:
        return [model.model_validate(row) for row in rows]
    except ValidationError as exc:
        raise ValueError("NEIS response did not match the documented schema") from exc
