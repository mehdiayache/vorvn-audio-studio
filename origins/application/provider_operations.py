"""Budget authorization and durable evidence for meaningful provider calls."""

from __future__ import annotations

from typing import Protocol


def enforce_daily_cap(estimate: float, preferences: dict,
                      committed_spend: float) -> None:
    """Shared pre-call rule for paths without a durable reservation yet."""
    cap = float(preferences.get("daily_cap") or 0)
    if cap > 0 and committed_spend + max(0.0, estimate) > cap:
        raise PermissionError(
            f"Daily cap reached (${committed_spend:.4f} already committed).")


class ProviderOperationRepository(Protocol):
    def reserve_budget(self, job_id: int, operation: str, amount: float,
                       daily_cap: float) -> str: ...
    def begin_attempt(self, job_id: int, operation: str, route: dict,
                      payload: dict, reservation_id: str | None,
                      estimated_cost: float | None = None) -> str: ...
    def mark_sent(self, attempt_id: str,
                  provider_request_id: str | None = None) -> None: ...
    def attempt_for_job(self, job_id: int, operation: str) -> dict | None: ...
    def record_callback(self, provider: str, provider_request_id: str,
                        payload: dict, *, attempt_id: str | None = None) -> bool: ...
    def record_provider_result(self, attempt_id: str, *, cost: float,
                               usage: dict, receipt: dict) -> None: ...
    def finish_attempt(self, attempt_id: str, status: str, *, cost: float,
                       usage: dict, request_ids: list[str], error: dict,
                       receipt: dict | None = None,
                       reconcile_budget: bool = True) -> None: ...
    def record_artifact(self, attempt_id: str, artifact: dict) -> None: ...
    def reconcile_budget(self, job_id: int, actual_cost: float,
                         status: str) -> None: ...


class ProviderOperationService:
    def __init__(self, repository: ProviderOperationRepository):
        self.repository = repository

    def authorize(self, job_id: int, operation: str, estimate: float,
                  preferences: dict, confirmed: bool) -> str:
        warning = float(preferences.get("warn_above") or 0)
        if warning > 0 and estimate > warning and not confirmed:
            raise PermissionError(
                f"This paid operation needs confirmation (about ${estimate:.4f}).")
        return self.repository.reserve_budget(
            job_id, operation, estimate,
            float(preferences.get("daily_cap") or 0))

    @staticmethod
    def failure_status(error: Exception) -> str:
        """Conservatively classify a failure after the request was sent."""
        if isinstance(error, (ValueError, PermissionError)):
            return "definitive_failed"
        message = str(error).casefold()
        definitive = ("400", "401", "403", "404", "invalid_parameter",
                      "unsupported", "not supported", "rejected")
        return ("definitive_failed" if any(item in message for item in definitive)
                else "ambiguous")
