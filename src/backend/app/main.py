from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import date
from typing import Annotated

import httpx
from fastapi import Depends, FastAPI, Path, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .config import Settings, get_settings
from .errors import ApiError
from .models import ErrorResponse, MealResponse, School
from .neis import NeisClient
from .service import LunchService

CodePath = Annotated[str, Path(pattern=r"^[A-Za-z0-9]+$", min_length=1, max_length=20)]


def create_app(settings: Settings | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        runtime_settings = settings or get_settings()
        async with httpx.AsyncClient(
            base_url=str(runtime_settings.neis_base_url).rstrip("/") + "/",
            timeout=runtime_settings.neis_timeout_seconds,
        ) as client:
            app.state.service = LunchService(NeisClient(runtime_settings, client))
            yield

    app = FastAPI(
        title="급식 배틀 API",
        version="0.1.0",
        lifespan=lifespan,
    )

    @app.exception_handler(ApiError)
    async def handle_api_error(_request: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=ErrorResponse(code=exc.code, message=exc.message).model_dump(),
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        _request: Request, _exc: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=ErrorResponse(
                code="INVALID_REQUEST",
                message="입력값을 확인해 주세요.",
            ).model_dump(),
        )

    def get_service(request: Request) -> LunchService:
        return request.app.state.service

    @app.get("/health", tags=["system"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get(
        "/api/schools",
        response_model=list[School],
        responses={422: {"model": ErrorResponse}, 502: {"model": ErrorResponse}},
        tags=["schools"],
    )
    async def search_schools(
        query: Annotated[str, Query(min_length=1, max_length=100)],
        service: Annotated[LunchService, Depends(get_service)],
    ) -> list[School]:
        return await service.search_schools(query)

    @app.get(
        "/api/schools/{education_office_code}/{school_code}/meals",
        response_model=MealResponse,
        responses={
            422: {"model": ErrorResponse},
            502: {"model": ErrorResponse},
            503: {"model": ErrorResponse},
        },
        tags=["meals"],
    )
    async def get_meals(
        education_office_code: CodePath,
        school_code: CodePath,
        date_from: Annotated[date, Query(alias="from")],
        date_to: Annotated[date, Query(alias="to")],
        service: Annotated[LunchService, Depends(get_service)],
    ) -> MealResponse:
        return await service.get_lunches(
            education_office_code,
            school_code,
            date_from,
            date_to,
        )

    return app


app = create_app()
