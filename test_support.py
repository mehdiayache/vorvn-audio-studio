"""Small shared fakes for provider-boundary seam tests."""


class FakeProviderOperationsRepository:
    def __init__(self):
        self.events: list[tuple] = []

    def reserve_budget(self, job_id, operation, amount, daily_cap):
        self.events.append(("reserve", job_id, operation, amount, daily_cap))
        return "reservation-fixture"

    def begin_attempt(self, job_id, operation, route, payload, reservation_id,
                      estimated_cost=None):
        self.events.append(("begin", job_id, operation, route, payload,
                            reservation_id, estimated_cost))
        return "attempt-fixture"

    def mark_sent(self, attempt_id):
        self.events.append(("sent", attempt_id))

    def finish_attempt(self, attempt_id, status, **values):
        self.events.append(("finish", attempt_id, status, values))

    def record_artifact(self, attempt_id, artifact):
        self.events.append(("artifact", attempt_id, artifact))

    def reconcile_budget(self, job_id, actual_cost, status):
        self.events.append(("reconcile", job_id, actual_cost, status))
