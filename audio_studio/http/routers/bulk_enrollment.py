"""Minimal explicit bulk-enrollment contract; large campaign UI is later."""

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from typing import Any

from audio_studio.composition.bulk_enrollment import bulk_enrollment_service
from audio_studio.http.errors import ApiProblem


router = APIRouter(prefix="/api/v1", tags=["voices"])


class EnrollmentSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    identity_id: str = Field(min_length=1, max_length=120)
    reference_id: str = Field(min_length=1, max_length=120)
    documented: bool = False


class BulkEnrollmentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    provider_model_id: str = Field(min_length=1, max_length=300)
    selections: list[EnrollmentSelection] = Field(min_length=1, max_length=1000)
    confirmed: bool = False


class BulkEnrollmentEnvelope(BaseModel):
    data: dict[str, Any]


class RetryEnrollmentItemsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    item_ids: list[str] = Field(min_length=1, max_length=1000)


def _run(payload: BulkEnrollmentRequest, create: bool) -> dict:
    selections = [item.model_dump() for item in payload.selections]
    try:
        result = (bulk_enrollment_service.create(payload.provider_model_id, selections,
                                 payload.confirmed) if create else
                  bulk_enrollment_service.preflight(payload.provider_model_id, selections))
    except LookupError as exc:
        raise ApiProblem(404, "provider_model_not_found", str(exc)) from exc
    except ValueError as exc:
        raise ApiProblem(400, "invalid_enrollment_campaign", str(exc)) from exc
    return {"data": result}


@router.post("/enrollment-campaigns/preflight",
             operation_id="preflightEnrollmentCampaign",
             response_model=BulkEnrollmentEnvelope)
def preflight(payload: BulkEnrollmentRequest) -> dict:
    return _run(payload, False)


@router.post("/enrollment-campaigns", operation_id="createEnrollmentCampaign",
             status_code=202, response_model=BulkEnrollmentEnvelope)
def create(payload: BulkEnrollmentRequest) -> dict:
    return _run(payload, True)


@router.get("/enrollment-campaigns/{campaign_id}",
            operation_id="getEnrollmentCampaign",
            response_model=BulkEnrollmentEnvelope)
def get_campaign(campaign_id: str) -> dict:
    try:
        return {"data": bulk_enrollment_service.get(campaign_id)}
    except LookupError as exc:
        raise ApiProblem(404, "enrollment_campaign_not_found", str(exc)) from exc


@router.post("/enrollment-campaigns/{campaign_id}/cancel",
             operation_id="cancelEnrollmentCampaign",
             response_model=BulkEnrollmentEnvelope)
def cancel_campaign(campaign_id: str) -> dict:
    try:
        return {"data": bulk_enrollment_service.cancel(campaign_id)}
    except LookupError as exc:
        raise ApiProblem(404, "enrollment_campaign_not_found", str(exc)) from exc


@router.post("/enrollment-campaigns/{campaign_id}/retry",
             operation_id="retryEnrollmentCampaignItems",
             response_model=BulkEnrollmentEnvelope)
def retry_campaign_items(campaign_id: str,
                         payload: RetryEnrollmentItemsRequest) -> dict:
    try:
        return {"data": bulk_enrollment_service.retry(
            campaign_id, payload.item_ids)}
    except LookupError as exc:
        raise ApiProblem(404, "enrollment_campaign_not_found", str(exc)) from exc
    except ValueError as exc:
        raise ApiProblem(409, "campaign_items_not_retryable", str(exc)) from exc
