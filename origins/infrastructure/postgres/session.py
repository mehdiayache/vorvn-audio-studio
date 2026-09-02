"""Explicit PostgreSQL transaction boundary for new modules."""

from __future__ import annotations

from contextlib import contextmanager

import psycopg

from origins.config import settings


@contextmanager
def transaction():
    with psycopg.connect(settings.database_url) as connection:
        with connection.cursor() as cursor:
            yield cursor
        connection.commit()


@contextmanager
def read_only():
    with psycopg.connect(settings.database_url) as connection:
        connection.read_only = True
        with connection.cursor() as cursor:
            yield cursor
