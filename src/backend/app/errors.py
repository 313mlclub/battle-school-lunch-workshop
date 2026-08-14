from dataclasses import dataclass


@dataclass(slots=True)
class ApiError(Exception):
    code: str
    message: str
    status_code: int
