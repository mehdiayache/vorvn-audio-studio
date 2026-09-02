"""Canonical Work lifecycle errors shared across application boundaries."""


class DomainConflict(ValueError):
    """A valid request conflicts with canonical ownership or lifecycle rules."""


class DomainValidation(ValueError):
    """A canonical Work mutation contains an invalid value."""
