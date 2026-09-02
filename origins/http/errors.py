"""Stable public error envelopes shared by every FastAPI router."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from origins.domain.jobs import IdempotencyConflict


@dataclass(slots=True)
class ApiProblem(Exception):
    status: int
    code: str
    message: str
    details: dict | None = None


def error_response(request: Request, status: int, code: str, message: str,
                   details: dict | None = None) -> JSONResponse:
    request_id = getattr(request.state, "request_id", f"req_{uuid.uuid4().hex}")
    return JSONResponse({"error": {"code": code, "message": message,
                                   "details": details or {},
                                   "request_id": request_id}}, status_code=status)


async def problem_handler(request: Request, problem: ApiProblem) -> JSONResponse:
    return error_response(request, problem.status, problem.code, problem.message,
                          problem.details)


async def validation_handler(request: Request,
                             problem: RequestValidationError) -> JSONResponse:
    details = {"fields": [
        {"location": [str(part) for part in error.get("loc", ())],
         "message": error.get("msg", "Invalid value"),
         "type": error.get("type", "value_error")}
        for error in problem.errors()
    ]}
    return error_response(
        request, 422, "validation_error",
        "The request does not match the API contract.", details)


async def idempotency_handler(request: Request,
                              problem: IdempotencyConflict) -> JSONResponse:
    return error_response(request, 409, "idempotency_conflict", str(problem))
